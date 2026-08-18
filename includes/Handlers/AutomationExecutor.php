<?php

declare(strict_types=1);

namespace KeluneCRM\Handlers;

use KeluneCRM\Automation\ProcessorRegistry;
use KeluneCRM\Repositories\AutomationRepository;
use KeluneCRM\Repositories\ContactRepository;

/**
 * Main automation execution engine: processes the automation queue via
 * WordPress cron every minute, executing pending automation steps.
 */
class AutomationExecutor
{
    /** @var \wpdb */
    private $db;
    private string $queueTable;
    private string $stepsTable;
    private string $logsTable;
    private string $contactsTable;
    private \KeluneCRM\Repositories\ContactRepository $contactRepo;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $prefix = $wpdb->prefix . 'kelune_crm_';

        $this->queueTable = $prefix . 'automation_queue';
        $this->stepsTable = $prefix . 'automation_steps';
        $this->logsTable = $prefix . 'automation_logs';
        $this->contactsTable = $prefix . 'automation_contacts';

        $this->contactRepo = new ContactRepository();
    }

    /**
     * Process the automation queue. Called by WordPress cron every minute.
     *
     * @return array<string, mixed>
     */
    public function processQueue(int $batch_size = 50): array
    {
        $start_time = microtime(true);
        $processed = 0;
        $errors = 0;

        // Get pending queue items scheduled for now or earlier
        $queue_items = $this->getPendingQueueItems($batch_size);

        if (empty($queue_items)) {
            return [
                'processed' => 0,
                'errors' => 0,
                'time' => 0,
                'has_more' => false,
                'message' => __('No items to process', 'kelune-crm'),
            ];
        }

        foreach ($queue_items as $item) {
            // Atomically claim the row before touching it. The batch above is a
            // plain read, so two overlapping runners (cron + a manual "Run Now",
            // the loopback continuation, or a slow tick spilling into the next
            // minute) select the same rows. The claim is the synchronisation
            // point: it flips the row out of 'pending' only if it is still
            // 'pending', so exactly one runner wins and the loser skips —
            // without this the step runs twice (duplicate tags, webhooks, emails,
            // and a double stat decrement). Mirrors EmailService::claimQueuedEmail.
            if (!$this->claimQueueItem((int) $item['id'])) {
                continue;
            }

            try {
                $this->processQueueItem($item);
                $processed++;
            } catch (\Exception $e) {
                $errors++;
                $this->logError($item, $e->getMessage());

                // Fail fast: a failed step is marked failed, not retried. Several
                // actions (send_email, webhook) are not idempotent, so re-running
                // one risks a duplicate side effect — worse than skipping it.
                // `attempts` is recorded for diagnostics only. (A step
                // whose worker *crashed* mid-run stays 'processing' and is returned
                // to the queue once by the stale-claim recovery — that is not a
                // retry of a failure, it is recovery of an interrupted run.)
                $this->updateQueueItem($item['id'], [
                    'status' => 'failed',
                    'attempts' => ($item['attempts'] ?? 0) + 1,
                    'last_error' => $e->getMessage(),
                ]);
            }
        }

        $execution_time = round((microtime(true) - $start_time) * 1000, 2);

        return [
            'processed' => $processed,
            'errors' => $errors,
            'time' => $execution_time,
            // Signal to the QueueRunner drain loop whether another pass is worth
            // it: true when work is still due now (including immediate next steps
            // this pass just enqueued), so a multi-step or chained automation
            // finishes in one run instead of one step per cron minute.
            'has_more' => $this->hasPendingDue(),
            /* translators: 1: number of items processed, 2: execution time in milliseconds */
            'message' => sprintf(__('Processed %1$d items in %2$sms', 'kelune-crm'), $processed, $execution_time),
        ];
    }

    /**
     * Atomically take ownership of a pending queue row.
     *
     * @return bool True when this runner claimed the row, false when another
     *              already did (or the sweeper cancelled it in the meantime).
     */
    private function claimQueueItem(int $id): bool
    {
        // Stamp updated_at in UTC on the claim. The column is
        // ON UPDATE CURRENT_TIMESTAMP, which would otherwise write DB-session-
        // local time; the stale-claim recovery compares this value against the
        // UTC clock (CleanupHandler::recoverStalledAutomationSteps), so a local
        // timestamp there makes a fresh claim read as hours stale (re-queued and
        // run twice) or an abandoned one read as fresh (stranded for hours).
        $claimed = $this->db->update(
            $this->queueTable,
            ['status' => 'processing', 'updated_at' => current_time('mysql', true)],
            ['id' => $id, 'status' => 'pending']
        );

        return 1 === $claimed;
    }

    /**
     * Whether any queue row is pending and due to run now. Used by the drain
     * loop to decide whether to keep going or hand back to cron/loopback.
     */
    public function hasPendingDue(): bool
    {
        $exists = $this->db->get_var(
            $this->db->prepare(
                "SELECT 1 FROM {$this->queueTable}
                WHERE status = 'pending' AND scheduled_for <= %s
                LIMIT 1",
                current_time('mysql', true)
            )
        );

        return null !== $exists;
    }

    /** @param array<string, mixed> $item */
    private function processQueueItem(array $item): void
    {
        $item_start_time = microtime(true);

        // The row is already 'processing' here — processQueue() claimed it
        // atomically before calling us, which is what serialises concurrent
        // runners. Do not re-write the status; that would be a second,
        // unguarded UPDATE.

        // Re-read the enrolment before doing any work. The row was claimed from
        // a batch that may be minutes old, and the contact can have unsubscribed
        // since — in which case ContactStatusSweeper already cancelled this
        // enrolment. Without this the step would run, schedule its successor and
        // delete the cancelled row, marching the automation on for a contact who
        // has left. The send gate would still refuse their email, but the
        // non-email steps (tagging, webhooks, field writes) would not.
        $enrollment_status = $this->getEnrollmentStatus(
            (int) $item['automation_id'],
            (int) $item['contact_id']
        );

        if (AutomationRepository::STATUS_CANCELLED === $enrollment_status) {
            $this->deleteQueueItem($item['id']);

            return;
        }

        // Parked: the contact hasn't confirmed their opt-in. Hold the row rather
        // than dropping it — resuming flips it back to pending.
        if (AutomationRepository::STATUS_PARKED === $enrollment_status) {
            $this->updateQueueItem($item['id'], ['status' => AutomationRepository::STATUS_PARKED]);

            return;
        }

        $step = $this->getStep($item['next_step_id']);

        if (!$step) {
            throw new \Exception(esc_html('Step not found: ' . $item['next_step_id']));
        }

        $contact = $this->contactRepo->find($item['contact_id']);

        if (!$contact) {
            throw new \Exception(esc_html('Contact not found: ' . $item['contact_id']));
        }

        $context = json_decode($item['context_data'] ?? '{}', true) ?: [];

        $result = null;

        switch ($step['step_type']) {
            case 'trigger':
                // Trigger steps are entry points, just pass through
                $result = ['success' => true, 'message' => __('Trigger passed', 'kelune-crm')];
                break;

            case 'action':
                $result = $this->executeAction($step, $contact, $context);
                break;

            case 'condition':
                $result = $this->executeCondition($step, $contact, $context);
                break;

            case 'delay':
                $result = $this->executeDelay($step, $item);
                break;

            default:
                throw new \Exception(esc_html('Unknown step type: ' . $step['step_type']));
        }

        // A delay whose wait is not yet up asks to be retried, not completed.
        // (Only reachable under clock skew — the queue read already gates on
        // scheduled_for <= now.) Return the row to 'pending' for the next pass;
        // do NOT fall through to the else branch below, which would mark the
        // enrolment failed and delete the row, killing the automation mid-wait.
        if (!empty($result['reschedule'])) {
            $this->updateQueueItem((int) $item['id'], ['status' => AutomationRepository::QUEUE_STATUS_PENDING]);

            return;
        }

        $execution_time = round((microtime(true) - $item_start_time) * 1000, 2);

        $this->logExecution($item, $step, $result, $execution_time);

        if ($result['success']) {
            $this->scheduleNextStep($item, $step, $result);
        } else {
            $this->updateContactStatus($item['automation_id'], $item['contact_id'], 'failed');
        }

        $this->deleteQueueItem($item['id']);
    }

    /**
     * @param array<string, mixed> $step
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    private function executeAction(array $step, \KeluneCRM\Models\Contact $contact, array $context): array
    {
        $action_type = (string) $step['action_type'];
        $action_config = json_decode($step['action_config'] ?? '{}', true) ?: [];

        // Resolve the processor from the free/pro registry. Basic actions are
        // registered by Free; advanced ones (update_field, webhook, ...) are
        // added by the Pro add-on. When the processor is absent (Pro inactive),
        // skip the step gracefully so the automation continues instead of failing.
        $processor = ProcessorRegistry::get($action_type);

        if ($processor === null) {
            return [
                'success' => true,
                'skipped' => true,
                'message' => sprintf(
                    /* translators: %s: action type identifier */
                    __('Action "%s" is not available (requires Kelune CRM Pro); skipped.', 'kelune-crm'),
                    $action_type
                ),
            ];
        }

        $result = $processor($action_config, $contact, $context, $action_type);

        return is_array($result)
            ? $result
            : ['success' => false, 'message' => __('Action processor returned an invalid result.', 'kelune-crm')];
    }

    /**
     * @param array<string, mixed> $step
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    private function executeCondition(array $step, \KeluneCRM\Models\Contact $contact, array $context): array
    {
        $condition_type = (string) $step['condition_type'];
        $condition_config = json_decode($step['condition_config'] ?? '{}', true) ?: [];

        // Conditional branching is a Pro processor (registered under the
        // 'condition' key). When Pro is inactive the processor is absent — take
        // the default (YES) branch so the automation continues rather than stalls.
        $processor = ProcessorRegistry::get('condition');

        if ($processor === null) {
            return [
                'success' => true,
                'branch' => 'yes',
                'message' => __('Condition step skipped (requires Kelune CRM Pro); defaulted to YES branch.', 'kelune-crm'),
            ];
        }

        $result = $processor($condition_config, $contact, $context, $condition_type);

        return is_array($result)
            ? $result
            : ['success' => true, 'branch' => 'yes'];
    }

    /**
     * @param array<string, mixed> $step
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    private function executeDelay(array $step, array $item): array
    {
        $delay_type = $step['delay_type'] ?? 'days';
        $delay_value = (int) ($step['delay_value'] ?? 1);

        // scheduled_for is stored in UTC (like every timestamp here), so parse it
        // as UTC and compare against the UTC clock. Using current_time('timestamp')
        // (site-local) here would misjudge the delay by the site's UTC offset.
        $scheduled_time = strtotime($item['scheduled_for'] . ' UTC');
        $current_time = time();

        if (false !== $scheduled_time && $current_time < $scheduled_time) {
            return [
                'success' => false,
                'reschedule' => true,
                'message' => __('Delay not yet complete', 'kelune-crm'),
            ];
        }

        // Delay passed, continue to next step
        return [
            'success' => true,
            /* translators: 1: delay value, 2: delay unit (days, hours, etc.) */
            'message' => sprintf(__('Delay completed (%1$d %2$s)', 'kelune-crm'), $delay_value, $delay_type),
        ];
    }

    /**
     * @param array<string, mixed> $queue_item
     * @param array<string, mixed> $current_step
     * @param array<string, mixed> $result
     */
    private function scheduleNextStep(array $queue_item, array $current_step, array $result): void
    {
        // Find next step
        $next_step = null;

        if ($current_step['step_type'] === 'condition') {
            // For conditions, find the step on the specified branch
            $branch = $result['branch'] ?? 'yes';
            $next_step = $this->getNextStepByBranch($current_step['id'], $branch);
        } else {
            // For other steps, find the next step in sequence
            $next_step = $this->getNextStepByParent($current_step['id']);
        }

        if (!$next_step) {
            // No more steps, mark automation as completed for this contact
            $this->updateContactStatus(
                $queue_item['automation_id'],
                $queue_item['contact_id'],
                'completed'
            );
            return;
        }

        // Calculate scheduled time for next step
        $scheduled_for = current_time('mysql', true);

        if ($next_step['step_type'] === 'delay') {
            $delay_minutes = $this->calculateDelayMinutes(
                $next_step['delay_type'] ?? 'days',
                (int) ($next_step['delay_value'] ?? 1)
            );
            $scheduled_for = gmdate('Y-m-d H:i:s', strtotime("+{$delay_minutes} minutes") ?: time());
        }

        // Add next step to queue
        $this->db->insert($this->queueTable, [
            'automation_id' => $queue_item['automation_id'],
            'contact_id' => $queue_item['contact_id'],
            'next_step_id' => $next_step['id'],
            'scheduled_for' => $scheduled_for,
            'status' => 'pending',
            'context_data' => $queue_item['context_data'],
            'created_at' => current_time('mysql', true),
        ]);
    }

    /** @return array<int, array<string, mixed>>|null */
    private function getPendingQueueItems(int $limit = 50)
    {
        $items = $this->db->get_results(
            $this->db->prepare(
                "SELECT * FROM {$this->queueTable}
                WHERE status = 'pending'
                AND scheduled_for <= %s
                ORDER BY scheduled_for ASC
                LIMIT %d",
                current_time('mysql', true),
                $limit
            ),
            ARRAY_A
        );

        if (!is_array($items)) {
            return null;
        }

        // $wpdb returns every column as a string; cast id columns so the
        // int-typed helper methods don't fatal under declare(strict_types=1).
        foreach ($items as &$item) {
            $item = $this->castQueueItemIds($item);
        }

        return $items;
    }

    /**
     * Cast the integer id columns of a raw queue row from string to int.
     *
     * @param array<string, mixed> $item
     * @return array<string, mixed>
     */
    private function castQueueItemIds(array $item): array
    {
        foreach (['id', 'automation_id', 'contact_id', 'current_step_id', 'next_step_id', 'attempts'] as $key) {
            if (isset($item[$key]) && is_numeric($item[$key])) {
                $item[$key] = (int) $item[$key];
            }
        }

        return $item;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function getStep(int $step_id)
    {
        $step = $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->stepsTable} WHERE id = %d",
                $step_id
            ),
            ARRAY_A
        );

        return is_array($step) ? $this->castStepIds($step) : $step;
    }

    /**
     * Cast the integer id columns of a raw step row from string to int.
     *
     * @param array<string, mixed> $step
     * @return array<string, mixed>
     */
    private function castStepIds(array $step): array
    {
        foreach (['id', 'automation_id', 'parent_step_id'] as $key) {
            if (isset($step[$key]) && is_numeric($step[$key])) {
                $step[$key] = (int) $step[$key];
            }
        }

        return $step;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function getNextStepByParent(int $parent_id)
    {
        $step = $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->stepsTable} WHERE parent_step_id = %d LIMIT 1",
                $parent_id
            ),
            ARRAY_A
        );

        return is_array($step) ? $this->castStepIds($step) : $step;
    }

    /**
     * Get next step by branch (for condition nodes).
     *
     * @return array<string, mixed>|null
     */
    private function getNextStepByBranch(int $parent_id, string $branch)
    {
        $step = $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->stepsTable}
                WHERE parent_step_id = %d
                AND branch_type = %s
                LIMIT 1",
                $parent_id,
                $branch
            ),
            ARRAY_A
        );

        return is_array($step) ? $this->castStepIds($step) : $step;
    }

    /**
     * @param array<string, mixed> $data
     * @return int|false
     */
    private function updateQueueItem(int $id, array $data)
    {
        // Keep updated_at in UTC (see claimQueueItem): the column is
        // ON UPDATE CURRENT_TIMESTAMP (DB-session-local), so every write stamps
        // it explicitly unless the caller already provided one.
        $data['updated_at'] ??= current_time('mysql', true);

        return $this->db->update(
            $this->queueTable,
            $data,
            ['id' => $id]
        );
    }

    /**
     * @return int|false
     */
    private function deleteQueueItem(int $id)
    {
        return $this->db->delete($this->queueTable, ['id' => $id]);
    }

    /**
     * The contact's enrolment status in this automation, or null when they are
     * not enrolled (an orphaned queue row).
     */
    private function getEnrollmentStatus(int $automation_id, int $contact_id): ?string
    {
        $status = $this->db->get_var(
            $this->db->prepare(
                "SELECT status FROM {$this->contactsTable} WHERE automation_id = %d AND contact_id = %d",
                $automation_id,
                $contact_id
            )
        );

        return null === $status ? null : (string) $status;
    }

    /**
     * Update contact status in automation
     */
    private function updateContactStatus(int $automation_id, int $contact_id, string $status): void
    {
        // Only an enrolment that is still running may be completed or failed —
        // never one the sweeper cancelled, which is terminal. Guarding the write
        // (rather than the caller) also keeps the counter maths below honest:
        // it runs only when a row actually changed.
        if ('completed' === $status) {
            $sql = $this->db->prepare(
                "UPDATE {$this->contactsTable}
                 SET status = %s, completed_at = %s
                 WHERE automation_id = %d AND contact_id = %d AND status = %s",
                $status,
                current_time('mysql', true),
                $automation_id,
                $contact_id,
                AutomationRepository::STATUS_ACTIVE
            );
        } else {
            $sql = $this->db->prepare(
                "UPDATE {$this->contactsTable}
                 SET status = %s
                 WHERE automation_id = %d AND contact_id = %d AND status = %s",
                $status,
                $automation_id,
                $contact_id,
                AutomationRepository::STATUS_ACTIVE
            );
        }

        if (!$sql || !$this->db->query($sql)) {
            return;
        }

        // Update automation stats
        if ($status === 'completed') {
            $this->db->query($this->db->prepare(
                "UPDATE {$this->db->prefix}kelune_crm_automations
                SET active_contacts = active_contacts - 1,
                    completed_contacts = completed_contacts + 1,
                    updated_at = %s
                WHERE id = %d",
                current_time('mysql', true),
                $automation_id
            ) ?: '');
        } elseif ($status === 'failed') {
            $this->db->query($this->db->prepare(
                "UPDATE {$this->db->prefix}kelune_crm_automations
                SET active_contacts = active_contacts - 1,
                    updated_at = %s
                WHERE id = %d",
                current_time('mysql', true),
                $automation_id
            ) ?: '');
        }
    }

    /**
     * @param array<string, mixed> $item
     * @param array<string, mixed> $step
     * @param array<string, mixed> $result
     */
    private function logExecution(array $item, array $step, array $result, float $execution_time): void
    {
        $this->db->insert($this->logsTable, [
            'automation_id' => $item['automation_id'],
            'contact_id' => $item['contact_id'],
            'step_id' => $step['id'],
            'action' => $step['action_type'] ?? $step['step_type'],
            'action_result' => $result['success'] ? 'success' : 'failed',
            'details' => json_encode($result),
            'execution_time_ms' => (int) $execution_time,
            'created_at' => current_time('mysql', true),
        ]);
    }

    /** @param array<string, mixed> $item */
    private function logError(array $item, string $error_message): void
    {
        \KeluneCRM\Core\Debug::log(sprintf(
            '[KeluneCRM Automation] Error processing queue item #%d: %s',
            $item['id'],
            $error_message
        ));

        $this->db->insert($this->logsTable, [
            'automation_id' => $item['automation_id'],
            'contact_id' => $item['contact_id'],
            'step_id' => $item['next_step_id'],
            'action' => 'error',
            'action_result' => 'failed',
            'details' => json_encode(['error' => $error_message]),
            'execution_time_ms' => 0,
            'created_at' => current_time('mysql', true),
        ]);
    }

    /** @param string $delay_type */
    private function calculateDelayMinutes($delay_type, int $delay_value): int
    {
        switch ($delay_type) {
            case 'minutes':
                return $delay_value;
            case 'hours':
                return $delay_value * 60;
            case 'days':
                return $delay_value * 1440; // 24 * 60
            case 'weeks':
                return $delay_value * 10080; // 7 * 24 * 60
            default:
                return $delay_value * 1440; // Default to days
        }
    }
}
