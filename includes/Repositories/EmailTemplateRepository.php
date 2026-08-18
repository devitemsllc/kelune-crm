<?php

declare(strict_types=1);

namespace KeluneCRM\Repositories;

use KeluneCRM\Models\EmailTemplate;

class EmailTemplateRepository
{
    /** @var \wpdb */
    private $db;
    private string $tableName;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $this->tableName = $wpdb->prefix . 'kelune_crm_email_templates';
    }

    public function find(int $id): ?\KeluneCRM\Models\EmailTemplate
    {
        $sql = $this->db->prepare("SELECT * FROM {$this->tableName} WHERE id = %d", $id);
        $row = $this->db->get_row($sql, ARRAY_A);

        return $row ? new EmailTemplate($row) : null;
    }

    /**
     * @param array<string, mixed> $params
     * @return array<int, EmailTemplate>
     */
    public function getAll(array $params = []): array
    {
        $page = $params['page'] ?? 1;
        $per_page = $params['per_page'] ?? 20;
        $offset = ($page - 1) * $per_page;

        $where = ['1=1'];
        $where_values = [];

        if (!empty($params['search'])) {
            $where[] = '(name LIKE %s OR description LIKE %s)';
            $search_term = '%' . $this->db->esc_like($params['search']) . '%';
            $where_values[] = $search_term;
            $where_values[] = $search_term;
        }

        if (!empty($params['template_type'])) {
            $where[] = 'template_type = %s';
            $where_values[] = $params['template_type'];
        }

        if (isset($params['is_favorite'])) {
            $where[] = 'is_favorite = %d';
            $where_values[] = (int) $params['is_favorite'];
        }

        $where_clause = implode(' AND ', $where);

        // orderby is allow-listed because it is interpolated, not prepared.
        $allowed_orderby = ['id', 'name', 'template_type', 'usage_count', 'created_at', 'updated_at', 'last_used_at'];
        $orderby = $params['orderby'] ?? 'id';
        $orderby = in_array($orderby, $allowed_orderby, true) ? $orderby : 'id';
        $order = strtoupper($params['order'] ?? 'DESC');
        $order = in_array($order, ['ASC', 'DESC']) ? $order : 'DESC';

        if (!empty($where_values)) {
            $sql = $this->db->prepare(
                "SELECT * FROM {$this->tableName} WHERE {$where_clause} ORDER BY {$orderby} {$order} LIMIT %d OFFSET %d",
                array_merge($where_values, [$per_page, $offset])
            );
        } else {
            $sql = $this->db->prepare(
                "SELECT * FROM {$this->tableName} WHERE {$where_clause} ORDER BY {$orderby} {$order} LIMIT %d OFFSET %d",
                $per_page,
                $offset
            );
        }

        $results = $this->db->get_results($sql, ARRAY_A) ?: [];

        return array_map(function ($row): \KeluneCRM\Models\EmailTemplate {
            return new EmailTemplate($row);
        }, $results);
    }

    /** @param array<string, mixed> $filters */
    public function getCount(array $filters = []): int
    {
        $where = ['1=1'];
        $where_values = [];

        if (!empty($filters['search'])) {
            $where[] = '(name LIKE %s OR description LIKE %s)';
            $search_term = '%' . $this->db->esc_like($filters['search']) . '%';
            $where_values[] = $search_term;
            $where_values[] = $search_term;
        }

        if (!empty($filters['template_type'])) {
            $where[] = 'template_type = %s';
            $where_values[] = $filters['template_type'];
        }

        if (isset($filters['is_favorite'])) {
            $where[] = 'is_favorite = %d';
            $where_values[] = (int) $filters['is_favorite'];
        }

        $where_clause = implode(' AND ', $where);

        if (!empty($where_values)) {
            $sql = $this->db->prepare(
                "SELECT COUNT(*) FROM {$this->tableName} WHERE {$where_clause}",
                $where_values
            );
        } else {
            $sql = "SELECT COUNT(*) FROM {$this->tableName} WHERE {$where_clause}";
        }

        return (int) $this->db->get_var($sql);
    }

    /**
     * @param array<string, mixed> $data
     * @return int|false
     */
    public function create(array $data)
    {
        $insert_data = [
            'name' => $data['name'],
            'description' => $data['description'] ?? '',
            'thumbnail_url' => $data['thumbnail_url'] ?? '',
            'template_type' => $data['template_type'] ?? 'custom',
            'html_content' => $data['html_content'],
            'json_structure' => isset($data['json_structure']) ? $this->encodeJsonStructure($data['json_structure']) : null,
            'is_favorite' => isset($data['is_favorite']) ? (int) $data['is_favorite'] : 0,
            'usage_count' => 0,
            'created_by' => $data['created_by'] ?? get_current_user_id(),
            'created_at' => current_time('mysql', true),
            'updated_at' => current_time('mysql', true),
        ];

        $result = $this->db->insert($this->tableName, $insert_data);

        return $result ? $this->db->insert_id : false;
    }

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): bool
    {
        $update_data = [
            'updated_at' => current_time('mysql', true),
        ];

        $allowed_fields = ['name', 'description', 'thumbnail_url', 'html_content', 'is_favorite'];
        foreach ($allowed_fields as $field) {
            if (isset($data[$field])) {
                $update_data[$field] = $data[$field];
            }
        }

        if (isset($data['json_structure'])) {
            $update_data['json_structure'] = $this->encodeJsonStructure($data['json_structure']);
        }

        $result = $this->db->update(
            $this->tableName,
            $update_data,
            ['id' => $id]
        );

        return $result !== false;
    }

    /**
     * Normalize json_structure to a single JSON-encoded string for storage.
     * A value that is already a JSON string is stored as-is (encoding it again
     * would double-encode); arrays/objects are encoded once.
     *
     * @param mixed $value
     */
    private function encodeJsonStructure($value): ?string
    {
        if (is_string($value)) {
            return $value;
        }

        $encoded = json_encode($value);

        return $encoded === false ? null : $encoded;
    }

    public function delete(int $id): bool
    {
        $result = $this->db->delete(
            $this->tableName,
            ['id' => $id],
            ['%d']
        );

        return $result !== false;
    }

    public function toggleFavorite(int $id): bool
    {
        $current = $this->db->get_var(
            $this->db->prepare("SELECT is_favorite FROM {$this->tableName} WHERE id = %d", $id)
        );

        if ($current === null) {
            return false;
        }

        $new_status = $current ? 0 : 1;

        $result = $this->db->update(
            $this->tableName,
            ['is_favorite' => $new_status, 'updated_at' => current_time('mysql', true)],
            ['id' => $id]
        );

        return $result !== false;
    }
}
