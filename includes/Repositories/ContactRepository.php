<?php

declare(strict_types=1);

namespace KeluneCRM\Repositories;

use KeluneCRM\Models\Contact;

class ContactRepository
{
    /**
     * Columns the list may be ordered by. Interpolated into SQL, so this is the
     * authoritative allow-list (defence in depth behind the REST enum).
     *
     * @var array<int, string>
     */
    private const SORTABLE_COLUMNS = [
        'id', 'email', 'first_name', 'last_name',
        'company', 'lead_score', 'status', 'created_at', 'updated_at',
    ];

    /** @var \wpdb */
    private $db;
    private string $tableName;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $this->tableName = $wpdb->prefix . 'kelune_crm_contacts';
    }

    /**
     * Resolve a caller-supplied sort column to a safe, whitelisted one.
     *
     * @param mixed $orderby
     */
    private function sanitizeOrderBy($orderby): string
    {
        return in_array($orderby, self::SORTABLE_COLUMNS, true) ? (string) $orderby : 'id';
    }

    /**
     * Resolve a caller-supplied sort direction to ASC or DESC.
     *
     * @param mixed $order
     */
    private function sanitizeOrder($order): string
    {
        return strtoupper((string) $order) === 'ASC' ? 'ASC' : 'DESC';
    }

    /**
     * Build a Contact from a raw row, decoding the stored JSON columns.
     *
     * @param array<string, mixed>|null $row
     */
    private function hydrate($row): ?\KeluneCRM\Models\Contact
    {
        if (!is_array($row)) {
            return null;
        }

        if (!empty($row['custom_fields']) && is_string($row['custom_fields'])) {
            $row['custom_fields'] = json_decode($row['custom_fields'], true);
        }

        return new Contact($row);
    }

    public function find(int $id): ?\KeluneCRM\Models\Contact
    {
        return $this->hydrate($this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->tableName} WHERE id = %d", $id),
            ARRAY_A
        ));
    }

    /** @param string $email */
    public function findByEmail($email): ?\KeluneCRM\Models\Contact
    {
        return $this->hydrate($this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->tableName} WHERE email = %s", $email),
            ARRAY_A
        ));
    }

    /**
     * Find the contact linked to a WordPress user account.
     */
    public function findByUserId(int $user_id): ?\KeluneCRM\Models\Contact
    {
        if ($user_id <= 0) {
            return null;
        }

        return $this->hydrate($this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->tableName} WHERE user_id = %d", $user_id),
            ARRAY_A
        ));
    }

    /**
     * Find the contact holding a pending double opt-in confirmation token.
     */
    public function findByOptinToken(string $token): ?\KeluneCRM\Models\Contact
    {
        if ($token === '') {
            return null;
        }

        return $this->hydrate($this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->tableName} WHERE optin_token = %s", $token),
            ARRAY_A
        ));
    }

    /**
     * @param array<string, mixed> $params
     * @param array<string, mixed> $filters
     * @return array<int, \KeluneCRM\Models\Contact>
     */
    public function getAll($params = [], $filters = []): array
    {
        $page = $params['page'] ?? 1;
        $per_page = $params['per_page'] ?? 20;
        $offset = ($page - 1) * $per_page;

        $where = $this->buildWhereClause($filters);
        $order_by = $this->sanitizeOrderBy($params['orderby'] ?? 'id');
        $order = $this->sanitizeOrder($params['order'] ?? 'DESC');

        $query = "SELECT * FROM {$this->tableName} {$where} ORDER BY {$order_by} {$order} LIMIT %d OFFSET %d";

        $results = $this->db->get_results(
            $this->db->prepare($query, $per_page, $offset),
            ARRAY_A
        ) ?: [];

        return array_map(function ($row): \KeluneCRM\Models\Contact {
            if (isset($row['custom_fields']) && !empty($row['custom_fields'])) {
                $row['custom_fields'] = json_decode($row['custom_fields'], true);
            }
            return new Contact($row);
        }, $results);
    }

    /**
     * @param array<string, mixed> $filters
     * @return string|null
     */
    public function getCount($filters = [])
    {
        $where = $this->buildWhereClause($filters);
        return $this->db->get_var("SELECT COUNT(*) FROM {$this->tableName} {$where}");
    }

    /** @return int|false */
    public function save(Contact $contact)
    {
        $data = $contact->toArray();
        unset($data['id']);

        if (isset($data['custom_fields']) && is_array($data['custom_fields'])) {
            $data['custom_fields'] = json_encode($data['custom_fields']);
        }

        // Persist timestamps in UTC (frontend converts to the viewer's local time).
        $data['created_at'] ??= current_time('mysql', true);
        $data['updated_at'] ??= current_time('mysql', true);

        $result = $this->db->insert($this->tableName, $data);

        if ($result) {
            return $this->db->insert_id;
        }

        return false;
    }

    public function update(Contact $contact): bool
    {
        $data = $contact->toArray();
        $id = (int) $data['id'];
        unset($data['id']);

        if (isset($data['custom_fields']) && is_array($data['custom_fields'])) {
            $data['custom_fields'] = json_encode($data['custom_fields']);
        }

        // Refresh the UTC update timestamp on every write.
        $data['updated_at'] = current_time('mysql', true);

        // Read the stored status before writing so the change can be announced
        // below. Only when the payload carries one — an update that doesn't
        // touch the status must not pay for the extra read.
        $old_status = array_key_exists('status', $data)
            ? $this->getStatus($id)
            : null;

        $updated = $this->db->update(
            $this->tableName,
            $data,
            ['id' => $id]
        ) !== false;

        if ($updated && array_key_exists('status', $data)) {
            $this->announceStatusChange($id, $old_status, (string) $data['status']);
        }

        return $updated;
    }

    /**
     * Write just the status, announcing the change. Use this over update() for
     * a status-only write: it touches one column and skips the read of the
     * whole row.
     */
    public function updateStatus(int $id, string $status): bool
    {
        $old_status = $this->getStatus($id);

        if (null === $old_status) {
            return false;
        }

        $updated = $this->db->update(
            $this->tableName,
            [
                'status' => $status,
                'updated_at' => current_time('mysql', true),
            ],
            ['id' => $id]
        ) !== false;

        if ($updated) {
            $this->announceStatusChange($id, $old_status, $status);
        }

        return $updated;
    }

    /** The stored status, or null when no such contact exists. */
    private function getStatus(int $id): ?string
    {
        $status = $this->db->get_var(
            $this->db->prepare("SELECT status FROM {$this->tableName} WHERE id = %d", $id)
        );

        return null === $status ? null : (string) $status;
    }

    /**
     * Fire the status-change event — but only on a real transition, so a save
     * that rewrites the same status doesn't re-trigger the listeners.
     *
     * This is the one signal that a contact became (un)mailable. The sweeper in
     * Handlers\ContactStatusSweeper hangs off it to park, cancel or resume the
     * contact's queued email and automation work.
     */
    private function announceStatusChange(int $id, ?string $old_status, string $new_status): void
    {
        if (null === $old_status || $old_status === $new_status) {
            return;
        }

        /**
         * Fires when a contact's status actually changes.
         *
         * @param int    $id         Contact id.
         * @param string $old_status Status before the write.
         * @param string $new_status Status after the write.
         */
        do_action('kelune_crm_contact_status_changed', $id, $old_status, $new_status);
    }

    /**
     * Delete a contact and everything hanging off it.
     *
     * The child tables have no foreign keys, so the rows are removed here —
     * otherwise a deleted contact leaves orphaned tag/list/meta/note rows that
     * a later contact reusing the id would silently inherit.
     *
     * @param int $id
     */
    public function delete(int $id): bool
    {
        $deleted = $this->db->delete($this->tableName, ['id' => $id]) !== false;

        if (!$deleted) {
            return false;
        }

        foreach (['contact_tags', 'contact_lists', 'notes', 'segment_contacts', 'events'] as $table) {
            $this->db->delete($this->db->prefix . 'kelune_crm_' . $table, ['contact_id' => $id]);
        }

        return true;
    }

    /**
     * @return array<int, array<string, mixed>>|null
     */
    public function getTags(int $contact_id)
    {
        $table_tags = $this->db->prefix . 'kelune_crm_tags';
        $table_contact_tags = $this->db->prefix . 'kelune_crm_contact_tags';

        return $this->db->get_results(
            $this->db->prepare(
                "SELECT t.* FROM {$table_tags} t
                 INNER JOIN {$table_contact_tags} ct ON t.id = ct.tag_id
                 WHERE ct.contact_id = %d",
                $contact_id
            ),
            ARRAY_A
        );
    }

    /**
     * @param array<int, mixed> $tag_ids
     */
    public function addTags(int $contact_id, array $tag_ids): bool
    {
        $table_contact_tags = $this->db->prefix . 'kelune_crm_contact_tags';
        $added = [];

        foreach ($tag_ids as $tag_id) {
            $tag_id = (int) $tag_id;
            if ($tag_id <= 0) {
                continue;
            }

            $this->db->query(
                $this->db->prepare(
                    "INSERT IGNORE INTO {$table_contact_tags} (contact_id, tag_id, tagged_at) VALUES (%d, %d, %s)",
                    $contact_id,
                    $tag_id,
                    current_time('mysql', true)
                ) ?: ''
            );

            // Only a genuinely-new tag (affected row) is announced, so
            // tag-added automations do not re-fire on a redundant re-tag.
            if (!$this->db->last_error && $this->db->rows_affected > 0) {
                $added[] = $tag_id;
            }
        }

        if ($added !== []) {
            do_action('kelune_crm_tags_added', $contact_id, $added);
        }

        return true;
    }

    /**
     * @param array<int, mixed> $tag_ids
     */
    public function removeTags(int $contact_id, array $tag_ids): bool
    {
        $table_contact_tags = $this->db->prefix . 'kelune_crm_contact_tags';
        $removed = [];

        foreach ($tag_ids as $tag_id) {
            $tag_id = (int) $tag_id;
            if ($tag_id <= 0) {
                continue;
            }

            $deleted = $this->db->delete(
                $table_contact_tags,
                [
                    'contact_id' => $contact_id,
                    'tag_id' => $tag_id,
                ]
            );

            if ($deleted) {
                $removed[] = $tag_id;
            }
        }

        if ($removed !== []) {
            do_action('kelune_crm_tags_removed', $contact_id, $removed);
        }

        return true;
    }

    /**
     * @param array<string, mixed> $params
     * @return array<int, array<string, mixed>>|null
     */
    public function getEvents(int $contact_id, array $params = [])
    {
        $table_events = $this->db->prefix . 'kelune_crm_events';
        $limit = $params['per_page'] ?? 20;
        $offset = (($params['page'] ?? 1) - 1) * $limit;

        return $this->db->get_results(
            $this->db->prepare(
                "SELECT * FROM {$table_events}
                 WHERE contact_id = %d
                 ORDER BY created_at DESC
                 LIMIT %d OFFSET %d",
                $contact_id,
                $limit,
                $offset
            ),
            ARRAY_A
        );
    }

    /**
     * @param array<string, mixed> $params
     * @return array<int, array<string, mixed>>|null
     */
    public function getNotes(int $contact_id, array $params = [])
    {
        $table_notes = $this->db->prefix . 'kelune_crm_notes';
        $limit = $params['per_page'] ?? 20;
        $offset = (($params['page'] ?? 1) - 1) * $limit;

        return $this->db->get_results(
            $this->db->prepare(
                "SELECT * FROM {$table_notes}
                 WHERE contact_id = %d
                 ORDER BY created_at DESC
                 LIMIT %d OFFSET %d",
                $contact_id,
                $limit,
                $offset
            ),
            ARRAY_A
        );
    }

    /**
     * @return int|false
     */
    public function addNote(int $contact_id, string $content, ?int $user_id = null)
    {
        $table_notes = $this->db->prefix . 'kelune_crm_notes';

        $result = $this->db->insert(
            $table_notes,
            [
                'contact_id' => $contact_id,
                'content' => $content,
                'created_by' => $user_id,
                'created_at' => current_time('mysql', true),
            ]
        );

        return $result ? $this->db->insert_id : false;
    }

    /** @param mixed $note_ids */
    public function deleteNotes($note_ids): bool
    {
        if (empty($note_ids) || !is_array($note_ids)) {
            return false;
        }

        $table_notes = $this->db->prefix . 'kelune_crm_notes';

        foreach ($note_ids as $note_id) {
            $this->db->delete(
                $table_notes,
                ['id' => $note_id]
            );
        }

        return true;
    }

    /**
     * @return array<int, array<string, mixed>>|null
     */
    public function getLists(int $contact_id)
    {
        $table_lists = $this->db->prefix . 'kelune_crm_lists';
        $table_contact_lists = $this->db->prefix . 'kelune_crm_contact_lists';

        return $this->db->get_results(
            $this->db->prepare(
                "SELECT l.* FROM {$table_lists} l
                 INNER JOIN {$table_contact_lists} cl ON l.id = cl.list_id
                 WHERE cl.contact_id = %d",
                $contact_id
            ),
            ARRAY_A
        );
    }

    /**
     * @param array<int, mixed>  $list_ids
     */
    public function addLists(int $contact_id, array $list_ids): bool
    {
        $table_contact_lists = $this->db->prefix . 'kelune_crm_contact_lists';
        $added = [];

        foreach ($list_ids as $list_id) {
            $list_id = (int) $list_id;
            if ($list_id <= 0) {
                continue;
            }

            $this->db->query(
                $this->db->prepare(
                    "INSERT IGNORE INTO {$table_contact_lists} (contact_id, list_id, subscribed_at) VALUES (%d, %d, %s)",
                    $contact_id,
                    $list_id,
                    current_time('mysql', true)
                ) ?: ''
            );

            if ($this->db->last_error) {
                \KeluneCRM\Core\Debug::log('ContactRepository addLists error: ' . $this->db->last_error);
                \KeluneCRM\Core\Debug::log('Contact ID: ' . $contact_id . ', List ID: ' . $list_id);
                continue;
            }

            // INSERT IGNORE reports an affected row only when a new membership
            // was actually created; an existing membership is a no-op we must
            // not re-announce, or it would re-enrol the contact in list-added
            // automations on every touch.
            if ($this->db->rows_affected > 0) {
                $added[] = $list_id;
            }
        }

        // Announce genuinely-new memberships so list-added automation triggers
        // fire — this is the single choke point every add-to-list path (manual,
        // import, automation action, sync) routes through.
        if ($added !== []) {
            do_action('kelune_crm_lists_added', $contact_id, $added);
        }

        return true;
    }

    /**
     * @param array<int, mixed> $list_ids
     */
    public function removeLists(int $contact_id, array $list_ids): bool
    {
        $table_contact_lists = $this->db->prefix . 'kelune_crm_contact_lists';
        $removed = [];

        foreach ($list_ids as $list_id) {
            $list_id = (int) $list_id;
            if ($list_id <= 0) {
                continue;
            }

            $deleted = $this->db->delete(
                $table_contact_lists,
                [
                    'contact_id' => $contact_id,
                    'list_id' => $list_id,
                ]
            );

            if ($deleted) {
                $removed[] = $list_id;
            }
        }

        if ($removed !== []) {
            do_action('kelune_crm_lists_removed', $contact_id, $removed);
        }

        return true;
    }

    /** @param array<string, mixed> $filters */
    private function buildWhereClause($filters): string
    {
        $conditions = [];

        if (!empty($filters['search'])) {
            $search = '%' . $this->db->esc_like($filters['search']) . '%';
            $conditions[] = $this->db->prepare(
                '(email LIKE %s OR first_name LIKE %s OR last_name LIKE %s OR company LIKE %s)',
                $search,
                $search,
                $search,
                $search
            );
        }

        if (!empty($filters['status'])) {
            $conditions[] = $this->db->prepare('status = %s', $filters['status']);
        }

        $where = '';
        if (!empty($conditions)) {
            $where = 'WHERE ' . implode(' AND ', $conditions);
        }

        return $where;
    }

    /**
     * @param array<string, mixed> $params
     * @param array<string, mixed> $filters
     * @return array<int, \KeluneCRM\Models\Contact>
     */
    public function getAllWithFilters($params = [], $filters = []): array
    {
        $page = $params['page'] ?? 1;
        $per_page = $params['per_page'] ?? 20;
        // An explicit offset (e.g. from export) overrides page-based paging.
        $offset = isset($params['offset']) ? (int) $params['offset'] : ($page - 1) * $per_page;

        $order_by = $this->sanitizeOrderBy($params['orderby'] ?? 'id');
        $order = $this->sanitizeOrder($params['order'] ?? 'DESC');

        $select = 'SELECT DISTINCT c.*';
        $from = "FROM {$this->tableName} c";
        $joins = '';
        $where_conditions = [];

        if (!empty($filters['search'])) {
            $search = '%' . $this->db->esc_like($filters['search']) . '%';
            $where_conditions[] = $this->db->prepare(
                '(c.email LIKE %s OR c.first_name LIKE %s OR c.last_name LIKE %s OR c.company LIKE %s)',
                $search,
                $search,
                $search,
                $search
            );
        }

        if (!empty($filters['status'])) {
            $where_conditions[] = $this->db->prepare('c.status = %s', $filters['status']);
        }

        if (!empty($filters['tags']) && is_array($filters['tags'])) {
            $table_contact_tags = $this->db->prefix . 'kelune_crm_contact_tags';
            $joins .= " INNER JOIN {$table_contact_tags} ct ON c.id = ct.contact_id";

            $tag_placeholders = implode(',', array_fill(0, count($filters['tags']), '%d'));
            $where_conditions[] = $this->db->prepare(
                "ct.tag_id IN ({$tag_placeholders})",
                ...$filters['tags']
            );
        }

        if (!empty($filters['lists']) && is_array($filters['lists'])) {
            $table_contact_lists = $this->db->prefix . 'kelune_crm_contact_lists';
            $joins .= " INNER JOIN {$table_contact_lists} cl ON c.id = cl.contact_id";

            $list_placeholders = implode(',', array_fill(0, count($filters['lists']), '%d'));
            $where_conditions[] = $this->db->prepare(
                "cl.list_id IN ({$list_placeholders})",
                ...$filters['lists']
            );
        }

        $where = '';
        if (!empty($where_conditions)) {
            $where = 'WHERE ' . implode(' AND ', $where_conditions);
        }

        $query = "{$select} {$from} {$joins} {$where} ORDER BY c.{$order_by} {$order} LIMIT %d OFFSET %d";

        $results = $this->db->get_results(
            $this->db->prepare($query, $per_page, $offset),
            ARRAY_A
        ) ?: [];

        return array_map(function ($row): \KeluneCRM\Models\Contact {
            if (isset($row['custom_fields']) && !empty($row['custom_fields'])) {
                $row['custom_fields'] = json_decode($row['custom_fields'], true);
            }
            return new Contact($row);
        }, $results);
    }

    /** @param array<string, mixed> $filters */
    public function getCountWithFilters($filters = []): int
    {
        $select = 'SELECT COUNT(DISTINCT c.id)';
        $from = "FROM {$this->tableName} c";
        $joins = '';
        $where_conditions = [];

        if (!empty($filters['search'])) {
            $search = '%' . $this->db->esc_like($filters['search']) . '%';
            $where_conditions[] = $this->db->prepare(
                '(c.email LIKE %s OR c.first_name LIKE %s OR c.last_name LIKE %s OR c.company LIKE %s)',
                $search,
                $search,
                $search,
                $search
            );
        }

        if (!empty($filters['status'])) {
            $where_conditions[] = $this->db->prepare('c.status = %s', $filters['status']);
        }

        if (!empty($filters['tags']) && is_array($filters['tags'])) {
            $table_contact_tags = $this->db->prefix . 'kelune_crm_contact_tags';
            $joins .= " INNER JOIN {$table_contact_tags} ct ON c.id = ct.contact_id";

            $tag_placeholders = implode(',', array_fill(0, count($filters['tags']), '%d'));
            $where_conditions[] = $this->db->prepare(
                "ct.tag_id IN ({$tag_placeholders})",
                ...$filters['tags']
            );
        }

        if (!empty($filters['lists']) && is_array($filters['lists'])) {
            $table_contact_lists = $this->db->prefix . 'kelune_crm_contact_lists';
            $joins .= " INNER JOIN {$table_contact_lists} cl ON c.id = cl.contact_id";

            $list_placeholders = implode(',', array_fill(0, count($filters['lists']), '%d'));
            $where_conditions[] = $this->db->prepare(
                "cl.list_id IN ({$list_placeholders})",
                ...$filters['lists']
            );
        }

        $where = '';
        if (!empty($where_conditions)) {
            $where = 'WHERE ' . implode(' AND ', $where_conditions);
        }

        $query = "{$select} {$from} {$joins} {$where}";

        return (int) $this->db->get_var($query);
    }

    /**
     * Total contact count (unfiltered), for analytics KPI tiles.
     */
    public function getTotalCount(): int
    {
        return (int) $this->db->get_var("SELECT COUNT(*) FROM {$this->tableName}");
    }

    /**
     * New-contact counts per time bucket over a date range, keyed by the aligned
     * bucket-start date (`Y-m-d`). Gaps are the caller's to zero-fill.
     *
     * @param string $bucketExpr Grouping SQL from DateBucketer::sqlExpr() (trusted literal).
     * @return array<string, int>
     */
    public function getGrowthSeries(string $start, string $end, string $bucketExpr): array
    {
        $rows = $this->db->get_results(
            $this->db->prepare(
                "SELECT {$bucketExpr} AS bucket, COUNT(*) AS count
                 FROM {$this->tableName}
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
            $out[(string) $row['bucket']] = (int) $row['count'];
        }

        return $out;
    }

    /**
     * Contact counts grouped by status.
     *
     * @return array<int, array{status: string, count: int}>
     */
    public function getStatusBreakdown(): array
    {
        $rows = $this->db->get_results(
            "SELECT status, COUNT(*) AS count
             FROM {$this->tableName}
             GROUP BY status
             ORDER BY count DESC",
            ARRAY_A
        ) ?: [];

        return array_map(static fn ($row): array => [
            'status' => (string) ($row['status'] ?? 'unknown'),
            'count' => (int) $row['count'],
        ], $rows);
    }

    /**
     * Top tags by contact count (uses the maintained `contact_count` column).
     *
     * @return array<int, array{name: string, count: int}>
     */
    public function getTopTags(int $limit = 8): array
    {
        $table = $this->db->prefix . 'kelune_crm_tags';
        $rows = $this->db->get_results(
            $this->db->prepare(
                "SELECT name, contact_count FROM {$table} ORDER BY contact_count DESC LIMIT %d",
                $limit
            ),
            ARRAY_A
        ) ?: [];

        return array_map(static fn ($row): array => [
            'name' => (string) $row['name'],
            'count' => (int) $row['contact_count'],
        ], $rows);
    }

    /**
     * Top countries by contact count. Country is stored as an ISO-3166 alpha-2
     * code; blanks are folded into an "Unknown" bucket.
     *
     * @return array<int, array{name: string, count: int}>
     */
    public function getTopCountries(int $limit = 8): array
    {
        $rows = $this->db->get_results(
            $this->db->prepare(
                "SELECT
                    CASE WHEN country IS NULL OR country = '' THEN 'Unknown' ELSE country END AS name,
                    COUNT(*) AS count
                 FROM {$this->tableName}
                 GROUP BY name
                 ORDER BY count DESC
                 LIMIT %d",
                $limit
            ),
            ARRAY_A
        ) ?: [];

        return array_map(static fn ($row): array => [
            'name' => (string) $row['name'],
            'count' => (int) $row['count'],
        ], $rows);
    }

    /**
     * Top lists by contact count (uses the maintained `contact_count` column).
     *
     * @return array<int, array{name: string, count: int}>
     */
    public function getTopLists(int $limit = 8): array
    {
        $table = $this->db->prefix . 'kelune_crm_lists';
        $rows = $this->db->get_results(
            $this->db->prepare(
                "SELECT name, contact_count FROM {$table} ORDER BY contact_count DESC LIMIT %d",
                $limit
            ),
            ARRAY_A
        ) ?: [];

        return array_map(static fn ($row): array => [
            'name' => (string) $row['name'],
            'count' => (int) $row['contact_count'],
        ], $rows);
    }
}
