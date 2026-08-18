<?php

declare(strict_types=1);

namespace KeluneCRM\Handlers;

use KeluneCRM\Models\Contact;
use KeluneCRM\Repositories\AutomationRepository;

/**
 * Reacts to a contact becoming (un)mailable, cleaning up the work already
 * queued for them.
 *
 * This is an optimisation, not the guarantee. The consent guarantee lives at
 * send time — EmailService::sendCampaignEmail() and Processors\ActionProcessor
 * both re-check Contact::isSendableStatus() immediately before dispatch, so an
 * email is never sent to a contact who shouldn't get it even if this sweep
 * never ran. What this adds is that the queue doesn't fill with rows destined
 * to be cancelled one by one, and an automation doesn't march through the steps
 * of someone who has left.
 *
 * Because the send gate backstops it, every statement here is allowed to fail:
 * the updates race the campaign and automation workers for row locks, and a
 * deadlock on one table must not stop the others from being swept.
 */
class ContactStatusSweeper
{
    /** @var \wpdb */
    private $db;

    private AutomationRepository $automations;

    private string $campaignEmailsTable;

    private string $emailLogsTable;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $this->automations = new AutomationRepository();
        $this->campaignEmailsTable = $wpdb->prefix . 'kelune_crm_campaign_emails';
        $this->emailLogsTable = $wpdb->prefix . 'kelune_crm_email_logs';
    }

    public function register(): void
    {
        add_action('kelune_crm_contact_status_changed', [$this, 'handleStatusChange'], 10, 3);
    }

    /**
     * Route a status change to the right sweep.
     *
     * Three outcomes, because "not mailable" is not one thing:
     *  - pending      → park. The contact hasn't confirmed opt-in yet; hold
     *                   their work so it can resume if they do.
     *  - not sendable → cancel. Unsubscribed or bounced: terminal, never
     *                   resumed.
     *  - sendable     → resume whatever was parked (never what was cancelled).
     */
    public function handleStatusChange(int $contact_id, string $old_status, string $new_status): void
    {
        if (Contact::STATUS_PENDING === $new_status) {
            $this->park($contact_id);

            return;
        }

        if (!Contact::isSendableStatus($new_status)) {
            $this->cancel($contact_id, $new_status);

            return;
        }

        $this->resume($contact_id);
    }

    private function park(int $contact_id): void
    {
        $this->guard(fn (): int => $this->setCampaignEmailStatus(
            $contact_id,
            'parked',
            ['queued']
        ));

        $this->guard(fn (): int => $this->automations->parkContactEnrollments($contact_id));
    }

    private function cancel(int $contact_id, string $new_status): void
    {
        $reason = sprintf(
            /* translators: %s: contact status, e.g. unsubscribed */
            __('Not sent: the contact is %s.', 'kelune-crm'),
            $new_status
        );

        $this->guard(fn (): int => $this->setCampaignEmailStatus(
            $contact_id,
            'cancelled',
            ['queued', 'parked'],
            $reason
        ));

        // Keep the log in step with the queue row it mirrors, otherwise an email
        // that will never be sent sits in the log reading 'queued' forever.
        $this->guard(fn (): int => $this->cancelEmailLogs($contact_id, $reason));

        $this->guard(fn (): int => $this->automations->cancelContactEnrollments($contact_id));
    }

    /**
     * Cancel the log rows belonging to this contact's just-cancelled campaign
     * emails, matched on the tracking token the two tables share. Scoped to
     * 'queued' logs so a sent/opened history is never rewritten.
     */
    private function cancelEmailLogs(int $contact_id, string $reason): int
    {
        $sql = $this->db->prepare(
            "UPDATE {$this->emailLogsTable} SET status = %s, error_message = %s, updated_at = %s
             WHERE status = %s
             AND tracking_token IN (
                 SELECT tracking_token FROM {$this->campaignEmailsTable}
                 WHERE contact_id = %d AND status = %s AND tracking_token <> ''
             )",
            'cancelled',
            $reason,
            current_time('mysql', true),
            'queued',
            $contact_id,
            'cancelled'
        );

        if (!$sql) {
            return 0;
        }

        return (int) $this->db->query($sql);
    }

    private function resume(int $contact_id): void
    {
        $this->guard(fn (): int => $this->setCampaignEmailStatus(
            $contact_id,
            'queued',
            ['parked']
        ));

        $this->guard(fn (): int => $this->automations->resumeContactEnrollments($contact_id));

        // Opt-in just released this contact's held work back into both queues;
        // start draining now instead of waiting for the next cron minute.
        // Debounced, and a no-op transport-wise if nothing was actually parked.
        \KeluneCRM\Services\QueueRunner::kick('campaign_queue');
        \KeluneCRM\Services\QueueRunner::kick('automations');
    }

    /**
     * @param list<string> $from Statuses eligible to change.
     */
    private function setCampaignEmailStatus(
        int $contact_id,
        string $to,
        array $from,
        string $error_message = ''
    ): int {
        $placeholders = implode(', ', array_fill(0, count($from), '%s'));

        $sql = $this->db->prepare(
            "UPDATE {$this->campaignEmailsTable}
             SET status = %s, error_message = %s, updated_at = %s
             WHERE contact_id = %d AND status IN ({$placeholders})",
            array_merge([$to, $error_message, current_time('mysql', true), $contact_id], $from)
        );

        if (!$sql) {
            return 0;
        }

        return (int) $this->db->query($sql);
    }

    /**
     * Run one sweep statement, swallowing failure.
     *
     * @param callable(): int $sweep
     */
    private function guard(callable $sweep): void
    {
        try {
            $sweep();
        } catch (\Throwable $e) {
            \KeluneCRM\Core\Debug::log('KeluneCRM contact status sweep failed: ' . $e->getMessage());
        }
    }
}
