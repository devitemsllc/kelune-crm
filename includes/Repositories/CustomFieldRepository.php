<?php

declare(strict_types=1);

namespace KeluneCRM\Repositories;

use KeluneCRM\Models\CustomField;

class CustomFieldRepository
{
    /** @var \wpdb */
    private $db;
    private string $tableName;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $this->tableName = $wpdb->prefix . 'kelune_crm_custom_fields';
    }

    /**
     * @param array<string, mixed> $params Pagination and search parameters
     * @return array<int, \KeluneCRM\Models\CustomField>
     */
    public function getAll($params = []): array
    {
        $page = $params['page'] ?? 1;
        $per_page = $params['per_page'] ?? 100;
        $offset = ($page - 1) * $per_page;
        $where_values = [];
        $where = $this->buildWhere($params, $where_values);

        $query = "SELECT * FROM {$this->tableName} {$where} ORDER BY field_order ASC, field_label ASC LIMIT %d OFFSET %d";
        $where_values[] = $per_page;
        $where_values[] = $offset;

        $query = $this->db->prepare($query, $where_values);

        $results = $this->db->get_results($query, ARRAY_A) ?: [];

        $fields = [];
        foreach ($results as $row) {
            $fields[] = new CustomField($row);
        }

        return $fields;
    }

    /** @param array<string, mixed> $filters Search and filter parameters */
    public function getCount($filters = []): int
    {
        $where_values = [];
        $where = $this->buildWhere($filters, $where_values);

        $query = "SELECT COUNT(*) FROM {$this->tableName} {$where}";

        if (!empty($where_values)) {
            $query = $this->db->prepare($query, $where_values);
        }

        return (int) $this->db->get_var($query);
    }

    /**
     * Build the shared WHERE clause for list/count queries from search + filters.
     * Collects placeholder values into $where_values (by reference) for prepare().
     *
     * @param array<string, mixed> $params
     * @param array<int, mixed>    $where_values Populated with placeholder values
     * @return string WHERE clause (empty string when no filters apply)
     */
    private function buildWhere($params, array &$where_values): string
    {
        $search = $params['search'] ?? '';
        $field_type = $params['field_type'] ?? '';
        $required = $params['required'] ?? '';

        $where_clauses = [];

        if (!empty($search)) {
            $search = '%' . $this->db->esc_like($search) . '%';
            $where_clauses[] = '(field_label LIKE %s OR field_key LIKE %s)';
            $where_values[] = $search;
            $where_values[] = $search;
        }

        if ($field_type !== '') {
            $where_clauses[] = 'field_type = %s';
            $where_values[] = (string) $field_type;
        }

        if ($required !== '') {
            $where_clauses[] = 'field_required = %d';
            $where_values[] = (int) $required;
        }

        return empty($where_clauses) ? '' : 'WHERE ' . implode(' AND ', $where_clauses);
    }

    /** @param int $id */
    public function find($id): ?\KeluneCRM\Models\CustomField
    {
        $result = $this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->tableName} WHERE id = %d", $id),
            ARRAY_A
        );

        return $result ? new CustomField($result) : null;
    }

    /** @param string $field_key */
    public function findByKey($field_key): ?\KeluneCRM\Models\CustomField
    {
        $result = $this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->tableName} WHERE field_key = %s", $field_key),
            ARRAY_A
        );

        return $result ? new CustomField($result) : null;
    }

    /**
     * @param array<string, mixed> $data
     * @return int|false Field ID on success, false on failure
     */
    public function create($data)
    {
        if (empty($data['field_key']) && !empty($data['field_label'])) {
            $data['field_key'] = CustomField::sanitizeKey($data['field_label']);
        }

        if ($this->findByKey($data['field_key'])) {
            return false;
        }

        if (!isset($data['field_order'])) {
            $max_order = $this->db->get_var("SELECT MAX(field_order) FROM {$this->tableName}");
            $data['field_order'] = $max_order !== null ? (int) $max_order + 1 : 1;
        }

        $field_options = null;
        if (!empty($data['field_options'])) {
            $field_options = is_array($data['field_options'])
                ? json_encode($data['field_options'])
                : $data['field_options'];
        }

        $result = $this->db->insert(
            $this->tableName,
            [
                'field_key' => $data['field_key'],
                'field_label' => $data['field_label'],
                'field_type' => $data['field_type'] ?? 'text',
                'field_options' => $field_options,
                'field_default' => $data['field_default'] ?? '',
                'field_required' => isset($data['field_required']) ? (int) $data['field_required'] : 0,
                'field_order' => (int) $data['field_order'],
                'created_at' => current_time('mysql', true),
            ]
        );

        return $result ? $this->db->insert_id : false;
    }

    /**
     * @param int $id
     * @param array<string, mixed> $data
     * @return bool
     */
    public function update($id, $data)
    {
        $current = $this->find($id);
        if (!$current) {
            return false;
        }

        // Reject a rename onto a key another field already uses.
        if (!empty($data['field_key']) && $data['field_key'] !== $current->field_key) {
            if ($this->findByKey($data['field_key'])) {
                return false;
            }
        }

        $field_options = null;
        if (isset($data['field_options'])) {
            $field_options = is_array($data['field_options'])
                ? json_encode($data['field_options'])
                : $data['field_options'];
        }

        $update_data = [];
        $formats = [];

        if (isset($data['field_key'])) {
            $update_data['field_key'] = $data['field_key'];
            $formats[] = '%s';
        }
        if (isset($data['field_label'])) {
            $update_data['field_label'] = $data['field_label'];
            $formats[] = '%s';
        }
        if (isset($data['field_type'])) {
            $update_data['field_type'] = $data['field_type'];
            $formats[] = '%s';
        }
        if (isset($data['field_options'])) {
            $update_data['field_options'] = $field_options;
            $formats[] = '%s';
        }
        if (isset($data['field_default'])) {
            $update_data['field_default'] = $data['field_default'];
            $formats[] = '%s';
        }
        if (isset($data['field_required'])) {
            $update_data['field_required'] = (int) $data['field_required'];
            $formats[] = '%d';
        }
        if (isset($data['field_order'])) {
            $update_data['field_order'] = (int) $data['field_order'];
            $formats[] = '%d';
        }

        if (empty($update_data)) {
            return false;
        }

        return $this->db->update(
            $this->tableName,
            $update_data,
            ['id' => $id],
            $formats,
            ['%d']
        ) !== false;
    }

    /** @param int $id */
    public function delete($id): bool
    {
        return $this->db->delete($this->tableName, ['id' => $id]) !== false;
    }

    /** @param mixed $field_orders Array of ['id' => field_id, 'field_order' => order] */
    public function reorder($field_orders): bool
    {
        if (empty($field_orders) || !is_array($field_orders)) {
            return false;
        }

        foreach ($field_orders as $order) {
            if (!isset($order['id']) || !isset($order['field_order'])) {
                continue;
            }

            $this->db->update(
                $this->tableName,
                ['field_order' => (int) $order['field_order']],
                ['id' => (int) $order['id']]
            );
        }

        return true;
    }
}
