<?php

declare(strict_types=1);

namespace KeluneCRM\Repositories;

use KeluneCRM\Models\EmailProvider;

class EmailProviderRepository
{
    /** @var \wpdb */
    private $db;

    private string $table;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $this->table = $wpdb->prefix . 'kelune_crm_email_providers';
    }

    public function find(int $id): ?EmailProvider
    {
        $row = $this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->table} WHERE id = %d", $id),
            ARRAY_A
        );

        return $row ? new EmailProvider($row) : null;
    }

    /**
     * Get a page of providers, ordered by a whitelisted column (default id DESC —
     * newest first). Filters: search (name/sender_email), status, provider_type.
     *
     * @param array<string, mixed> $params
     * @return array<int, EmailProvider>
     */
    public function getAll(array $params = []): array
    {
        $page = max(1, (int) ($params['page'] ?? 1));
        $per_page = max(1, (int) ($params['per_page'] ?? 20));
        $offset = ($page - 1) * $per_page;

        [$where_sql, $where_values] = $this->buildWhere($params);
        [$orderby, $order] = $this->resolveOrder($params);

        $sql = "SELECT * FROM {$this->table} WHERE {$where_sql} ORDER BY {$orderby} {$order} LIMIT %d OFFSET %d";
        $query_values = array_merge($where_values, [$per_page, $offset]);

        $results = $this->db->get_results($this->db->prepare($sql, $query_values), ARRAY_A) ?: [];

        return array_map(fn ($row): EmailProvider => new EmailProvider($row), $results);
    }

    /**
     * Count providers matching the same filters as {@see getAll()}. Called with
     * no params (e.g. from create()) it counts every row.
     *
     * @param array<string, mixed> $params
     */
    public function getCount(array $params = []): int
    {
        [$where_sql, $where_values] = $this->buildWhere($params);

        $sql = "SELECT COUNT(*) FROM {$this->table} WHERE {$where_sql}";
        $query = empty($where_values) ? $sql : $this->db->prepare($sql, $where_values);

        return (int) $this->db->get_var($query);
    }

    /**
     * Build the shared WHERE clause (search + status + provider_type) with a
     * placeholder string and its prepared values.
     *
     * @param array<string, mixed> $params
     * @return array{0: string, 1: array<int, mixed>}
     */
    private function buildWhere(array $params): array
    {
        $clauses = ['1=1'];
        $values = [];

        if (!empty($params['search'])) {
            $clauses[] = '(name LIKE %s OR sender_email LIKE %s)';
            $search_term = '%' . $this->db->esc_like((string) $params['search']) . '%';
            $values[] = $search_term;
            $values[] = $search_term;
        }

        if (!empty($params['status'])) {
            $clauses[] = 'status = %s';
            $values[] = (string) $params['status'];
        }

        if (!empty($params['provider_type'])) {
            $clauses[] = 'provider_type = %s';
            $values[] = (string) $params['provider_type'];
        }

        return [implode(' AND ', $clauses), $values];
    }

    /**
     * Resolve a safe ORDER BY column + direction from a whitelist. The fallback
     * (param absent/invalid) is id DESC — never a mutable column like updated_at,
     * which would make a just-touched row jump to the top.
     *
     * @param array<string, mixed> $params
     * @return array{0: string, 1: string}
     */
    private function resolveOrder(array $params): array
    {
        $allowed = ['id', 'name', 'provider_type', 'sender_email', 'status', 'created_at', 'updated_at'];
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
     * Get the default provider, falling back to the most recent active one when
     * no explicit default is set.
     */
    public function findDefault(): ?EmailProvider
    {
        $row = $this->db->get_row(
            "SELECT * FROM {$this->table} WHERE is_default = 1 AND status = 'active' LIMIT 1",
            ARRAY_A
        );

        if (!$row) {
            $row = $this->db->get_row(
                "SELECT * FROM {$this->table} WHERE status = 'active' ORDER BY created_at DESC LIMIT 1",
                ARRAY_A
            );
        }

        return $row ? new EmailProvider($row) : null;
    }

    /**
     * Resolve the active provider connection that owns a given From address. A
     * match is an active provider whose bound sender_email equals the address, or
     * whose verified/manual senders contain that exact address (domain-only
     * entries gate manual additions but are not routing wildcards — see
     * {@see \KeluneCRM\Models\EmailProvider::ownsSender()}). Returns null when
     * no connection claims the sender (the caller then falls back to the default
     * connection).
     */
    public function findForSender(string $email): ?EmailProvider
    {
        $email = strtolower(trim($email));
        if ($email === '' || strpos($email, '@') === false) {
            return null;
        }

        // Exact bound-sender match wins first (the connection's primary identity).
        $row = $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->table} WHERE status = 'active' AND LOWER(sender_email) = %s ORDER BY is_default DESC, created_at DESC LIMIT 1",
                $email
            ),
            ARRAY_A
        );
        if ($row) {
            return new EmailProvider($row);
        }

        // Otherwise scan active connections for one whose verified (auto-enumerated)
        // or manual senders contain this exact address. The active-provider set is
        // tiny, so an in-PHP scan is fine and keeps the sender matching in one place
        // (EmailProvider::ownsSender).
        $rows = $this->db->get_results(
            "SELECT * FROM {$this->table} WHERE status = 'active' ORDER BY is_default DESC, created_at DESC",
            ARRAY_A
        );
        foreach ((array) $rows as $row) {
            $provider = new EmailProvider($row);
            if ($provider->ownsSender($email)) {
                return $provider;
            }
        }

        return null;
    }

    /**
     * Persist the admin-registered manual sender list for a connection, stored in
     * the settings JSON alongside the provider's option flags (kept separate from
     * the auto-enumerated verified_senders column so re-enumeration never wipes
     * it).
     *
     * @param array<int, string> $emails
     */
    public function updateManualSenders(int $id, array $emails): bool
    {
        $provider = $this->find($id);
        if (!$provider) {
            return false;
        }

        $settings = $provider->settings;
        $settings['manual_senders'] = array_values(array_unique($emails));

        return $this->db->update(
            $this->table,
            ['settings' => wp_json_encode($settings)],
            ['id' => $id]
        ) !== false;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function create(array $data): int|false
    {
        $insert_data = [
            'name' => $data['name'],
            'provider_type' => $data['provider_type'],
            'sender_name' => $data['sender_name'] ?? '',
            'sender_email' => $data['sender_email'],
            'reply_to' => $data['reply_to'] ?? '',
            'region' => $data['region'] ?? '',
            'credentials' => wp_json_encode($data['credentials'] ?? []),
            'settings' => wp_json_encode($data['settings'] ?? []),
            'verified_senders' => wp_json_encode($data['verified_senders'] ?? []),
            'is_default' => !empty($data['is_default']) ? 1 : 0,
            'status' => $data['status'] ?? 'active',
            'created_by' => $data['created_by'] ?? get_current_user_id(),
            'created_at' => current_time('mysql', true),
            'updated_at' => current_time('mysql', true),
        ];

        $result = $this->db->insert($this->table, $insert_data);

        if (!$result) {
            return false;
        }

        $id = (int) $this->db->insert_id;

        // Guarantee a single default: when this row claims default, clear others.
        // Also make the very first provider the default automatically.
        if (!empty($data['is_default']) || $this->getCount() === 1) {
            $this->setDefault($id);
        }

        return $id;
    }

    /**
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $update_data = [];

        foreach (['name', 'provider_type', 'sender_name', 'sender_email', 'reply_to', 'region', 'status'] as $field) {
            if (isset($data[$field])) {
                $update_data[$field] = $data[$field];
            }
        }

        foreach (['credentials', 'settings', 'verified_senders'] as $json_field) {
            if (isset($data[$json_field])) {
                $update_data[$json_field] = is_array($data[$json_field])
                    ? wp_json_encode($data[$json_field])
                    : $data[$json_field];
            }
        }

        if (isset($data['is_default'])) {
            $update_data['is_default'] = !empty($data['is_default']) ? 1 : 0;
        }

        if (empty($update_data)) {
            return false;
        }

        $update_data['updated_at'] = current_time('mysql', true);

        $result = $this->db->update($this->table, $update_data, ['id' => $id]);

        if ($result !== false && !empty($data['is_default'])) {
            $this->setDefault($id);
        }

        return $result !== false;
    }

    public function delete(int $id): bool
    {
        $was_default = (int) $this->db->get_var(
            $this->db->prepare("SELECT is_default FROM {$this->table} WHERE id = %d", $id)
        );

        $deleted = $this->db->delete($this->table, ['id' => $id]) !== false;

        // Promote another provider to default so sending never loses its target.
        if ($deleted && $was_default === 1) {
            $next = $this->db->get_var(
                "SELECT id FROM {$this->table} WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
            );
            if ($next) {
                $this->setDefault((int) $next);
            }
        }

        return $deleted;
    }

    /**
     * Mark one provider as the single default, clearing the flag on all others.
     */
    public function setDefault(int $id): bool
    {
        $this->db->query(
            $this->db->prepare(
                "UPDATE {$this->table} SET is_default = 0, updated_at = %s",
                current_time('mysql', true)
            ) ?: ''
        );

        return $this->db->update($this->table, ['is_default' => 1], ['id' => $id]) !== false;
    }

    /**
     * Cache the verified sender identities fetched from the provider's API.
     *
     * @param array<int, string> $senders
     */
    public function updateVerifiedSenders(int $id, array $senders): bool
    {
        return $this->db->update(
            $this->table,
            ['verified_senders' => wp_json_encode(array_values($senders))],
            ['id' => $id]
        ) !== false;
    }
}
