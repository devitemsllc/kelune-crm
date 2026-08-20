<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Core\CronLock;
use KeluneCRM\Handlers\AutomationExecutor;
use KeluneCRM\Handlers\CleanupHandler;

/**
 * Single entry point for draining the plugin's background queues, reachable
 * three ways: the every-minute WP-Cron events (guaranteed fallback), the Cron
 * Monitor "Run Now" button, and a non-blocking loopback request to a light
 * admin-ajax endpoint ({@see self::handleAjax()}) fired as soon as work is
 * queued — WP-Cron alone only fires on traffic, once a minute.
 *
 * All three converge on {@see self::runTask()} under a cross-process lock
 * ({@see CronLock}) so only one drainer runs a queue at a time. That plus the
 * atomic per-row claim in each drainer closes every duplicate-processing race.
 */
final class QueueRunner
{
    /** Queues this runner knows how to drain. */
    private const TASKS = ['automations', 'campaign_queue'];

    /** admin-ajax action backing the loopback light endpoint. */
    private const AJAX_ACTION = 'kelune_crm_run_queue';

    /** Option holding the shared secret that authorises the light endpoint. */
    private const TOKEN_OPTION = 'kelune_crm_cron_token';

    /**
     * Seconds a drain lock is held before it is treated as abandoned. Refreshed
     * after every pass, so it only has to cover one pass on a slow SMTP host.
     * The lock is an efficiency guard only — the atomic per-row claim is what
     * prevents duplicate processing, even if the TTL is blown.
     */
    private const LOCK_TTL = 120;

    /** Wall-clock budget for a single drain run before it hands off / rechains. */
    private const BUDGET_SECONDS = 20;

    /** Rows drained per pass. */
    private const AUTOMATION_BATCH = 50;
    private const CAMPAIGN_BATCH = 100;

    /** Minimum gap between externally-requested loopback kicks for one task. */
    private const KICK_DEBOUNCE = 8;

    /** Minimum gap between opportunistic stale-claim recovery sweeps per task. */
    private const RECOVER_INTERVAL = 120;

    /** Fraction of the PHP memory limit at which a drain loop stops early. */
    private const MEMORY_CEILING = 0.75;

    /**
     * Wire the cron hooks and the light endpoint. Called once at bootstrap.
     */
    public static function registerHooks(): void
    {
        // WP-Cron (and the Cron Monitor "Run Now") drain the queues through here.
        add_action('kelune_crm_process_automations', [self::class, 'runAutomations']);
        add_action('kelune_crm_process_campaign_queue', [self::class, 'runCampaignQueue']);

        // The loopback light endpoint. nopriv because the continuation request
        // carries no login cookie; it is authorised by the shared secret token
        // in handleAjax(), not by a nonce/capability.
        add_action('wp_ajax_' . self::AJAX_ACTION, [self::class, 'handleAjax']);
        add_action('wp_ajax_nopriv_' . self::AJAX_ACTION, [self::class, 'handleAjax']);
    }

    /**
     * Cron/callback entry for the automation queue.
     */
    public static function runAutomations(): void
    {
        self::runTask('automations');
    }

    /**
     * Cron/callback entry for the campaign send queue.
     */
    public static function runCampaignQueue(): void
    {
        self::runTask('campaign_queue');
    }

    /**
     * Drain a queue under lock, then continue via loopback if work remains.
     */
    public static function runTask(string $task): void
    {
        $task = sanitize_key($task);

        if (!in_array($task, self::TASKS, true)) {
            return;
        }

        $lock = 'queue_' . $task;

        // Loser of the race bails here — one drainer per queue at a time.
        if (!CronLock::acquire($lock, self::LOCK_TTL)) {
            return;
        }

        // Web requests are often capped at 30s; give the run its budget plus
        // slack (the loop still stops itself at BUDGET_SECONDS). Raise only —
        // 0 means unlimited, and lowering would shorten the run this lengthens.
        if (function_exists('set_time_limit') && function_exists('ini_get')) {
            $current = (int) ini_get('max_execution_time');
            $executionBudget = self::BUDGET_SECONDS + 30;

            if ($current > 0 && $current < $executionBudget) {
                // phpcs:ignore Squiz.PHP.DiscouragedFunctions.Discouraged, WordPress.PHP.NoSilencedErrors.Discouraged -- Best-effort budget extension for the drain loop; guarded by function_exists and safe to fail silently.
                @set_time_limit($executionBudget);
            }
        }

        $has_more = false;

        try {
            self::maybeRecoverStalled($task);

            [$drain, $finalize] = self::driver($task);

            $deadline = time() + self::BUDGET_SECONDS;

            do {
                // Stop before the host kills the request for memory; the leftover
                // is recovered on the next pass/tick.
                if (self::memoryExceeded()) {
                    $has_more = true;
                    break;
                }

                $has_more = (bool) $drain();
                CronLock::refresh($lock);
            } while ($has_more && time() < $deadline);

            if ($finalize !== null) {
                $finalize();
            }
        } finally {
            // Release before rechaining so the continuation can claim the lock.
            CronLock::release($lock);
        }

        // More to do and we only stopped because the budget ran out — keep the
        // chain alive immediately instead of waiting for the next cron minute.
        if ($has_more) {
            self::dispatch($task);
        }
    }

    /**
     * The per-task drain and finalize callbacks.
     *
     * @return array{0: callable(): bool, 1: (callable(): void)|null}
     */
    private static function driver(string $task): array
    {
        if ($task === 'automations') {
            $executor = new AutomationExecutor();

            return [
                static fn (): bool => (bool) ($executor->processQueue(self::AUTOMATION_BATCH)['has_more'] ?? false),
                null,
            ];
        }

        // campaign_queue
        $emailService = new EmailService();
        $scheduler = new CampaignScheduler();

        return [
            static fn (): bool => (bool) $emailService->processQueue(self::CAMPAIGN_BATCH)['has_more'],
            static function () use ($scheduler): void {
                $scheduler->finalizeCampaignSends();
            },
        ];
    }

    /**
     * Ask the drainer to run soon via a non-blocking loopback, debounced so a
     * burst of triggers (e.g. bulk enrolment) fires at most one request per
     * window. The running drainer holds the lock and rechains itself anyway, so
     * dropping the extra kicks loses nothing.
     */
    public static function kick(string $task): void
    {
        $task = sanitize_key($task);

        if (!in_array($task, self::TASKS, true)) {
            return;
        }

        $key = 'kelune_crm_kick_' . $task;
        $last = (int) get_option($key, 0);

        if ($last && (time() - $last) < self::KICK_DEBOUNCE) {
            return;
        }

        update_option($key, time(), false);

        self::dispatch($task);
    }

    /**
     * The light endpoint, authorised by the shared secret token — a loopback
     * request carries no login session, so a nonce is not available. Runs the
     * drain synchronously; the caller fired non-blocking and is not waiting.
     */
    public static function handleAjax(): void
    {
        nocache_headers();

        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Public loopback endpoint; authorised by the shared-secret token compared below, not a nonce (the request carries no login session).
        $token = isset($_REQUEST['token']) ? sanitize_text_field(wp_unslash($_REQUEST['token'])) : '';

        if ($token === '' || !hash_equals(self::token(), $token)) {
            wp_send_json_error(['message' => 'forbidden'], 403);
        }

        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- See token check above.
        $task = isset($_REQUEST['task']) ? sanitize_key(wp_unslash($_REQUEST['task'])) : '';

        if (!in_array($task, self::TASKS, true)) {
            wp_send_json_error(['message' => 'unknown task'], 400);
        }

        self::runTask($task);

        wp_send_json_success(['task' => $task, 'timestamp' => time()]);
    }

    /**
     * Fire the non-blocking loopback request to the light endpoint. If the site
     * cannot reach its own loopback the request just fails and WP-Cron drains on
     * its next tick — the loopback only ever accelerates.
     */
    private static function dispatch(string $task): void
    {
        $url = add_query_arg(
            [
                'action' => self::AJAX_ACTION,
                'task'   => $task,
                'token'  => self::token(),
                't'      => time(),
            ],
            admin_url('admin-ajax.php')
        );

        // Local/self-signed loopbacks often fail TLS verification; this is a
        // request to our own site, so relax it (mirrors WP core's own cron spawn).
        add_filter('https_local_ssl_verify', '__return_false');

        wp_remote_post(
            $url,
            [
                'blocking'  => false,
                'timeout'   => 1,
                'sslverify' => false,
                'cookies'   => [],
                'body'      => ['task' => $task],
            ]
        );

        remove_filter('https_local_ssl_verify', '__return_false');
    }

    /**
     * Return rows abandoned mid-claim (a worker that died in a prior run) to
     * their queue, so they are not stranded until the daily cleanup. Time-gated
     * so it runs at most once per RECOVER_INTERVAL, and only inside the lock.
     */
    private static function maybeRecoverStalled(string $task): void
    {
        $key = 'kelune_crm_recover_' . $task;
        $last = (int) get_option($key, 0);

        if ($last && (time() - $last) < self::RECOVER_INTERVAL) {
            return;
        }

        update_option($key, time(), false);

        $cleanup = new CleanupHandler();

        if ($task === 'automations') {
            $cleanup->recoverStalledAutomationSteps();

            return;
        }

        $cleanup->recoverStalledCampaignEmails();
    }

    /**
     * The shared secret authorising the light endpoint, generated on first use.
     */
    private static function token(): string
    {
        $token = get_option(self::TOKEN_OPTION);

        if (!is_string($token) || $token === '') {
            $token = wp_generate_password(40, false);
            update_option(self::TOKEN_OPTION, $token, false);
        }

        return $token;
    }

    /**
     * Whether the process is close enough to PHP's memory ceiling that the drain
     * loop should stop and let the remainder be picked up next pass.
     */
    private static function memoryExceeded(): bool
    {
        if (!function_exists('ini_get')) {
            return false;
        }

        $raw = ini_get('memory_limit');

        if ($raw === '') {
            return false;
        }

        $limit = wp_convert_hr_to_bytes($raw);

        if ($limit <= 0) {
            // -1 / unlimited: no ceiling to guard against.
            return false;
        }

        return memory_get_usage(true) >= (int) ($limit * self::MEMORY_CEILING);
    }
}
