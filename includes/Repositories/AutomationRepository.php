<?php

declare(strict_types=1);

namespace KeluneCRM\Repositories;

use KeluneCRM\Models\Automation;
use KeluneCRM\Models\Contact;

class AutomationRepository
{
    /** Enrolment is running. */
    public const STATUS_ACTIVE = 'active';

    /**
     * Enrolment (and its queue row) is held: the contact hasn't confirmed their
     * double opt-in yet. Resumable — confirming opt-in returns it to active.
     */
    public const STATUS_PARKED = 'parked';

    /**
     * Enrolment is terminated because the contact stopped being mailable
     * (unsubscribed, bounced). Never resumes: re-subscribing does not rewind an
     * automation a contact was removed from.
     */
    public const STATUS_CANCELLED = 'cancelled';

    /** A queue row waiting for its scheduled_for; the only state claimed. */
    public const QUEUE_STATUS_PENDING = 'pending';

    /** A queue row a worker has claimed and is running. */
    public const QUEUE_STATUS_PROCESSING = 'processing';

    /** @var \wpdb */
    private $db;
    private string $automationsTable;
    private string $automationStepsTable;
    private string $automationLogsTable;
    private string $automationQueueTable;
    private string $automationContactsTable;
    private string $contactsTable;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $prefix = $wpdb->prefix . 'kelune_crm_';
        $this->contactsTable = $prefix . 'contacts';
        $this->automationsTable = $prefix . 'automations';
        $this->automationStepsTable = $prefix . 'automation_steps';
        $this->automationLogsTable = $prefix . 'automation_logs';
        $this->automationQueueTable = $prefix . 'automation_queue';
        $this->automationContactsTable = $prefix . 'automation_contacts';
    }

    /** @param int $id */
    public function find($id): ?\KeluneCRM\Models\Automation
    {
        $row = $this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->automationsTable} WHERE id = %d", $id),
            ARRAY_A
        );

        return $row ? new Automation($row) : null;
    }

    /**
     * @param array<string, mixed> $params
     * @return array<int, \KeluneCRM\Models\Automation>
     */
    public function getAll($params = []): array
    {
        $page = $params['page'] ?? 1;
        $per_page = $params['per_page'] ?? 20;
        $offset = ($page - 1) * $per_page;
        $search = $params['search'] ?? '';
        $status = $params['status'] ?? '';
        $trigger_type = $params['trigger_type'] ?? '';

        $where = ['1=1'];

        if (!empty($search)) {
            $search = '%' . $this->db->esc_like($search) . '%';
            $where[] = $this->db->prepare('(name LIKE %s OR description LIKE %s)', $search, $search);
        }

        if (!empty($status)) {
            $where[] = $this->db->prepare('status = %s', $status);
        }

        if (!empty($trigger_type)) {
            $where[] = $this->db->prepare('trigger_type = %s', $trigger_type);
        }

        $where_clause = implode(' AND ', $where);

        [$orderby, $order] = $this->resolveOrderBy($params);

        $query = "SELECT * FROM {$this->automationsTable} WHERE {$where_clause} ORDER BY {$orderby} {$order} LIMIT %d OFFSET %d";

        $results = $this->db->get_results(
            $this->db->prepare($query, $per_page, $offset),
            ARRAY_A
        ) ?: [];

        return array_map(fn ($row): \KeluneCRM\Models\Automation => new Automation($row), $results);
    }

    /**
     * Resolve a safe ORDER BY column + direction. The column is allow-listed and
     * the direction constrained to ASC/DESC; default is id DESC.
     *
     * @param array<string, mixed> $params
     * @return array{0: string, 1: string}
     */
    private function resolveOrderBy($params): array
    {
        $allowed = [
            'id', 'name', 'status', 'trigger_type',
            'total_enrolled', 'last_triggered_at', 'created_at', 'updated_at',
        ];

        $orderby = (string) ($params['orderby'] ?? 'id');
        if (!in_array($orderby, $allowed, true)) {
            $orderby = 'id';
        }

        $order = strtoupper((string) ($params['order'] ?? 'DESC'));
        if (!in_array($order, ['ASC', 'DESC'], true)) {
            $order = 'DESC';
        }

        return [$orderby, $order];
    }

    /** @param array<string, mixed> $params */
    public function getCount($params = []): int
    {
        $search = $params['search'] ?? '';
        $status = $params['status'] ?? '';
        $trigger_type = $params['trigger_type'] ?? '';

        $where = ['1=1'];

        if (!empty($search)) {
            $search = '%' . $this->db->esc_like($search) . '%';
            $where[] = $this->db->prepare('(name LIKE %s OR description LIKE %s)', $search, $search);
        }

        if (!empty($status)) {
            $where[] = $this->db->prepare('status = %s', $status);
        }

        if (!empty($trigger_type)) {
            $where[] = $this->db->prepare('trigger_type = %s', $trigger_type);
        }

        $where_clause = implode(' AND ', $where);

        return (int) $this->db->get_var("SELECT COUNT(*) FROM {$this->automationsTable} WHERE {$where_clause}");
    }

    /**
     * @param array<string, mixed> $data
     * @return int|false
     */
    public function create($data)
    {
        $insert_data = [
            'name' => $data['name'],
            'description' => $data['description'] ?? '',
            'status' => $data['status'] ?? 'draft',
            'trigger_type' => $data['trigger_type'],
            'trigger_config' => is_array($data['trigger_config'] ?? null) ? json_encode($data['trigger_config']) : null,
            'entry_conditions' => is_array($data['entry_conditions'] ?? null) ? json_encode($data['entry_conditions']) : null,
            'settings' => is_array($data['settings'] ?? null) ? json_encode($data['settings']) : null,
            // Reporting and authorship are never taken from the payload, so a
            // caller cannot spoof its numbers or attribute the automation elsewhere.
            'stats' => json_encode([]),
            'total_enrolled' => 0,
            'active_contacts' => 0,
            'completed_contacts' => 0,
            'conversion_rate' => 0.00,
            'created_by' => get_current_user_id(),
            'created_at' => current_time('mysql', true),
            // Seed updated_at UTC on create so a never-edited row doesn't carry
            // the DB-session-local time the CURRENT_TIMESTAMP default would write.
            'updated_at' => current_time('mysql', true),
        ];

        $result = $this->db->insert($this->automationsTable, $insert_data);

        if ($result) {
            return $this->db->insert_id;
        }

        return false;
    }

    /**
     * @param int $id
     * @param array<string, mixed> $data
     * @return bool
     */
    public function update($id, $data)
    {
        $update_data = [];

        $allowed_fields = [
            'name', 'description', 'status', 'trigger_type', 'trigger_config',
            'entry_conditions', 'settings', 'stats', 'total_enrolled',
            'active_contacts', 'completed_contacts', 'conversion_rate',
            'last_triggered_at',
        ];

        foreach ($allowed_fields as $field) {
            if (isset($data[$field])) {
                if (in_array($field, ['trigger_config', 'entry_conditions', 'settings', 'stats'])) {
                    $update_data[$field] = is_array($data[$field]) ? json_encode($data[$field]) : $data[$field];
                } else {
                    $update_data[$field] = $data[$field];
                }
            }
        }

        if (empty($update_data)) {
            return false;
        }

        $update_data['updated_at'] = current_time('mysql', true);

        $result = $this->db->update(
            $this->automationsTable,
            $update_data,
            ['id' => $id]
        );

        return $result !== false;
    }

    /** @param int $id */
    public function delete($id): bool
    {
        $this->db->delete($this->automationStepsTable, ['automation_id' => $id]);
        $this->db->delete($this->automationLogsTable, ['automation_id' => $id]);
        $this->db->delete($this->automationQueueTable, ['automation_id' => $id]);
        $this->db->delete($this->automationContactsTable, ['automation_id' => $id]);

        return $this->db->delete($this->automationsTable, ['id' => $id]) !== false;
    }

    /**
     * @param int $id
     * @return int|false
     */
    public function duplicate($id)
    {
        $automation = $this->find($id);

        if (!$automation) {
            return false;
        }

        $data = $automation->toArray();
        unset($data['id'], $data['created_at'], $data['updated_at'], $data['last_triggered_at']);

        $data['name'] = $data['name'] . ' (Copy)';
        $data['status'] = 'draft';
        $data['total_enrolled'] = 0;
        $data['active_contacts'] = 0;
        $data['completed_contacts'] = 0;
        $data['conversion_rate'] = 0.00;
        $data['stats'] = [];

        $new_automation_id = $this->create($data);

        if ($new_automation_id) {
            $steps = $this->db->get_results(
                $this->db->prepare(
                    "SELECT * FROM {$this->automationStepsTable} WHERE automation_id = %d ORDER BY step_order ASC, id ASC",
                    $id
                ),
                ARRAY_A
            ) ?: [];

            // Old step id => new step id, so the copied graph links to its own
            // steps. Copying parent_step_id verbatim would leave the clone
            // pointing into the source automation.
            $id_map = [];

            foreach ($steps as $step) {
                $step_data = $step;
                unset($step_data['id']);
                $step_data['automation_id'] = $new_automation_id;
                $step_data['parent_step_id'] = null;
                // Stamp fresh UTC timestamps on the clone rather than copying the
                // source row's (or relying on the DB DEFAULT, which is
                // session-local). Every moment in the product is stored UTC.
                $step_data['created_at'] = current_time('mysql', true);
                $step_data['updated_at'] = current_time('mysql', true);

                if ($this->db->insert($this->automationStepsTable, $step_data)) {
                    $id_map[(int) $step['id']] = (int) $this->db->insert_id;
                }
            }

            foreach ($steps as $step) {
                $old_id = (int) $step['id'];
                $old_parent = null === $step['parent_step_id'] ? null : (int) $step['parent_step_id'];

                if (null !== $old_parent && isset($id_map[$old_id], $id_map[$old_parent])) {
                    $this->db->update(
                        $this->automationStepsTable,
                        ['parent_step_id' => $id_map[$old_parent]],
                        ['id' => $id_map[$old_id]]
                    );
                }
            }
        }

        return $new_automation_id;
    }

    /**
     * @param int $id
     * @return bool
     */
    public function activate($id)
    {
        return $this->update($id, ['status' => 'active']);
    }

    /**
     * @param int $id
     * @return bool
     */
    public function pause($id)
    {
        return $this->update($id, ['status' => 'paused']);
    }

    /**
     * Settle the contacts waiting on steps that a workflow edit deleted.
     *
     * Their queue row points at a step that is about to stop existing, so there
     * is nothing left for them to run: the row is dropped and the enrolment
     * closed as completed. Called before the steps are deleted, so the executor
     * never sees a dangling next_step_id.
     *
     * @param int $automation_id
     * @param array<int, int> $step_ids
     */
    public function releaseRemovedSteps($automation_id, array $step_ids): void
    {
        $step_ids = array_values(array_filter(array_map('absint', $step_ids)));

        if (empty($step_ids)) {
            return;
        }

        $placeholders = implode(',', array_fill(0, count($step_ids), '%d'));
        $params = array_merge([(int) $automation_id], $step_ids);

        $contact_ids = $this->db->get_col(
            $this->db->prepare(
                "SELECT contact_id FROM {$this->automationQueueTable}
                WHERE automation_id = %d
                AND status IN ('pending', 'parked')
                AND next_step_id IN ({$placeholders})",
                ...$params
            )
        );

        $this->db->query(
            $this->db->prepare(
                "DELETE FROM {$this->automationQueueTable}
                WHERE automation_id = %d
                AND status IN ('pending', 'parked')
                AND next_step_id IN ({$placeholders})",
                ...$params
            ) ?: ''
        );

        foreach (array_map('intval', $contact_ids) as $contact_id) {
            $this->completeEnrollment((int) $automation_id, $contact_id);
        }
    }

    /**
     * Close a still-running enrolment as completed, keeping the automation's
     * cached counters in step. A no-op on an already terminal enrolment.
     */
    private function completeEnrollment(int $automation_id, int $contact_id): void
    {
        $updated = $this->db->query(
            $this->db->prepare(
                "UPDATE {$this->automationContactsTable}
                SET status = 'completed', completed_at = %s
                WHERE automation_id = %d AND contact_id = %d AND status = %s",
                current_time('mysql', true),
                $automation_id,
                $contact_id,
                self::STATUS_ACTIVE
            ) ?: ''
        );

        if (!$updated) {
            return;
        }

        $this->db->query(
            $this->db->prepare(
                "UPDATE {$this->automationsTable}
                SET active_contacts = GREATEST(active_contacts - 1, 0),
                    completed_contacts = completed_contacts + 1,
                    updated_at = %s
                WHERE id = %d",
                current_time('mysql', true),
                $automation_id
            ) ?: ''
        );
    }

    /**
     * @param int $automation_id
     * @return array<string, mixed>|null
     */
    public function getStats($automation_id): ?array
    {
        $automation = $this->find($automation_id);

        if (!$automation) {
            return null;
        }

        $enrollment_stats = $this->db->get_row(
            $this->db->prepare(
                "SELECT
                    COUNT(*) as total_enrolled,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_contacts,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_contacts,
                    SUM(CASE WHEN status = 'exited' THEN 1 ELSE 0 END) as exited_contacts,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_contacts
                FROM {$this->automationContactsTable}
                WHERE automation_id = %d",
                $automation_id
            ),
            ARRAY_A
        );

        $action_stats = $this->db->get_row(
            $this->db->prepare(
                "SELECT
                    COUNT(*) as total_actions,
                    SUM(CASE WHEN action_result = 'success' THEN 1 ELSE 0 END) as successful_actions,
                    SUM(CASE WHEN action_result = 'failed' THEN 1 ELSE 0 END) as failed_actions,
                    AVG(execution_time_ms) as avg_execution_time
                FROM {$this->automationLogsTable}
                WHERE automation_id = %d",
                $automation_id
            ),
            ARRAY_A
        );

        $total_enrolled = (int) ($enrollment_stats['total_enrolled'] ?? 0);
        $completed = (int) ($enrollment_stats['completed_contacts'] ?? 0);

        return [
            'total_enrolled' => $total_enrolled,
            'active_contacts' => (int) ($enrollment_stats['active_contacts'] ?? 0),
            'completed_contacts' => $completed,
            'exited_contacts' => (int) ($enrollment_stats['exited_contacts'] ?? 0),
            'failed_contacts' => (int) ($enrollment_stats['failed_contacts'] ?? 0),
            'completion_rate' => $total_enrolled > 0 ? round(($completed / $total_enrolled) * 100, 2) : 0,
            'total_actions' => (int) ($action_stats['total_actions'] ?? 0),
            'successful_actions' => (int) ($action_stats['successful_actions'] ?? 0),
            'failed_actions' => (int) ($action_stats['failed_actions'] ?? 0),
            'avg_execution_time' => round((float) ($action_stats['avg_execution_time'] ?? 0), 2),
        ];
    }

    /**
     * @param int $automation_id
     * @return array<string, mixed>|null
     */
    public function updateStats($automation_id)
    {
        $stats = $this->getStats($automation_id);

        if ($stats) {
            $this->update($automation_id, [
                'total_enrolled' => $stats['total_enrolled'],
                'active_contacts' => $stats['active_contacts'],
                'completed_contacts' => $stats['completed_contacts'],
                'conversion_rate' => $stats['completion_rate'],
                'stats' => $stats,
            ]);
        }

        return $stats;
    }

    /** @return array<string, mixed> */
    public function getSummaryStats(): array
    {
        $total = $this->db->get_var("SELECT COUNT(*) FROM {$this->automationsTable}");
        $active = $this->db->get_var($this->db->prepare("SELECT COUNT(*) FROM {$this->automationsTable} WHERE status = %s", 'active'));
        $paused = $this->db->get_var($this->db->prepare("SELECT COUNT(*) FROM {$this->automationsTable} WHERE status = %s", 'paused'));

        $avg_stats = $this->db->get_row(
            "SELECT
                AVG(conversion_rate) as avg_completion_rate,
                SUM(total_enrolled) as total_enrolled,
                SUM(active_contacts) as total_active,
                SUM(completed_contacts) as total_completed
            FROM {$this->automationsTable}
            WHERE status = 'active'",
            ARRAY_A
        );

        return [
            'total_automations' => (int) $total,
            'active_automations' => (int) $active,
            'paused_automations' => (int) $paused,
            'avg_completion_rate' => round((float) ($avg_stats['avg_completion_rate'] ?? 0), 2),
            'total_enrolled' => (int) ($avg_stats['total_enrolled'] ?? 0),
            'total_active' => (int) ($avg_stats['total_active'] ?? 0),
            'total_completed' => (int) ($avg_stats['total_completed'] ?? 0),
        ];
    }

    /**
     * Whether a contact enrols parked — i.e. is awaiting double opt-in.
     */
    private function isContactParked(int $contact_id): bool
    {
        $status = $this->db->get_var(
            $this->db->prepare("SELECT status FROM {$this->contactsTable} WHERE id = %d", $contact_id)
        );

        return Contact::STATUS_PENDING === $status;
    }

    /**
     * Hold a contact's running enrolments and queued steps until they confirm
     * their opt-in. Returns the number of enrolments parked.
     */
    public function parkContactEnrollments(int $contact_id): int
    {
        $automation_ids = $this->automationIdsForContact($contact_id);

        $this->setQueueStatusForContact($contact_id, self::STATUS_PARKED, [self::QUEUE_STATUS_PENDING]);

        // No exited_at: parking is a pause, not an exit.
        $parked = $this->setEnrollmentStatusForContact($contact_id, self::STATUS_PARKED, [self::STATUS_ACTIVE]);

        $this->syncActiveContactCounts($automation_ids);

        return $parked;
    }

    /**
     * Terminate a contact's enrolments and queued steps because they are no
     * longer mailable. Sweeps parked rows too — a contact who unsubscribes
     * before confirming opt-in must not be left waiting to resume. Returns the
     * number of enrolments cancelled.
     */
    public function cancelContactEnrollments(int $contact_id): int
    {
        $automation_ids = $this->automationIdsForContact($contact_id);

        // 'processing' rows are mid-flight, but the worker re-reads the
        // enrolment before acting (AutomationExecutor::processQueueItem), so it
        // sees the cancellation and abandons.
        $this->setQueueStatusForContact($contact_id, self::STATUS_CANCELLED, [
            self::QUEUE_STATUS_PENDING,
            self::QUEUE_STATUS_PROCESSING,
            self::STATUS_PARKED,
        ]);

        $cancelled = $this->setEnrollmentStatusForContact(
            $contact_id,
            self::STATUS_CANCELLED,
            [self::STATUS_ACTIVE, self::STATUS_PARKED],
            ['exited_at' => current_time('mysql', true)]
        );

        $this->syncActiveContactCounts($automation_ids);

        return $cancelled;
    }

    /**
     * Return a contact's parked enrolments to active once mailable again.
     * Parked rows only — cancelled is terminal. Their queue rows are already due
     * (scheduled_for sat still while parked), so they resume next batch.
     * Returns the number resumed.
     */
    public function resumeContactEnrollments(int $contact_id): int
    {
        $automation_ids = $this->automationIdsForContact($contact_id);

        // Enrolment first, THEN its queue rows. Freeing the row first lets a
        // drainer claim it, re-read a still-parked enrolment, re-park the row
        // and strand it forever. A row cannot be claimed until pending, by
        // which point the enrolment already reads active.
        $resumed = $this->setEnrollmentStatusForContact($contact_id, self::STATUS_ACTIVE, [self::STATUS_PARKED]);

        $this->setQueueStatusForContact($contact_id, self::QUEUE_STATUS_PENDING, [self::STATUS_PARKED]);

        $this->syncActiveContactCounts($automation_ids);

        return $resumed;
    }

    /**
     * Every automation the contact is enrolled in, whatever the enrolment state.
     *
     * @return list<int>
     */
    private function automationIdsForContact(int $contact_id): array
    {
        $ids = $this->db->get_col(
            $this->db->prepare(
                "SELECT DISTINCT automation_id FROM {$this->automationContactsTable} WHERE contact_id = %d",
                $contact_id
            ) ?: ''
        );

        return array_values(array_map('intval', $ids));
    }

    /**
     * Recompute automations.active_contacts from the enrolment rows.
     *
     * The counter is otherwise maintained by increments scattered across the
     * enrolment and executor paths, which bulk status changes desynchronise.
     * Recomputing is simpler than teaching every transition, and self-heals
     * counts that already drifted.
     *
     * @param list<int> $automation_ids
     */
    private function syncActiveContactCounts(array $automation_ids): void
    {
        foreach ($automation_ids as $automation_id) {
            $this->db->query(
                $this->db->prepare(
                    "UPDATE {$this->automationsTable} a
                     SET a.active_contacts = (
                         SELECT COUNT(*) FROM {$this->automationContactsTable} ac
                         WHERE ac.automation_id = a.id AND ac.status = %s
                     ),
                     a.updated_at = %s
                     WHERE a.id = %d",
                    self::STATUS_ACTIVE,
                    current_time('mysql', true),
                    $automation_id
                ) ?: ''
            );
        }
    }

    /**
     * The enrolment table has no updated_at — it uses
     * enrolled_at/completed_at/exited_at, so callers pass the fitting stamp.
     *
     * @param list<string> $from Statuses eligible to change.
     * @param array<string, string> $extra Additional columns to set.
     * @return int Rows affected.
     */
    private function setEnrollmentStatusForContact(int $contact_id, string $to, array $from, array $extra = []): int
    {
        return $this->setStatusForContact($this->automationContactsTable, $contact_id, $to, $from, $extra);
    }

    /**
     * @param list<string> $from Statuses eligible to change.
     * @return int Rows affected.
     */
    private function setQueueStatusForContact(int $contact_id, string $to, array $from): int
    {
        return $this->setStatusForContact(
            $this->automationQueueTable,
            $contact_id,
            $to,
            $from,
            ['updated_at' => current_time('mysql', true)]
        );
    }

    /**
     * @param list<string> $from Statuses eligible to change.
     * @param array<string, string> $extra Additional columns to set. Keys are
     *                                     internal column names, never input.
     * @return int Rows affected.
     */
    private function setStatusForContact(string $table, int $contact_id, string $to, array $from, array $extra = []): int
    {
        if ([] === $from) {
            return 0;
        }

        $set = array_merge(['status' => $to], $extra);
        $assignments = implode(', ', array_map(
            static fn (string $column): string => "{$column} = %s",
            array_keys($set)
        ));
        $placeholders = implode(', ', array_fill(0, count($from), '%s'));

        $sql = $this->db->prepare(
            "UPDATE {$table} SET {$assignments} WHERE contact_id = %d AND status IN ({$placeholders})",
            array_merge(array_values($set), [$contact_id], $from)
        );

        if (!$sql) {
            return 0;
        }

        return (int) $this->db->query($sql);
    }

    /**
     * Enroll contact in automation
     *
     * @param int $automation_id
     * @param int $contact_id
     * @param array<string, mixed> $context_data
     */
    public function enrollContact($automation_id, $contact_id, $context_data = []): bool
    {
        $automation = $this->find($automation_id);
        if (!$automation || !$automation->canEnroll()) {
            return false;
        }

        // Unique key (automation_id, contact_id) → at most one row per contact,
        // so a prior enrolment is reused. Fetch it whole: its status and
        // terminal timestamps decide whether re-entry is allowed.
        $existing = $this->db->get_row(
            $this->db->prepare(
                "SELECT id, status, completed_at, exited_at, times_enrolled
                 FROM {$this->automationContactsTable}
                 WHERE automation_id = %d AND contact_id = %d",
                $automation_id,
                $contact_id
            )
        );

        // Parked counts as enrolled: the enrolment is merely waiting on an
        // opt-in, so re-triggering must not create a second one that would both
        // resume on confirmation.
        if ($existing && in_array($existing->status, [self::STATUS_ACTIVE, self::STATUS_PARKED], true)) {
            return false; // Already enrolled
        }

        // A terminal prior enrolment (completed/exited/cancelled) means the
        // contact has run before. Whether they may run again — and how soon — is
        // governed by the automation's re-entry policy.
        if ($existing && !$this->reentryPermitted($automation, $existing)) {
            return false;
        }

        // A contact awaiting double opt-in enrols parked, so the automation
        // waits for consent instead of running steps they can't be mailed for.
        // Confirming opt-in resumes it (Handlers\ContactStatusSweeper).
        $enrollment_status = $this->isContactParked($contact_id)
            ? self::STATUS_PARKED
            : self::STATUS_ACTIVE;

        if ($existing) {
            // Re-entry: reset the existing row to a fresh run (the unique key
            // forbids a second insert) and clear any residual queue items from
            // the previous run before the first step is re-queued below.
            $result = $this->db->update(
                $this->automationContactsTable,
                [
                    'status' => $enrollment_status,
                    'current_step_id' => null,
                    'enrolled_at' => current_time('mysql', true),
                    'completed_at' => null,
                    'exited_at' => null,
                    'times_enrolled' => (int) $existing->times_enrolled + 1,
                    'context_data' => json_encode($context_data),
                ],
                ['id' => (int) $existing->id]
            );

            if (false !== $result) {
                $this->db->delete($this->automationQueueTable, [
                    'automation_id' => $automation_id,
                    'contact_id' => $contact_id,
                ]);
            }
        } else {
            $result = $this->db->insert($this->automationContactsTable, [
                'automation_id' => $automation_id,
                'contact_id' => $contact_id,
                'status' => $enrollment_status,
                'enrolled_at' => current_time('mysql', true),
                'times_enrolled' => 1,
                'context_data' => json_encode($context_data),
            ]);
        }

        if (false !== $result) {
            $queued_ready = false;

            $first_step = $this->db->get_var(
                $this->db->prepare(
                    "SELECT id FROM {$this->automationStepsTable} WHERE automation_id = %d ORDER BY step_order ASC LIMIT 1",
                    $automation_id
                )
            );

            if ($first_step) {
                $queued_ready = self::STATUS_PARKED !== $enrollment_status;

                $this->db->insert($this->automationQueueTable, [
                    'automation_id' => $automation_id,
                    'contact_id' => $contact_id,
                    'next_step_id' => $first_step,
                    'scheduled_for' => current_time('mysql', true),
                    // 'pending' is the ready-to-run state and the executor
                    // claims on it only, so holding a parked enrolment's row
                    // back is what keeps that contact out of the batch.
                    'status' => self::STATUS_PARKED === $enrollment_status
                        ? self::STATUS_PARKED
                        : self::QUEUE_STATUS_PENDING,
                    'context_data' => json_encode($context_data),
                    'created_at' => current_time('mysql', true),
                ]);
            }

            // Stamp last-triggered (an enrolment is the automation firing for a
            // contact). A parked enrolment is not yet active, so it must not
            // count towards active_contacts until resumed.
            $active_increment = self::STATUS_ACTIVE === $enrollment_status ? 1 : 0;

            $this->db->query(
                $this->db->prepare(
                    "UPDATE {$this->automationsTable} SET total_enrolled = total_enrolled + 1, active_contacts = active_contacts + %d, last_triggered_at = %s, updated_at = %s WHERE id = %d",
                    $active_increment,
                    current_time('mysql', true),
                    current_time('mysql', true),
                    $automation_id
                ) ?: ''
            );

            // A ready enrolment just queued a step due now — drain immediately
            // via the loopback instead of waiting for the next cron minute.
            // Debounced, so a bulk enrolment fires one request, not one each.
            if ($queued_ready) {
                \KeluneCRM\Services\QueueRunner::kick('automations');
            }

            return true;
        }

        return false;
    }

    /**
     * Whether a contact with a terminal prior enrolment may be enrolled again.
     *
     * Re-entry off means run-once → blocked. With it on, a wait window (days)
     * is measured from when the previous run ended (completed, else exited).
     * A zero wait, or no terminal timestamp to anchor on, allows re-entry.
     *
     * @param \KeluneCRM\Models\Automation $automation
     * @param \stdClass $existing Row with completed_at / exited_at.
     */
    private function reentryPermitted($automation, $existing): bool
    {
        $reentry = $automation->getReentryConfig();

        if (empty($reentry['allow'])) {
            return false; // Run once per contact.
        }

        $wait_days = (float) $reentry['wait_days'];
        if ($wait_days <= 0) {
            return true; // Re-entry allowed with no cooldown.
        }

        $anchor = $existing->completed_at ?: ($existing->exited_at ?: null);
        if (empty($anchor)) {
            return true; // Nothing to measure the wait from.
        }

        // Stored timestamps are UTC (current_time('mysql', true)); pin the parse
        // to UTC so the comparison is not skewed by the server's local timezone.
        $anchor_ts = strtotime((string) $anchor . ' UTC');
        if (false === $anchor_ts) {
            return true;
        }

        $ready_ts = $anchor_ts + (int) round($wait_days * DAY_IN_SECONDS);

        return time() >= $ready_ts;
    }

    /**
     * @param string $trigger_type
     * @return array<int, \KeluneCRM\Models\Automation>
     */
    public function getByTriggerType($trigger_type): array
    {
        $results = $this->db->get_results(
            $this->db->prepare(
                "SELECT * FROM {$this->automationsTable} WHERE status = 'active' AND trigger_type = %s",
                $trigger_type
            ),
            ARRAY_A
        ) ?: [];

        return array_map(fn ($row): \KeluneCRM\Models\Automation => new Automation($row), $results);
    }
}
