<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Models\Campaign;
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
     * Both use the `kelune_crm_every_minute` slug registered by
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
        // The drain hook `kelune_crm_process_campaign_queue` is owned by
        // QueueRunner, not registered here. This class only feeds the queue
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
     * Queue active campaigns that should be sending but hold no queue rows.
     *
     * Upholds the invariant an active campaign implies: it either has queue rows
     * or is waiting for a send time still ahead of it. No send time means due
     * immediately — so a campaign switched from a schedule to "send immediately"
     * after it was activated is picked up here rather than sitting idle.
     */
    public function processScheduledCampaigns(): void
    {
        global $wpdb;

        $campaignsTable = $wpdb->prefix . 'kelune_crm_campaigns';
        $campaignEmailsTable = $wpdb->prefix . 'kelune_crm_campaign_emails';

        // The NOT EXISTS is what keeps this from re-reading a campaign already in
        // flight every minute.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; scheduler needs the live queue.
        $campaigns = $wpdb->get_results(
            $wpdb->prepare(
                'SELECT c.id FROM %i c
                WHERE c.status = %s
                AND (c.scheduled_at IS NULL OR c.scheduled_at <= %s)
                AND NOT EXISTS (
                    SELECT 1 FROM %i ce WHERE ce.campaign_id = c.id
                )
                LIMIT 10',
                $campaignsTable,
                Campaign::STATUS_ACTIVE,
                current_time('mysql', true),
                $campaignEmailsTable
            )
        );

        $queued_any = false;

        foreach ($campaigns as $campaign) {
            // Queue the campaign for sending
            $result = $this->emailService->queueCampaign((int) $campaign->id);

            if (is_wp_error($result) || 0 === $result) {
                // Nothing could be queued (no recipients left, for instance). Put
                // the campaign back in draft so it stops being due every minute,
                // and so the list shows a state the user can act on.
                $message = is_wp_error($result) ? $result->get_error_message() : 'nothing to queue';
                \KeluneCRM\Core\Debug::log("Failed to queue campaign {$campaign->id}: {$message}");
                $this->campaignRepository->update((int) $campaign->id, ['status' => Campaign::STATUS_DRAFT]);
                continue;
            }

            $queued_any = true;
        }

        // Top up a send that stopped short of its audience. A batched send (an
        // A/B sample first) is mid-flight and queues nothing here; one whose
        // second batch never arrived — the listener that owed it was switched
        // off, or its queueing call failed — is completed from here instead of
        // being abandoned. Never demotes: this campaign has already sent mail.
        foreach ($this->campaignsOwingMail() as $campaign_id) {
            $result = $this->emailService->queueCampaign($campaign_id);

            if (!is_wp_error($result) && $result > 0) {
                $queued_any = true;
            }
        }

        // Kick the sender immediately rather than waiting for its own cron
        // minute — on a low-traffic site those minutes are far apart.
        if ($queued_any) {
            QueueRunner::kick('campaign_queue');
        }
    }

    /**
     * IDs of active campaigns that have started sending but do not hold a queue
     * row for every contact they targeted.
     *
     * @return array<int, int>
     */
    private function campaignsOwingMail(): array
    {
        global $wpdb;

        $campaignsTable = $wpdb->prefix . 'kelune_crm_campaigns';
        $campaignEmailsTable = $wpdb->prefix . 'kelune_crm_campaign_emails';

        // Only a campaign whose queue has fully drained can be owed anything: one
        // still holding rows is mid-flight and will be re-examined when it stops.
        // Resolving an audience is expensive, so the SQL narrows the field before
        // any of it is resolved.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin tables; scheduler needs the live queue.
        $ids = $wpdb->get_col(
            $wpdb->prepare(
                "SELECT c.id FROM %i c
                WHERE c.status = %s
                AND EXISTS (
                    SELECT 1 FROM %i ce WHERE ce.campaign_id = c.id
                )
                AND NOT EXISTS (
                    SELECT 1 FROM %i ce
                    WHERE ce.campaign_id = c.id
                    AND ce.status IN ('queued', 'parked', 'sending')
                )
                LIMIT 10",
                $campaignsTable,
                Campaign::STATUS_ACTIVE,
                $campaignEmailsTable,
                $campaignEmailsTable
            )
        );

        $owing = [];

        foreach ($ids as $id) {
            // The same veto the completion sweep consults, for the same reason:
            // a listener still owed a batch will queue it itself, so resolving
            // the audience to discover that would be work thrown away on every
            // drain it spends waiting.
            if (!apply_filters('kelune_crm_campaign_send_complete', true, (int) $id)) {
                continue;
            }

            if ($this->campaignRepository->unqueuedRecipientIds((int) $id) !== []) {
                $owing[] = (int) $id;
            }
        }

        return $owing;
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

        // Before the completion sweep, so a listener that queues a further batch
        // (an A/B remainder, say) is seen by it and the campaign stays open.
        foreach ($this->activeCampaignIds() as $campaign_id) {
            /**
             * Fires once per drain for each campaign still sending.
             *
             * @param int $campaign_id
             */
            do_action('kelune_crm_campaign_send_progress', (int) $campaign_id);
        }

        // Mark campaigns as sent when all emails are processed
        $this->markCompletedCampaigns();
    }

    /**
     * IDs of campaigns the user has switched on.
     *
     * @return array<int, int>
     */
    private function activeCampaignIds(): array
    {
        global $wpdb;

        $campaignsTable = $wpdb->prefix . 'kelune_crm_campaigns';

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; the sweep needs live rows.
        $ids = $wpdb->get_col(
            $wpdb->prepare(
                'SELECT id FROM %i WHERE status = %s',
                $campaignsTable,
                Campaign::STATUS_ACTIVE
            )
        );

        return array_map('intval', $ids);
    }

    /**
     * Send a specific campaign (scheduled via wp_schedule_single_event)
     *
     * @param int $campaign_id
     */
    public function sendCampaign($campaign_id): void
    {
        $campaign = $this->campaignRepository->find($campaign_id);

        if (!$campaign || !$campaign->isActive()) {
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

        // In-flight campaigns have no sent_at yet, so they must be included
        // unconditionally; recently-finished ones are refreshed for an hour.
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
                Campaign::STATUS_ACTIVE,
                Campaign::STATUS_SENT
            )
        );

        foreach ($campaigns as $campaign) {
            $this->campaignRepository->updateStats($campaign->id);
        }
    }

    /**
     * Close active campaigns whose queue has fully drained. The only writer of
     * STATUS_SENT — every other transition belongs to the user.
     */
    private function markCompletedCampaigns(): void
    {
        global $wpdb;

        $campaignsTable = $wpdb->prefix . 'kelune_crm_campaigns';
        $campaignEmailsTable = $wpdb->prefix . 'kelune_crm_campaign_emails';

        // An active campaign is finished when it has queue rows and none of them
        // are unfinished. Both halves matter: without the EXISTS, a campaign
        // activated seconds ago — or one still waiting for its send time — has no
        // rows yet and would be closed before sending anything.
        //
        // 'parked' counts as unfinished: those rows are held for a contact who
        // hasn't confirmed their opt-in and are released back to 'queued' if they
        // do. 'sending' is a row a worker has claimed and is dispatching right
        // now. A campaign holding either is not finished.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin tables; completion sweep needs live rows.
        $campaigns = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT c.id
                FROM %i c
                WHERE c.status = %s
                AND EXISTS (
                    SELECT 1 FROM %i ce WHERE ce.campaign_id = c.id
                )
                AND NOT EXISTS (
                    SELECT 1 FROM %i ce
                    WHERE ce.campaign_id = c.id
                    AND ce.status IN ('queued', 'parked', 'sending')
                )",
                $campaignsTable,
                Campaign::STATUS_ACTIVE,
                $campaignEmailsTable,
                $campaignEmailsTable
            )
        );

        foreach ($campaigns as $campaign) {
            /**
             * Filter whether a drained campaign is finished.
             *
             * A drained queue is not proof the send is over: a listener sending in
             * batches (an A/B test sample first, the rest after) still owes the
             * audience mail, and closing the campaign here would strand it.
             *
             * Consulted before the coverage check below, which resolves the whole
             * audience — a listener that says "not yet" answers the question for
             * nothing, and says so for every drain it is still waiting through.
             *
             * @param bool $complete
             * @param int  $campaign_id
             */
            if (!apply_filters('kelune_crm_campaign_send_complete', true, (int) $campaign->id)) {
                continue;
            }

            // No listener is holding it open, so the queue is all there is going
            // to be — and it only means the campaign is finished if it covered
            // the audience. A send that stopped part-way through is still owed,
            // and closing it here would report mail as sent that nobody was ever
            // going to receive.
            if ($this->campaignRepository->unqueuedRecipientIds((int) $campaign->id) !== []) {
                continue;
            }

            // Persist final stats before flipping status, so the stored numbers
            // reflect the completed send (live getStats stays accurate either way).
            $this->campaignRepository->updateStats($campaign->id);

            $this->campaignRepository->markSent((int) $campaign->id);

            \KeluneCRM\Core\Debug::log("Campaign {$campaign->id} marked as sent");
        }
    }
}
