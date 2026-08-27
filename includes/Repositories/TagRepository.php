<?php

declare(strict_types=1);

namespace KeluneCRM\Repositories;

use KeluneCRM\Models\Tag;

class TagRepository
{
    /** @var \wpdb */
    private $db;
    private string $tableName;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $this->tableName = $wpdb->prefix . 'kelune_crm_tags';
    }

    /**
     * @param array<string, mixed> $params
     * @return array<int, Tag>
     */
    public function getAll(array $params = []): array
    {
        $page = $params['page'] ?? 1;
        $per_page = $params['per_page'] ?? 100;
        $offset = ($page - 1) * $per_page;
        $search = $params['search'] ?? '';

        $where = '';
        if (!empty($search)) {
            $search = '%' . $this->db->esc_like($search) . '%';
            $where = $this->db->prepare('WHERE name LIKE %s', $search);
        }

        [$orderby, $order] = $this->resolveOrder($params);

        // Join the junction table so `contact_count` is a computed column the
        // query can sort by (the stored column is not maintained).
        $junction = $this->db->prefix . 'kelune_crm_contact_tags';
        $query = "SELECT t.*, COUNT(ct.contact_id) AS contact_count
            FROM {$this->tableName} t
            LEFT JOIN {$junction} ct ON ct.tag_id = t.id
            {$where}
            GROUP BY t.id
            ORDER BY {$orderby} {$order}
            LIMIT %d OFFSET %d";

        $rows = $this->db->get_results(
            $this->db->prepare($query, $per_page, $offset),
            ARRAY_A
        ) ?: [];

        return array_map(static fn (array $row): Tag => new Tag($row), $rows);
    }

    /**
     * Resolve a safe ORDER BY column + direction from a whitelist of real
     * columns, so untrusted orderby/order params can never be interpolated raw.
     *
     * @param array<string, mixed> $params
     * @return array{0: string, 1: string}
     */
    private function resolveOrder(array $params): array
    {
        $allowed = ['id', 'name', 'contact_count', 'created_at'];
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

    /**
     * @return string|null
     */
    public function getCount(string $search = '')
    {
        $where = '';
        if (!empty($search)) {
            $search = '%' . $this->db->esc_like($search) . '%';
            $where = $this->db->prepare('WHERE name LIKE %s', $search);
        }

        return $this->db->get_var("SELECT COUNT(*) FROM {$this->tableName} {$where}");
    }

    public function find(int $id): ?Tag
    {
        $row = $this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->tableName} WHERE id = %d", $id),
            ARRAY_A
        );

        return $row ? new Tag($row) : null;
    }

    public function findByName(string $name): ?Tag
    {
        // Oldest match wins if duplicate names exist, so the result is stable.
        $row = $this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->tableName} WHERE name = %s ORDER BY id ASC LIMIT 1", $name),
            ARRAY_A
        );

        return $row ? new Tag($row) : null;
    }

    /**
     * @param array<string, mixed> $data
     * @return int|false
     */
    public function create(array $data)
    {
        $result = $this->db->insert(
            $this->tableName,
            [
                'name' => $data['name'],
                'slug' => sanitize_title($data['name']),
                'description' => $data['description'] ?? '',
                'created_at' => current_time('mysql', true),
            ]
        );

        return $result ? $this->db->insert_id : false;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $update_data = [];

        // The slug tracks the name, so it is rewritten only alongside one.
        if (isset($data['name'])) {
            $update_data['name'] = $data['name'];
            $update_data['slug'] = sanitize_title((string) $data['name']);
        }

        if (isset($data['description'])) {
            $update_data['description'] = $data['description'];
        }

        if (empty($update_data)) {
            return false;
        }

        return $this->db->update($this->tableName, $update_data, ['id' => $id]) !== false;
    }

    public function delete(int $id): bool
    {
        // Remove membership rows before the tag itself.
        $contactTagsTable = $this->db->prefix . 'kelune_crm_contact_tags';
        $this->db->delete($contactTagsTable, ['tag_id' => $id]);

        return $this->db->delete($this->tableName, ['id' => $id]) !== false;
    }

    /**
     * @return string|null
     */
    public function getContactCount(int $tag_id)
    {
        $contactTagsTable = $this->db->prefix . 'kelune_crm_contact_tags';
        return $this->db->get_var(
            $this->db->prepare("SELECT COUNT(*) FROM {$contactTagsTable} WHERE tag_id = %d", $tag_id)
        );
    }
}
