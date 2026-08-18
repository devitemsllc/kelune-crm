<?php

declare(strict_types=1);

namespace KeluneCRM\Repositories;

use KeluneCRM\Models\IncomingWebhook;

if (!defined('ABSPATH')) {
    exit;
}

class IncomingWebhookRepository
{
    /** @var \wpdb */
    private $wpdb;
    private string $tableName;

    public function __construct()
    {
        global $wpdb;
        $this->wpdb = $wpdb;
        $this->tableName = $wpdb->prefix . 'kelune_crm_incoming_webhooks';
    }

    public function find(int $id): ?\KeluneCRM\Models\IncomingWebhook
    {
        global $wpdb;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API, fresh read required.
        $result = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT * FROM %i WHERE id = %d',
                $this->tableName,
                $id
            ),
            ARRAY_A
        );

        return $result ? new IncomingWebhook($result) : null;
    }

    public function findByKey(string $webhook_key): ?\KeluneCRM\Models\IncomingWebhook
    {
        global $wpdb;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API, fresh read required.
        $result = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT * FROM %i WHERE webhook_key = %s',
                $this->tableName,
                $webhook_key
            ),
            ARRAY_A
        );

        return $result ? new IncomingWebhook($result) : null;
    }

    /**
     * @param array<string, mixed> $params
     * @return array<string, mixed>
     */
    public function getAll(array $params = []): array
    {
        $page = isset($params['page']) ? (int) $params['page'] : 1;
        $per_page = isset($params['per_page']) ? (int) $params['per_page'] : 20;
        $offset = ($page - 1) * $per_page;

        $where = ['1=1'];
        $values = [];

        if (!empty($params['status'])) {
            $where[] = 'status = %s';
            $values[] = $params['status'];
        }

        if (!empty($params['search'])) {
            $where[] = '(webhook_name LIKE %s OR description LIKE %s)';
            $search_term = '%' . $this->wpdb->esc_like($params['search']) . '%';
            $values[] = $search_term;
            $values[] = $search_term;
        }

        $where_clause = implode(' AND ', $where);

        $count_sql = "SELECT COUNT(*) FROM {$this->tableName} WHERE {$where_clause}";
        if (!empty($values)) {
            $count_sql = $this->wpdb->prepare($count_sql, ...$values); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
        }
        $total = (int) $this->wpdb->get_var($count_sql); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

        // orderby/order are allow-listed; default id DESC.
        $order_by = $this->resolveOrderBy($params);
        $sql = "SELECT * FROM {$this->tableName} WHERE {$where_clause} ORDER BY {$order_by} LIMIT %d OFFSET %d";
        $values[] = $per_page;
        $values[] = $offset;

        $sql = $this->wpdb->prepare($sql, ...$values); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
        $results = $this->wpdb->get_results($sql, ARRAY_A) ?: []; // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared, PluginCheck.Security.DirectDB.UnescapedDBParameter

        $webhooks = array_map(function ($row): \KeluneCRM\Models\IncomingWebhook {
            return new IncomingWebhook($row);
        }, $results);

        return [
            'data' => $webhooks,
            'total' => $total,
            'page' => $page,
            'per_page' => $per_page,
        ];
    }

    /**
     * Resolve a safe `column direction` ORDER BY clause from request params.
     * Column and direction are both allow-listed — raw input is never
     * interpolated. Fallback (param absent/invalid) is id DESC so a
     * just-touched row never jumps to the top.
     *
     * @param array<string, mixed> $params
     */
    private function resolveOrderBy(array $params): string
    {
        $allowed = [
            'id',
            'webhook_name',
            'status',
            'total_requests',
            'last_used_at',
            'created_at',
            'updated_at',
        ];

        $orderby = isset($params['orderby']) ? (string) $params['orderby'] : 'id';
        if (!in_array($orderby, $allowed, true)) {
            $orderby = 'id';
        }

        $order = isset($params['order']) ? strtoupper((string) $params['order']) : 'DESC';
        if (!in_array($order, ['ASC', 'DESC'], true)) {
            $order = 'DESC';
        }

        return "{$orderby} {$order}";
    }

    /**
     * @param array<string, mixed> $data
     * @return int|false
     */
    public function create(array $data)
    {
        $webhook = new IncomingWebhook($data);

        if (empty($webhook->webhook_key)) {
            $webhook->webhook_key = IncomingWebhook::generateWebhookKey();
        }

        // Skip key validation — it was just generated above.
        $errors = $webhook->validate(true);
        if (!empty($errors)) {
            return false;
        }

        $insert_data = [
            'webhook_name' => $webhook->webhook_name,
            'webhook_key' => $webhook->webhook_key,
            'description' => $webhook->description ?: '',
            'default_lists' => json_encode($webhook->default_lists ?: []),
            'default_tags' => json_encode($webhook->default_tags ?: []),
            'allowed_actions' => json_encode($webhook->allowed_actions ?: []),
            'status' => $webhook->status ?: 'active',
            'ip_whitelist' => $webhook->ip_whitelist ?: '',
            'total_requests' => 0,
            'created_at' => current_time('mysql', true),
            'updated_at' => current_time('mysql', true),
        ];

        $result = $this->wpdb->insert($this->tableName, $insert_data);

        if ($result === false) {
            return false;
        }

        return $this->wpdb->insert_id;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $webhook = $this->find($id);

        if (!$webhook) {
            return false;
        }

        foreach ($data as $key => $value) {
            if (property_exists($webhook, $key) && $key !== 'id') {
                $webhook->$key = $value;
            }
        }

        $errors = $webhook->validate();
        if (!empty($errors)) {
            return false;
        }

        $update_data = [
            'webhook_name' => $webhook->webhook_name,
            'description' => $webhook->description ?: '',
            'default_lists' => json_encode($webhook->default_lists ?: []),
            'default_tags' => json_encode($webhook->default_tags ?: []),
            'allowed_actions' => json_encode($webhook->allowed_actions ?: []),
            'status' => $webhook->status,
            'ip_whitelist' => $webhook->ip_whitelist ?: '',
            'updated_at' => current_time('mysql', true),
        ];

        $result = $this->wpdb->update(
            $this->tableName,
            $update_data,
            ['id' => $id]
        );

        return $result !== false;
    }

    public function delete(int $id): bool
    {
        return $this->wpdb->delete($this->tableName, ['id' => $id]) !== false;
    }

    /**
     * @return int|bool
     */
    public function incrementRequestCount(int $id)
    {
        global $wpdb;

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API.
        return $wpdb->query(
            $wpdb->prepare(
                'UPDATE %i
                SET total_requests = total_requests + 1,
                    last_used_at = %s,
                    updated_at = %s
                WHERE id = %d',
                $this->tableName,
                current_time('mysql', true),
                current_time('mysql', true),
                $id
            )
        );
    }

    public function regenerateKey(int $id): string|false
    {
        $new_key = IncomingWebhook::generateWebhookKey();

        $result = $this->wpdb->update(
            $this->tableName,
            [
                'webhook_key' => $new_key,
                'updated_at' => current_time('mysql', true),
            ],
            ['id' => $id]
        );

        return $result !== false ? $new_key : false;
    }

    public function toggleStatus(int $id): bool
    {
        $webhook = $this->find($id);

        if (!$webhook) {
            return false;
        }

        $new_status = $webhook->status === 'active' ? 'inactive' : 'active';

        return $this->wpdb->update(
            $this->tableName,
            [
                'status' => $new_status,
                'updated_at' => current_time('mysql', true),
            ],
            ['id' => $id]
        ) !== false;
    }
}
