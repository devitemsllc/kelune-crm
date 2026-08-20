<?php

declare(strict_types=1);

namespace KeluneCRM\Handlers;

use KeluneCRM\Repositories\AutomationRepository;

/**
 * Daily housekeeping for the send and automation queues.
 *
 *  - Recovery. A row is claimed by flipping its status ('sending'/'processing').
 *    A worker that dies mid-flight never flips it back, and the drainers only
 *    claim from 'queued'/'pending' — so anything held in a claimed state longer
 *    than a real send could take is returned to its queue.
 *
 *  - Purging. Terminal automation queue rows and incoming-webhook request logs
 *    are dropped once old, or they grow without bound. Parked rows are never
 *    purged: they await an opt-in that may still arrive. Campaign email rows are
 *    never purged either — cancelled ones are the audit trail of a withheld
 *    send, and campaign stats read them.
 */
class CleanupHandler
{
    /**
     * Minutes after which a claimed row is presumed abandoned. Comfortably
     * longer than a send (the queue processes one email per ~100ms) so a slow
     * batch is never mistaken for a dead one.
     */
    private const STALE_CLAIM_MINUTES = 15;

    /** Days after which a terminal automation queue row is purged. */
    private const PURGE_AFTER_DAYS = 30;

    /** Days after which an incoming-webhook request log is purged. */
    private const WEBHOOK_LOG_RETENTION_DAYS = 30;

    /** @var \wpdb */
    private $db;

    private string $campaignEmailsTable;

    private string $automationQueueTable;

    private string $webhookLogsTable;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $this->campaignEmailsTable = $wpdb->prefix . 'kelune_crm_campaign_emails';
        $this->automationQueueTable = $wpdb->prefix . 'kelune_crm_automation_queue';
        $this->webhookLogsTable = $wpdb->prefix . 'kelune_crm_webhook_logs';
    }

    public function register(): void
    {
        add_action('kelune_crm_daily_cleanup', [$this, 'run']);
    }

    public function run(): void
    {
        $this->recoverStalledCampaignEmails();
        $this->recoverStalledAutomationSteps();
        $this->purgeOldAutomationQueueItems();
        $this->purgeOldWebhookLogs();
    }

    /**
     * Return campaign emails abandoned mid-send to the queue.
     *
     * Safe to re-queue rather than fail: the send re-checks consent, and a row
     * whose contact has since become unmailable is cancelled at that point.
     *
     * @return int Rows recovered.
     */
    public function recoverStalledCampaignEmails(): int
    {
        $sql = $this->db->prepare(
            "UPDATE {$this->campaignEmailsTable}
             SET status = 'queued', updated_at = %s
             WHERE status = 'sending'
             AND updated_at < DATE_SUB(%s, INTERVAL %d MINUTE)",
            current_time('mysql', true),
            current_time('mysql', true),
            self::STALE_CLAIM_MINUTES
        );

        return $sql ? (int) $this->db->query($sql) : 0;
    }

    /**
     * Return automation steps abandoned mid-execution to the queue. The
     * executor re-reads the enrolment before acting, so a step belonging to a
     * cancelled or parked contact is dropped or held rather than run.
     *
     * @return int Rows recovered.
     */
    public function recoverStalledAutomationSteps(): int
    {
        $sql = $this->db->prepare(
            "UPDATE {$this->automationQueueTable}
             SET status = %s, updated_at = %s
             WHERE status = %s
             AND updated_at < DATE_SUB(%s, INTERVAL %d MINUTE)",
            AutomationRepository::QUEUE_STATUS_PENDING,
            current_time('mysql', true),
            AutomationRepository::QUEUE_STATUS_PROCESSING,
            current_time('mysql', true),
            self::STALE_CLAIM_MINUTES
        );

        return $sql ? (int) $this->db->query($sql) : 0;
    }

    /**
     * Delete automation queue rows that reached a terminal state long enough
     * ago to be of no interest.
     *
     * @return int Rows purged.
     */
    public function purgeOldAutomationQueueItems(): int
    {
        $sql = $this->db->prepare(
            "DELETE FROM {$this->automationQueueTable}
             WHERE status IN (%s, %s)
             AND created_at < DATE_SUB(%s, INTERVAL %d DAY)",
            'failed',
            AutomationRepository::STATUS_CANCELLED,
            current_time('mysql', true),
            self::PURGE_AFTER_DAYS
        );

        return $sql ? (int) $this->db->query($sql) : 0;
    }

    /**
     * Delete incoming-webhook request logs older than the retention window.
     * One row is written per received request, so without this the table grows
     * without bound on busy webhooks.
     *
     * @return int Rows purged.
     */
    public function purgeOldWebhookLogs(): int
    {
        $sql = $this->db->prepare(
            "DELETE FROM {$this->webhookLogsTable}
             WHERE created_at < DATE_SUB(%s, INTERVAL %d DAY)",
            current_time('mysql', true),
            self::WEBHOOK_LOG_RETENTION_DAYS
        );

        return $sql ? (int) $this->db->query($sql) : 0;
    }
}
