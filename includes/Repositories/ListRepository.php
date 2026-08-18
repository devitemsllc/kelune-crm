<?php

declare(strict_types=1);

namespace KeluneCRM\Repositories;

use KeluneCRM\Models\ContactList;

class ListRepository
{
    /** @var \wpdb */
    private $db;
    private string $tableName;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $this->tableName = $wpdb->prefix . 'kelune_crm_lists';
    }

    /**
     * @param array<string, mixed> $params
     * @return array<int, ContactList>
     */
    public function getAll(array $params = []): array
    {
        $page = $params['page'] ?? 1;
        $per_page = $params['per_page'] ?? 100;
        $offset = ($page - 1) * $per_page;

        $where = $this->buildWhere($params);
        [$orderby, $order] = $this->resolveOrder($params);

        // Join the junction table so `contact_count` is a computed column the
        // query can sort by (the stored column is not maintained).
        $junction = $this->db->prefix . 'kelune_crm_contact_lists';
        $query = "SELECT l.*, COUNT(cl.contact_id) AS contact_count
            FROM {$this->tableName} l
            LEFT JOIN {$junction} cl ON cl.list_id = l.id
            {$where}
            GROUP BY l.id
            ORDER BY {$orderby} {$order}
            LIMIT %d OFFSET %d";

        $rows = $this->db->get_results(
            $this->db->prepare($query, $per_page, $offset),
            ARRAY_A
        ) ?: [];

        return array_map(static fn (array $row): ContactList => new ContactList($row), $rows);
    }

    /**
     * @param array<string, mixed>|string $params Filter params (search/status/type). A bare
     *                                             string is treated as the search term (BC).
     * @return string|null
     */
    public function getCount($params = '')
    {
        if (is_string($params)) {
            $params = ['search' => $params];
        }

        $where = $this->buildWhere($params);

        return $this->db->get_var("SELECT COUNT(*) FROM {$this->tableName} {$where}");
    }

    /**
     * Build the shared WHERE clause (search + status + type) with prepared values.
     *
     * @param array<string, mixed> $params
     */
    private function buildWhere(array $params): string
    {
        $clauses = [];

        $search = $params['search'] ?? '';
        if (!empty($search)) {
            $like = '%' . $this->db->esc_like((string) $search) . '%';
            $clauses[] = $this->db->prepare('name LIKE %s', $like);
        }

        $status = $params['status'] ?? '';
        if (!empty($status)) {
            $clauses[] = $this->db->prepare('status = %s', (string) $status);
        }

        $type = $params['type'] ?? '';
        if (!empty($type)) {
            $clauses[] = $this->db->prepare('type = %s', (string) $type);
        }

        return $clauses ? 'WHERE ' . implode(' AND ', $clauses) : '';
    }

    /**
     * Resolve a safe ORDER BY column + direction from a whitelist.
     *
     * @param array<string, mixed> $params
     * @return array{0: string, 1: string}
     */
    private function resolveOrder(array $params): array
    {
        $allowed = ['id', 'name', 'status', 'type', 'contact_count', 'created_at', 'updated_at'];
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

    public function find(int $id): ?ContactList
    {
        $row = $this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->tableName} WHERE id = %d", $id),
            ARRAY_A
        );

        return $row ? new ContactList($row) : null;
    }

    public function findByName(string $name): ?ContactList
    {
        // Oldest match wins if duplicate names exist, so the result is stable.
        $row = $this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->tableName} WHERE name = %s ORDER BY id ASC LIMIT 1", $name),
            ARRAY_A
        );

        return $row ? new ContactList($row) : null;
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
            'status' => $data['status'] ?? 'active',
            'type' => $data['type'] ?? 'manual',
            'created_at' => current_time('mysql', true),
            // Seed updated_at UTC on create so a never-edited row doesn't carry
            // the DB-session-local time the CURRENT_TIMESTAMP default would write.
            'updated_at' => current_time('mysql', true),
        ];

        $result = $this->db->insert(
            $this->tableName,
            $insert_data
        );

        if ($this->db->last_error) {
            \KeluneCRM\Core\Debug::log('ListRepository create error: ' . $this->db->last_error);
            \KeluneCRM\Core\Debug::log('Insert data: ' . wp_json_encode($insert_data));
            return false;
        }

        return $result ? $this->db->insert_id : false;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $update_data = [];

        if (isset($data['name'])) {
            $update_data['name'] = $data['name'];
        }

        if (isset($data['description'])) {
            $update_data['description'] = $data['description'];
        }

        if (isset($data['status'])) {
            $update_data['status'] = $data['status'];
        }

        if (isset($data['type'])) {
            $update_data['type'] = $data['type'];
        }

        if (empty($update_data)) {
            return false;
        }

        // Stamp updated_at in UTC. The column is ON UPDATE CURRENT_TIMESTAMP,
        // which writes DB-session-local time; set it explicitly so the value
        // stays UTC like every other moment in the product.
        $update_data['updated_at'] = current_time('mysql', true);

        return $this->db->update(
            $this->tableName,
            $update_data,
            ['id' => $id]
        ) !== false;
    }

    public function delete(int $id): bool
    {
        // Remove membership rows before the list itself.
        $contactListsTable = $this->db->prefix . 'kelune_crm_contact_lists';
        $this->db->delete($contactListsTable, ['list_id' => $id]);

        return $this->db->delete($this->tableName, ['id' => $id]) !== false;
    }

    /**
     * @return string|null
     */
    public function getContactCount(int $list_id)
    {
        $contactListsTable = $this->db->prefix . 'kelune_crm_contact_lists';
        return $this->db->get_var(
            $this->db->prepare("SELECT COUNT(*) FROM {$contactListsTable} WHERE list_id = %d", $list_id)
        );
    }
}
