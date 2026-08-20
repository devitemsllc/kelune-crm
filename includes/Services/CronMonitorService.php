<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

/**
 * Reports the health of the plugin's scheduled work, and runs an event on demand.
 *
 * Backs the Settings → Cron Monitor screen. Most "emails aren't sending"
 * reports come down to WP-Cron not firing, so the registry is limited to
 * events this product owns and can explain.
 */
class CronMonitorService
{
    /**
     * How far past its due time an event may drift before it reads as overdue.
     *
     * WP-Cron is traffic-driven, so a minute-interval event routinely lags on a
     * quiet site. This grace separates normal lag from "cron is not running".
     */
    private const OVERDUE_GRACE_SECONDS = 120;

    /**
     * Every recurring event the monitor knows about.
     *
     * Free events only; Pro appends its own via the
     * `kelune_crm_cron_monitor_events` filter. Free cannot name Pro's hooks and
     * must not report them missing when Pro is inactive.
     *
     * @return list<array{hook: non-empty-string, label: string, description: string}>
     */
    private function registry(): array
    {
        $events = [
            [
                'hook' => 'kelune_crm_process_campaign_queue',
                'label' => __('Campaign Email Sending', 'kelune-crm'),
                'description' => __('Sends queued campaign emails, up to 100 per run.', 'kelune-crm'),
            ],
            [
                'hook' => 'kelune_crm_process_scheduled_campaigns',
                'label' => __('Scheduled Campaigns', 'kelune-crm'),
                'description' => __('Picks up campaigns whose send time has arrived and queues their emails.', 'kelune-crm'),
            ],
            [
                'hook' => 'kelune_crm_process_automations',
                'label' => __('Automation Queue', 'kelune-crm'),
                'description' => __('Runs pending automation steps, up to 50 per run.', 'kelune-crm'),
            ],
            [
                'hook' => 'kelune_crm_daily_cleanup',
                'label' => __('Daily Cleanup', 'kelune-crm'),
                'description' => __('Recovers stalled email and automation jobs, and purges failed or cancelled automation-queue rows older than 30 days.', 'kelune-crm'),
            ],
        ];

        /**
         * Filter the events shown in the Cron Monitor.
         *
         * Each entry must provide `hook`, `label` and `description`. The hook is
         * also what "Run Now" may fire, so only register hooks safe to run on
         * demand.
         *
         * @param list<array{hook: non-empty-string, label: string, description: string}> $events
         */
        $filtered = apply_filters('kelune_crm_cron_monitor_events', $events);

        return $this->normalizeRegistry($filtered);
    }

    /**
     * Reduce filtered entries to well-formed, unique records.
     *
     * The filter is public API and can hand back anything. A malformed entry is
     * dropped rather than allowed to fatal the screen or widen what runEvent()
     * will execute.
     *
     * @param mixed $events
     * @return list<array{hook: non-empty-string, label: string, description: string}>
     */
    private function normalizeRegistry(mixed $events): array
    {
        $normalized = [];
        $seen = [];

        foreach ((array) $events as $event) {
            if (!is_array($event) || !isset($event['hook']) || !is_string($event['hook']) || $event['hook'] === '') {
                continue;
            }

            $hook = $event['hook'];

            if (isset($seen[$hook])) {
                continue;
            }
            $seen[$hook] = true;

            $normalized[] = [
                'hook' => $hook,
                'label' => isset($event['label']) && is_string($event['label']) ? $event['label'] : $hook,
                'description' => isset($event['description']) && is_string($event['description'])
                    ? $event['description']
                    : '',
            ];
        }

        return $normalized;
    }

    /**
     * The registered events, each resolved against what WP-Cron actually holds.
     *
     * @return list<array<string, mixed>>
     */
    public function getEvents(): array
    {
        $now = time();
        $events = [];

        foreach ($this->registry() as $event) {
            $next_run = wp_next_scheduled($event['hook']);
            $schedule = wp_get_schedule($event['hook']);

            if ($next_run === false) {
                // Nothing scheduled at all. Distinct from "late" and far more
                // serious: this event will never run until it is rescheduled.
                $events[] = array_merge($event, [
                    'status' => 'not_scheduled',
                    'next_run' => null,
                    'next_run_relative' => null,
                    'interval' => null,
                    'interval_label' => null,
                ]);
                continue;
            }

            $seconds_late = $now - $next_run;
            $is_overdue = $seconds_late > self::OVERDUE_GRACE_SECONDS;

            $events[] = array_merge($event, [
                'status' => $is_overdue ? 'overdue' : 'scheduled',
                'next_run' => $next_run,
                'next_run_relative' => human_time_diff($next_run, $now),
                'interval' => $this->intervalSeconds($schedule),
                'interval_label' => $this->intervalLabel($schedule),
            ]);
        }

        return $events;
    }

    /**
     * Interval length in seconds for a schedule slug, or null if unknown.
     */
    private function intervalSeconds(string|false $schedule): ?int
    {
        if ($schedule === false) {
            return null;
        }

        $schedules = wp_get_schedules();

        return isset($schedules[$schedule]['interval']) ? (int) $schedules[$schedule]['interval'] : null;
    }

    /**
     * Human-readable recurrence for a schedule slug.
     */
    private function intervalLabel(string|false $schedule): ?string
    {
        $seconds = $this->intervalSeconds($schedule);

        if ($seconds === null) {
            return null;
        }

        if ($seconds === 60) {
            return __('Every minute', 'kelune-crm');
        }

        if ($seconds === DAY_IN_SECONDS) {
            return __('Once daily', 'kelune-crm');
        }

        /* translators: %s: human-readable duration, e.g. "5 mins" */
        return sprintf(__('Every %s', 'kelune-crm'), human_time_diff(0, $seconds));
    }

    /**
     * Server limits the queue processors run within, plus how WP-Cron is driven.
     *
     * @return array<string, mixed>
     */
    public function getServerInfo(): array
    {
        $memory_limit = $this->memoryLimitBytes();
        $memory_usage = memory_get_usage(true);

        return [
            // A -1 memory_limit means unlimited; there is no percentage to report
            // against it, so both the limit and the usage read as unknown rather
            // than being dressed up with an invented ceiling.
            'memory_limit_bytes' => $memory_limit,
            'memory_limit' => $memory_limit !== null ? size_format($memory_limit) : __('Unlimited', 'kelune-crm'),
            'memory_usage_bytes' => $memory_usage,
            'memory_usage' => size_format($memory_usage),
            'memory_usage_percent' => $memory_limit !== null && $memory_limit > 0
                ? round(($memory_usage / $memory_limit) * 100, 2)
                : null,
            // Reported as PHP reports it. Not clamped or shaved: this figure is
            // here to be checked against php.ini, so a number that disagrees
            // with php.ini would defeat the point.
            'max_execution_time' => $this->maxExecutionTime(),
            'has_server_cron' => defined('DISABLE_WP_CRON') && constant('DISABLE_WP_CRON') === true,
            'has_alternate_cron' => defined('ALTERNATE_WP_CRON') && constant('ALTERNATE_WP_CRON') === true,
        ];
    }

    /**
     * PHP's memory ceiling in bytes, or null when unlimited/undeterminable.
     */
    private function memoryLimitBytes(): ?int
    {
        if (!function_exists('ini_get')) {
            return null;
        }

        $raw = ini_get('memory_limit');

        if ($raw === '') {
            return null;
        }

        // -1 (unlimited) converts to a non-positive value; report it as "no
        // finite limit" rather than inventing a ceiling to measure against.
        $bytes = wp_convert_hr_to_bytes($raw);

        return $bytes > 0 ? $bytes : null;
    }

    /**
     * PHP's max_execution_time in seconds; 0 means unlimited.
     */
    private function maxExecutionTime(): ?int
    {
        if (!function_exists('ini_get')) {
            return null;
        }

        return (int) ini_get('max_execution_time');
    }

    /**
     * The registry entry for a hook, or null if it holds no such hook.
     *
     * runEvent() passes caller-supplied input to do_action(), so this registry
     * is the allowlist that stops the endpoint firing any hook by name.
     *
     * @return array{hook: non-empty-string, label: string, description: string}|null
     */
    private function findEvent(string $hook): ?array
    {
        foreach ($this->registry() as $event) {
            if ($event['hook'] === $hook) {
                return $event;
            }
        }

        return null;
    }

    /**
     * Run a registered event immediately, in the current request.
     *
     * Synchronous so the caller sees the outcome; the callbacks' batch caps
     * (50 automation steps, 100 emails) keep it inside max_execution_time.
     *
     * Returns true on success. Not typed `true` — that is PHP 8.2 only.
     */
    public function runEvent(string $hook): \WP_Error|bool
    {
        $event = $this->findEvent($hook);

        if ($event === null) {
            return new \WP_Error(
                'kelune_crm_unknown_cron_hook',
                __('That scheduled task is not one this plugin manages.', 'kelune-crm'),
                ['status' => 400]
            );
        }

        // Fire the registry's own copy of the hook, not the caller's string:
        // identical in value, but it carries the non-empty guarantee the
        // registry established.
        // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.DynamicHooknameFound -- Fires one of the plugin's own registered (prefixed) cron hooks; the name is resolved from the internal registry, not caller input.
        do_action($event['hook']);

        return true;
    }
}
