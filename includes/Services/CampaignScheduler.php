<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Repositories\CampaignRepository;

class CampaignScheduler
{
    private \KeluneCRM\Repositories\CampaignRepository $campaignRepository;
    private \KeluneCRM\Services\EmailService $emailService;

    public function __construct()
    {
        $this->campaignRepository = new CampaignRepository();
        $this->emailService = new EmailService();
    }

    /**
     * Recurring campaign events, mapped to the interval they must run at.
     *
     * Both use the prefixed `kelune_crm_every_minute` slug registered by
     * Plugin::addCustomCronSchedules().
     *
     * @var array<string, string>
     */
    private const RECURRING_EVENTS = [
        'kelune_crm_process_scheduled_campaigns' => 'kelune_crm_every_minute',
        'kelune_crm_process_campaign_queue' => 'kelune_crm_every_minute',
    ];

    /**
     * Register WordPress hooks
     */
    public function register(): void
    {
        // Register cron events.
        //
        // NOTE: the drain hook `kelune_crm_process_campaign_queue` is owned by
        // QueueRunner, not registered here. QueueRunner runs the send batch under
        // a cross-process lock, loops until the queue is empty or the time budget
        // is spent, then continues via a non-blocking loopback — and calls
        // finalizeCampaignSends() once per run. This class only *feeds* the queue
        // (scheduled → queued) and owns the stats/completion sweep.
        add_action('kelune_crm_process_scheduled_campaigns', [$this, 'processScheduledCampaigns']);
        add_action('kelune_crm_send_campaign', [$this, 'sendCampaign'], 10, 1);

        $this->scheduleRecurringEvents();
    }

    /**
     * Ensure each recurring event is scheduled at its intended interval,
     * rescheduling any event whose stored interval no longer matches.
     */
    private function scheduleRecurringEvents(): void
    {
        foreach (self::RECURRING_EVENTS as $hook => $interval) {
            $existing = wp_get_schedule($hook);

            if ($existing === $interval) {
                continue;
            }

            if ($existing !== false) {
                wp_clear_scheduled_hook($hook);
            }

            wp_schedule_event(time(), $interval, $hook);
        }
    }

    /**
     * Process scheduled campaigns that are ready to send
     */
    public function processScheduledCampaigns(): void
    {
        global $wpdb;

        $campaignsTable = $wpdb->prefix . 'kelune_crm_campaigns';

        // Find campaigns scheduled to send now or in the past
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; scheduler needs the live queue.
        $campaigns = $wpdb->get_results(
            $wpdb->prepare(
                'SELECT id FROM %i
                WHERE status = %s
                AND scheduled_at IS NOT NULL
                AND scheduled_at <= %s
                LIMIT 10',
                $campaignsTable,
                'scheduled',
                current_time('mysql', true)
            )
        );

        $queued_any = false;

        foreach ($campaigns as $campaign) {
            // Queue the campaign for sending
            $result = $this->emailService->queueCampaign((int) $campaign->id);

            if (is_wp_error($result)) {
                \KeluneCRM\Core\Debug::log("Failed to queue campaign {$campaign->id}: " . $result->get_error_message());
                continue;
            }

            $queued_any = true;
        }

        // Kick the sender immediately rather than waiting for its own cron
        // minute — on a low-traffic site those minutes are far apart.
        if ($queued_any) {
            QueueRunner::kick('campaign_queue');
        }
    }

    /**
     * Refresh campaign stats and mark finished campaigns as sent.
     *
     * Called once per QueueRunner drain of the campaign queue (after the send
     * loop), so the stored numbers and status track each run's progress.
     */
    public function finalizeCampaignSends(): void
    {
        // Update stats for campaigns that have sent emails
        $this->updateCampaignStats();

        // Mark campaigns as sent when all emails are processed
        $this->markCompletedCampaigns();
    }

    /**
     * Send a specific campaign (scheduled via wp_schedule_single_event)
     *
     * @param int $campaign_id
     */
    public function sendCampaign($campaign_id): void
    {
        $campaign = $this->campaignRepository->find($campaign_id);

        if (!$campaign || $campaign->status !== 'scheduled') {
            return;
        }

        $result = $this->emailService->queueCampaign($campaign_id);

        if (is_wp_error($result)) {
            \KeluneCRM\Core\Debug::log("Failed to send campaign {$campaign_id}: " . $result->get_error_message());

            return;
        }

        // Start sending straight away instead of waiting for the queue's cron tick.
        QueueRunner::kick('campaign_queue');
    }

    /**
     * Update campaign stats for active campaigns
     */
    private function updateCampaignStats(): void
    {
        global $wpdb;

        $campaignsTable = $wpdb->prefix . 'kelune_crm_campaigns';

        // Currently-sending campaigns have no sent_at yet, so they must be
        // included unconditionally; recently-sent ones are refreshed for an hour.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; stats refresh needs live rows.
        $campaigns = $wpdb->get_results(
            $wpdb->prepare(
                // sent_at is stored UTC (current_time('mysql', true)); compare it
                // against the UTC clock (UTC_TIMESTAMP), not NOW() which is the
                // MySQL session timezone and can differ.
                'SELECT id FROM %i
                WHERE status = %s
                   OR (status = %s AND sent_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR))',
                $campaignsTable,
                'sending',
                'sent'
            )
        );

        foreach ($campaigns as $campaign) {
            $this->campaignRepository->updateStats($campaign->id);
        }
    }

    /**
     * Mark campaigns as sent when all emails are processed
     */
    private function markCompletedCampaigns(): void
    {
        global $wpdb;

        $campaignsTable = $wpdb->prefix . 'kelune_crm_campaigns';
        $campaignEmailsTable = $wpdb->prefix . 'kelune_crm_campaign_emails';

        // Find campaigns with status 'sending' that have no unfinished emails.
        // 'parked' counts as unfinished: those rows are held for a contact who
        // hasn't confirmed their opt-in and are released back to 'queued' if
        // they do. 'sending' is a row a worker has claimed and is dispatching
        // right now. A campaign holding either is not finished.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin tables; completion sweep needs live rows.
        $campaigns = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT c.id
                FROM %i c
                WHERE c.status = 'sending'
                AND NOT EXISTS (
                    SELECT 1 FROM %i ce
                    WHERE ce.campaign_id = c.id
                    AND ce.status IN ('queued', 'pending', 'parked', 'sending')
                )",
                $campaignsTable,
                $campaignEmailsTable
            )
        );

        foreach ($campaigns as $campaign) {
            // Persist final stats before flipping status, so the stored numbers
            // reflect the completed send (live getStats stays accurate either way).
            $this->campaignRepository->updateStats($campaign->id);

            $this->campaignRepository->update($campaign->id, [
                'status' => 'sent',
                'sent_at' => current_time('mysql', true),
            ]);

            $this->logDebug("Campaign {$campaign->id} marked as sent");
        }
    }

    /**
     * Write an informational message to the debug log only when debugging is on.
     *
     * Keeps routine cron chatter out of production logs; genuine failures are
     * logged unconditionally at their call sites.
     */
    private function logDebug(string $message): void
    {
        if (defined('KELUNE_CRM_DEBUG') && KELUNE_CRM_DEBUG) {
            \KeluneCRM\Core\Debug::log($message);
        }
    }
}
