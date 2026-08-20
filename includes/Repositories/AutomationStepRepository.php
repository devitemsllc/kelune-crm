<?php

declare(strict_types=1);

namespace KeluneCRM\Repositories;

use KeluneCRM\Models\AutomationStep;

class AutomationStepRepository
{
    /** @var \wpdb */
    private $db;
    private string $automationStepsTable;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $prefix = $wpdb->prefix . 'kelune_crm_';
        $this->automationStepsTable = $prefix . 'automation_steps';
    }

    /** @param int $id */
    public function find($id): ?\KeluneCRM\Models\AutomationStep
    {
        $row = $this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->automationStepsTable} WHERE id = %d", $id),
            ARRAY_A
        );

        return $row ? new AutomationStep($row) : null;
    }

    /**
     * @param int $automation_id
     * @param string $order_by
     * @return array<int, \KeluneCRM\Models\AutomationStep>
     */
    public function getByAutomation($automation_id, $order_by = 'step_order'): array
    {
        $valid_order_fields = ['step_order', 'created_at', 'id'];
        $order_by = in_array($order_by, $valid_order_fields) ? $order_by : 'step_order';

        $results = $this->db->get_results(
            $this->db->prepare(
                "SELECT * FROM {$this->automationStepsTable} WHERE automation_id = %d ORDER BY {$order_by} ASC",
                $automation_id
            ),
            ARRAY_A
        ) ?: [];

        return array_map(fn ($row): \KeluneCRM\Models\AutomationStep => new AutomationStep($row), $results);
    }

    /**
     * @param int $parent_step_id
     * @return array<int, \KeluneCRM\Models\AutomationStep>
     */
    public function getChildSteps($parent_step_id): array
    {
        $results = $this->db->get_results(
            $this->db->prepare(
                "SELECT * FROM {$this->automationStepsTable} WHERE parent_step_id = %d ORDER BY step_order ASC",
                $parent_step_id
            ),
            ARRAY_A
        ) ?: [];

        return array_map(fn ($row): \KeluneCRM\Models\AutomationStep => new AutomationStep($row), $results);
    }

    /**
     * @param array<string, mixed> $data
     * @return int|false
     */
    public function create($data)
    {
        $insert_data = $this->stepColumns($data) + [
            'automation_id' => $data['automation_id'],
            'created_at' => current_time('mysql', true),
            // Seed updated_at UTC on create so a never-edited row doesn't carry
            // the DB-session-local time the CURRENT_TIMESTAMP default would write.
            'updated_at' => current_time('mysql', true),
        ];

        $result = $this->db->insert($this->automationStepsTable, $insert_data);

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
            'step_order', 'step_type', 'label', 'parent_step_id', 'branch_type',
            'action_type', 'action_config', 'condition_type', 'condition_config',
            'delay_type', 'delay_value', 'position_x', 'position_y',
        ];

        foreach ($allowed_fields as $field) {
            if (isset($data[$field])) {
                if (in_array($field, ['action_config', 'condition_config'])) {
                    $update_data[$field] = is_array($data[$field]) ? json_encode($data[$field]) : $data[$field];
                } else {
                    $update_data[$field] = $data[$field];
                }
            }
        }

        if (empty($update_data)) {
            return false;
        }

        // Stamp updated_at in UTC. The column is ON UPDATE CURRENT_TIMESTAMP,
        // which writes DB-session-local time; set it explicitly so the value
        // stays UTC like every other moment in the product.
        $update_data['updated_at'] = current_time('mysql', true);

        $result = $this->db->update(
            $this->automationStepsTable,
            $update_data,
            ['id' => $id]
        );

        return $result !== false;
    }

    /**
     * @param int $id
     * @return bool
     */
    public function delete($id)
    {
        $step = $this->find($id);
        if ($step && $step->isTrigger()) {
            return false; // Trigger steps cannot be deleted.
        }

        // Cascade to child steps (branches).
        $child_steps = $this->getChildSteps($id);
        foreach ($child_steps as $child) {
            $this->delete((int) $child->id);
        }

        return $this->db->delete($this->automationStepsTable, ['id' => $id]) !== false;
    }

    /**
     * Persist the builder's whole graph, keeping step ids stable.
     *
     * A step the payload identifies by id is UPDATED in place; only genuinely
     * new nodes are inserted. That is what lets a running automation be edited:
     * queue rows reference steps by id, so recreating them would strand every
     * in-flight contact on an id that no longer exists.
     *
     * Steps absent from the payload are reported as `removed` rather than
     * deleted here — the caller must release their queue rows first.
     *
     * @param int $automation_id
     * @param array<int, array<string, mixed>> $steps
     * @return array{ids: array<int, int>, removed: array<int, int>}
     */
    public function syncSteps($automation_id, $steps): array
    {
        $existing_ids = $this->getIdsByAutomation((int) $automation_id);

        $ordered_ids = [];
        $parents = [];

        // First pass: upsert every step, leaving parent links for the second —
        // a step's parent may sit later in the payload and have no id yet.
        foreach ($steps as $index => $step_data) {
            $step_data['automation_id'] = $automation_id;

            $parents[$index] = [
                'parent_index' => $step_data['parent_index'] ?? null,
                'branch_type' => $step_data['branch_type'] ?? null,
            ];

            unset($step_data['parent_index']);
            $step_data['parent_step_id'] = null;

            $id = isset($step_data['id']) ? absint($step_data['id']) : 0;
            unset($step_data['id']);

            if ($id > 0 && in_array($id, $existing_ids, true)) {
                // Parent and branch are left to the second pass. Blanking them
                // here would open a window where a concurrently running
                // executor sees a step with no children and completes the
                // contact early.
                $columns = $this->stepColumns($step_data);
                unset($columns['parent_step_id'], $columns['branch_type']);

                $this->db->update(
                    $this->automationStepsTable,
                    $columns + ['updated_at' => current_time('mysql', true)],
                    ['id' => $id]
                );
            } else {
                $id = (int) $this->create($step_data);
            }

            if ($id > 0) {
                $ordered_ids[$index] = $id;
            }
        }

        // Second pass: wire parents now that every step has an id. Written
        // unconditionally so a step moved to the top of the graph loses its old
        // parent instead of keeping a stale link.
        foreach ($ordered_ids as $index => $step_id) {
            $parent_index = $parents[$index]['parent_index'];
            $parent_id = $parent_index !== null && isset($ordered_ids[$parent_index])
                ? $ordered_ids[$parent_index]
                : null;

            $this->db->update(
                $this->automationStepsTable,
                [
                    'parent_step_id' => $parent_id,
                    'branch_type' => $parents[$index]['branch_type'],
                    'updated_at' => current_time('mysql', true),
                ],
                ['id' => $step_id]
            );
        }

        return [
            'ids' => array_values($ordered_ids),
            'removed' => array_values(array_diff($existing_ids, array_values($ordered_ids))),
        ];
    }

    /**
     * Delete steps by id, without the parent cascade delete() applies — the
     * graph sync has already decided the exact set to remove.
     *
     * @param array<int, int> $ids
     */
    public function deleteSteps(array $ids): void
    {
        foreach ($ids as $id) {
            $this->db->delete($this->automationStepsTable, ['id' => absint($id)]);
        }
    }

    /**
     * A step plus every step beneath it, which is exactly what delete() removes.
     *
     * @param int $step_id
     * @return array<int, int>
     */
    public function getBranchIds($step_id): array
    {
        $ids = [(int) $step_id];

        foreach ($this->getChildSteps((int) $step_id) as $child) {
            $ids = array_merge($ids, $this->getBranchIds((int) $child->id));
        }

        return $ids;
    }

    /** @return array<int, int> */
    private function getIdsByAutomation(int $automation_id): array
    {
        $ids = $this->db->get_col(
            $this->db->prepare(
                "SELECT id FROM {$this->automationStepsTable} WHERE automation_id = %d",
                $automation_id
            )
        );

        return array_map('intval', $ids);
    }

    /**
     * The writable column map for a step payload. Every column is listed so an
     * update clears what the new step type does not use.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function stepColumns(array $data): array
    {
        return [
            'step_order' => $data['step_order'] ?? 0,
            'step_type' => $data['step_type'] ?? '',
            'label' => $data['label'] ?? null,
            'parent_step_id' => $data['parent_step_id'] ?? null,
            'branch_type' => $data['branch_type'] ?? null,
            'action_type' => $data['action_type'] ?? null,
            'action_config' => is_array($data['action_config'] ?? null) ? json_encode($data['action_config']) : null,
            'condition_type' => $data['condition_type'] ?? null,
            'condition_config' => is_array($data['condition_config'] ?? null) ? json_encode($data['condition_config']) : null,
            'delay_type' => $data['delay_type'] ?? null,
            'delay_value' => $data['delay_value'] ?? null,
            'position_x' => $data['position_x'] ?? 0,
            'position_y' => $data['position_y'] ?? 0,
        ];
    }

    /**
     * @param array<int|string, array<string, mixed>> $positions
     * @return bool
     */
    public function bulkUpdatePositions($positions)
    {
        $success = true;

        foreach ($positions as $step_id => $position) {
            $result = $this->update((int) $step_id, [
                'position_x' => $position['x'] ?? 0,
                'position_y' => $position['y'] ?? 0,
            ]);

            if (!$result) {
                $success = false;
            }
        }

        return $success;
    }

    /**
     * @param int $automation_id
     * @param array<int|string, mixed> $step_orders
     * @return bool
     */
    public function reorder($automation_id, $step_orders)
    {
        $success = true;

        foreach ($step_orders as $step_id => $order) {
            $result = $this->update((int) $step_id, [
                'step_order' => $order,
            ]);

            if (!$result) {
                $success = false;
            }
        }

        return $success;
    }

    /**
     * @param int $automation_id
     * @return array<int, string>
     */
    public function validateSequence($automation_id): array
    {
        $errors = [];
        $steps = $this->getByAutomation($automation_id);

        if (empty($steps)) {
            $errors[] = __('Automation must have at least one step', 'kelune-crm');
            return $errors;
        }

        $has_trigger = false;
        foreach ($steps as $step) {
            if ($step->isTrigger()) {
                $has_trigger = true;
                break;
            }
        }

        if (!$has_trigger) {
            $errors[] = __('Automation must have a trigger step', 'kelune-crm');
        }

        // Flag steps pointing at a parent that no longer exists.
        $step_ids = array_map(fn ($step) => $step->id, $steps);

        foreach ($steps as $step) {
            if ($step->parent_step_id && !in_array($step->parent_step_id, $step_ids)) {
                /* translators: %1$d: step ID, %2$d: parent step ID */
                $errors[] = sprintf(__('Step %1$d has invalid parent step %2$d', 'kelune-crm'), $step->id, $step->parent_step_id);
            }
        }

        // Each condition needs at least one outgoing branch. A condition may
        // wire up only YES (or only NO) — the unconnected path simply exits, so
        // requiring both branches is unnecessary.
        foreach ($steps as $step) {
            if ($step->isCondition()) {
                $branches = $this->getChildSteps((int) $step->id);
                $branch_types = array_map(fn ($b) => $b->branch_type, $branches);

                if (!in_array('yes', $branch_types, true) && !in_array('no', $branch_types, true)) {
                    /* translators: %d: step ID */
                    $errors[] = sprintf(__("Condition step %d must have a 'yes' or 'no' branch", 'kelune-crm'), $step->id);
                }
            }
        }

        return $errors;
    }
}
