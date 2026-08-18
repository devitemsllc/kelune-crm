<?php

declare(strict_types=1);

namespace KeluneCRM\Repositories;

use KeluneCRM\Models\EmailLog;

class EmailLogRepository
{
    /** @var \wpdb */
    private $db;
    private string $table;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $this->table = $wpdb->prefix . 'kelune_crm_email_logs';
    }

    public function find(int $id): ?EmailLog
    {
        $result = $this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->table} WHERE id = %d", $id),
            ARRAY_A
        );

        return $result ? new EmailLog($result) : null;
    }

    /**
     * @param array<string, mixed> $params Query parameters
     * @return array<int, EmailLog>
     */
    public function getAll(array $params = []): array
    {
        $page = $params['page'] ?? 1;
        $per_page = $params['per_page'] ?? 20;
        $offset = ($page - 1) * $per_page;

        $where = $this->buildWhereClause($params);
        $orderby = $this->buildOrderByClause($params);

        $query = "SELECT * FROM {$this->table} {$where} {$orderby} LIMIT %d OFFSET %d";
        $results = $this->db->get_results(
            $this->db->prepare($query, $per_page, $offset),
            ARRAY_A
        ) ?: [];

        return array_map(function ($row): \KeluneCRM\Models\EmailLog {
            return new EmailLog($row);
        }, $results);
    }

    /** @param array<string, mixed> $params Query parameters */
    public function getTotalCount(array $params = []): int
    {
        $where = $this->buildWhereClause($params);

        $query = "SELECT COUNT(*) FROM {$this->table} {$where}";
        return (int) $this->db->get_var($query);
    }

    /**
     * @param array<string, mixed> $data
     * @return int|false Log ID on success, false on failure
     */
    public function create(array $data)
    {
        $defaults = [
            'email_type' => 'transactional',
            'status' => 'queued',
            'open_count' => 0,
            'click_count' => 0,
            'created_at' => current_time('mysql', true),
            'updated_at' => current_time('mysql', true),
        ];

        $data = array_merge($defaults, $data);

        if ($data['status'] === 'queued' && empty($data['queued_at'])) {
            $data['queued_at'] = current_time('mysql', true);
        }

        $result = $this->db->insert($this->table, $data);

        return $result ? $this->db->insert_id : false;
    }

    /**
     * @param array<string, mixed> $data Additional data to update
     */
    public function updateStatus(int $id, string $status, array $data = []): bool
    {
        $update_data = array_merge($data, [
            'status' => $status,
            'updated_at' => current_time('mysql', true),
        ]);

        $timestamp_field = $this->getTimestampFieldForStatus($status);
        if ($timestamp_field && empty($update_data[$timestamp_field])) {
            $update_data[$timestamp_field] = current_time('mysql', true);
        }

        $result = $this->db->update(
            $this->table,
            $update_data,
            ['id' => $id]
        );

        return $result !== false;
    }

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): bool
    {
        $data['updated_at'] = current_time('mysql', true);

        $result = $this->db->update(
            $this->table,
            $data,
            ['id' => $id]
        );

        return $result !== false;
    }

    public function incrementOpenCount(int $id): bool
    {
        $email_log = $this->find($id);
        if (!$email_log) {
            return false;
        }

        $update_data = [
            'open_count' => $email_log->open_count + 1,
            'updated_at' => current_time('mysql', true),
        ];

        // Stamp opened_at on the first open, keyed off the timestamp being empty
        // so it is robust to the count arriving as a string from the DB.
        if (empty($email_log->opened_at)) {
            $update_data['opened_at'] = current_time('mysql', true);
        }

        if (in_array($email_log->status, ['sent', 'delivered'], true)) {
            $update_data['status'] = 'opened';
        }

        return $this->update($id, $update_data);
    }

    public function incrementClickCount(int $id): bool
    {
        $email_log = $this->find($id);
        if (!$email_log) {
            return false;
        }

        $update_data = [
            'click_count' => $email_log->click_count + 1,
            'updated_at' => current_time('mysql', true),
        ];

        // Stamp clicked_at on the first click, keyed off the timestamp being
        // empty so it is robust to the count arriving as a string from the DB.
        if (empty($email_log->clicked_at)) {
            $update_data['clicked_at'] = current_time('mysql', true);
        }

        if (in_array($email_log->status, ['sent', 'delivered', 'opened'], true)) {
            $update_data['status'] = 'clicked';
        }

        return $this->update($id, $update_data);
    }

    public function getByTrackingToken(string $token): ?EmailLog
    {
        $result = $this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->table} WHERE tracking_token = %s", $token),
            ARRAY_A
        );

        return $result ? new EmailLog($result) : null;
    }

    /**
     * @param int $campaign_id
     * @param array<string, mixed> $params Additional query parameters
     * @return array<int, EmailLog>
     */
    public function getByCampaign(int $campaign_id, array $params = []): array
    {
        $params['campaign_id'] = $campaign_id;
        return $this->getAll($params);
    }

    /**
     * @param int $automation_id
     * @param array<string, mixed> $params Additional query parameters
     * @return array<int, EmailLog>
     */
    public function getByAutomation(int $automation_id, array $params = []): array
    {
        $params['automation_id'] = $automation_id;
        return $this->getAll($params);
    }

    /**
     * @param string $start Start date (YYYY-MM-DD)
     * @param string $end End date (YYYY-MM-DD)
     * @param string|null $email_type Optional email type filter
     * @return array<string, mixed>
     */
    public function getStatsByDateRange(string $start, string $end, ?string $email_type = null): array
    {
        $where = 'WHERE created_at >= %s AND created_at <= %s';
        $params = [$start . ' 00:00:00', $end . ' 23:59:59'];

        if ($email_type) {
            $where .= ' AND email_type = %s';
            $params[] = $email_type;
        }

        $query = "
            SELECT
                COUNT(*) as total_sent,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced_count,
                SUM(CASE WHEN status IN ('sent', 'delivered', 'opened', 'clicked') THEN 1 ELSE 0 END) as delivered_count,
                SUM(CASE WHEN status IN ('opened', 'clicked') OR open_count > 0 THEN 1 ELSE 0 END) as opened_count,
                SUM(CASE WHEN status = 'clicked' OR click_count > 0 THEN 1 ELSE 0 END) as clicked_count,
                SUM(open_count) as total_opens,
                SUM(click_count) as total_clicks
            FROM {$this->table}
            {$where}
        ";

        $row = $this->db->get_row($this->db->prepare($query, $params), ARRAY_A);

        if (!is_array($row)) {
            return [];
        }

        // Engagement is measured against delivered, bounces against everything attempted.
        $total = (int) ($row['total_sent'] ?? 0);
        $delivered = (int) ($row['delivered_count'] ?? 0);

        $row['open_rate'] = $delivered > 0 ? round(((int) ($row['opened_count'] ?? 0) / $delivered) * 100, 2) : 0.0;
        $row['click_rate'] = $delivered > 0 ? round(((int) ($row['clicked_count'] ?? 0) / $delivered) * 100, 2) : 0.0;
        $row['bounce_rate'] = $total > 0 ? round(((int) ($row['bounced_count'] ?? 0) / $total) * 100, 2) : 0.0;

        return $row;
    }

    /**
     * Sent/opened/clicked counts per time bucket over a date range, keyed by the
     * aligned bucket-start date (`Y-m-d`). Gaps are the caller's to zero-fill.
     *
     * @param string $bucketExpr Grouping SQL from DateBucketer::sqlExpr() (trusted literal).
     * @return array<string, array{sent: int, opened: int, clicked: int}>
     */
    public function getEngagementSeries(string $start, string $end, string $bucketExpr): array
    {
        $rows = $this->db->get_results(
            $this->db->prepare(
                "SELECT
                    {$bucketExpr} AS bucket,
                    SUM(CASE WHEN status IN ('sent', 'delivered', 'opened', 'clicked') THEN 1 ELSE 0 END) AS sent,
                    SUM(CASE WHEN status IN ('opened', 'clicked') OR open_count > 0 THEN 1 ELSE 0 END) AS opened,
                    SUM(CASE WHEN status = 'clicked' OR click_count > 0 THEN 1 ELSE 0 END) AS clicked
                 FROM {$this->table}
                 WHERE created_at >= %s AND created_at <= %s
                 GROUP BY bucket
                 ORDER BY bucket ASC",
                $start . ' 00:00:00',
                $end . ' 23:59:59'
            ),
            ARRAY_A
        ) ?: [];

        $out = [];
        foreach ($rows as $row) {
            $out[(string) $row['bucket']] = [
                'sent' => (int) $row['sent'],
                'opened' => (int) $row['opened'],
                'clicked' => (int) $row['clicked'],
            ];
        }

        return $out;
    }

    /**
     * Delivery/open/click/bounce totals plus rates over a date range.
     *
     * @return array<string, mixed>
     */
    public function getPerformance(string $start, string $end): array
    {
        $stats = $this->getStatsByDateRange($start, $end);

        $sent = (int) ($stats['total_sent'] ?? 0);
        $delivered = (int) ($stats['delivered_count'] ?? 0);
        $opened = (int) ($stats['opened_count'] ?? 0);
        $clicked = (int) ($stats['clicked_count'] ?? 0);
        $bounced = (int) ($stats['bounced_count'] ?? 0);

        return [
            'total_sent' => $sent,
            'delivered' => $delivered,
            'opened' => $opened,
            'clicked' => $clicked,
            'bounced' => $bounced,
            'delivery_rate' => $sent > 0 ? round(($delivered / $sent) * 100, 2) : 0.0,
            'open_rate' => $delivered > 0 ? round(($opened / $delivered) * 100, 2) : 0.0,
            'click_rate' => $delivered > 0 ? round(($clicked / $delivered) * 100, 2) : 0.0,
            'bounce_rate' => $sent > 0 ? round(($bounced / $sent) * 100, 2) : 0.0,
        ];
    }

    /**
     * All-time sent total, for the analytics overview KPI tile.
     */
    public function getSentTotal(): int
    {
        return (int) $this->db->get_var(
            "SELECT COUNT(*) FROM {$this->table}
             WHERE status IN ('sent', 'delivered', 'opened', 'clicked')"
        );
    }

    public function delete(int $id): bool
    {
        $result = $this->db->delete($this->table, ['id' => $id]);
        return $result !== false;
    }

    /**
     * @param array<int, int> $ids Array of log IDs
     * @return int Number of deleted rows
     */
    public function bulkDelete(array $ids): int
    {
        if (empty($ids)) {
            return 0;
        }

        $placeholders = implode(',', array_fill(0, count($ids), '%d'));
        $query = "DELETE FROM {$this->table} WHERE id IN ({$placeholders})";

        $result = $this->db->query($this->db->prepare($query, $ids) ?: '');

        return $result !== false ? (int) $result : 0;
    }

    /** @param array<string, mixed> $params */
    private function buildWhereClause(array $params): string
    {
        $conditions = ['1=1'];

        if (!empty($params['search'])) {
            $search = '%' . $this->db->esc_like($params['search']) . '%';
            $conditions[] = $this->db->prepare(
                '(subject LIKE %s OR email_to LIKE %s)',
                $search,
                $search
            );
        }

        if (!empty($params['email_type'])) {
            $conditions[] = $this->db->prepare('email_type = %s', $params['email_type']);
        }

        if (!empty($params['status'])) {
            $conditions[] = $this->db->prepare('status = %s', $params['status']);
        }

        if (!empty($params['provider'])) {
            $conditions[] = $this->db->prepare('provider = %s', $params['provider']);
        }

        if (!empty($params['contact_id'])) {
            $conditions[] = $this->db->prepare('contact_id = %d', $params['contact_id']);
        }

        if (!empty($params['campaign_id'])) {
            $conditions[] = $this->db->prepare('campaign_id = %d', $params['campaign_id']);
        }

        if (!empty($params['automation_id'])) {
            $conditions[] = $this->db->prepare('automation_id = %d', $params['automation_id']);
        }

        if (!empty($params['date_from'])) {
            $conditions[] = $this->db->prepare('created_at >= %s', $params['date_from'] . ' 00:00:00');
        }

        if (!empty($params['date_to'])) {
            $conditions[] = $this->db->prepare('created_at <= %s', $params['date_to'] . ' 23:59:59');
        }

        return 'WHERE ' . implode(' AND ', $conditions);
    }

    /** @param array<string, mixed> $params */
    private function buildOrderByClause(array $params): string
    {
        $orderby = $params['orderby'] ?? 'id';
        $order = strtoupper($params['order'] ?? 'DESC');

        if (!in_array($order, ['ASC', 'DESC'])) {
            $order = 'DESC';
        }

        // Allow-list the column; default id DESC so an invalid param can't
        // interpolate and a just-touched row never jumps to the top.
        $allowed_fields = [
            'id',
            'created_at',
            'sent_at',
            'subject',
            'email_to',
            'status',
            'email_type',
            'open_count',
            'click_count',
        ];
        if (!in_array($orderby, $allowed_fields)) {
            $orderby = 'id';
        }

        return "ORDER BY {$orderby} {$order}";
    }

    private function getTimestampFieldForStatus(string $status): ?string
    {
        $mapping = [
            'queued' => 'queued_at',
            'sent' => 'sent_at',
            'delivered' => 'delivered_at',
            'bounced' => 'bounced_at',
            'opened' => 'opened_at',
            'clicked' => 'clicked_at',
        ];

        return $mapping[$status] ?? null;
    }
}
