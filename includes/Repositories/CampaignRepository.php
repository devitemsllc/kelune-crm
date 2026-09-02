<?php

declare(strict_types=1);

namespace KeluneCRM\Repositories;

use KeluneCRM\Models\Campaign;

class CampaignRepository
{
    /** @var \wpdb */
    private $db;
    private string $campaignsTable;
    private string $campaignEmailsTable;
    private string $campaignLinksTable;
    private string $campaignVariantsTable;
    private string $contactsTable;
    private string $segmentContactsTable;
    private string $contactListsTable;
    private string $contactTagsTable;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $prefix = $wpdb->prefix . 'kelune_crm_';
        $this->campaignsTable = $prefix . 'campaigns';
        $this->campaignEmailsTable = $prefix . 'campaign_emails';
        $this->campaignLinksTable = $prefix . 'campaign_links';
        $this->campaignVariantsTable = $prefix . 'campaign_variants';
        $this->contactsTable = $prefix . 'contacts';
        $this->segmentContactsTable = $prefix . 'segment_contacts';
        $this->contactListsTable = $prefix . 'contact_lists';
        $this->contactTagsTable = $prefix . 'contact_tags';
    }

    /** @param int $id */
    public function find($id): ?\KeluneCRM\Models\Campaign
    {
        $row = $this->db->get_row(
            $this->db->prepare("SELECT * FROM {$this->campaignsTable} WHERE id = %d", $id),
            ARRAY_A
        );

        return $row ? new Campaign($row) : null;
    }

    /**
     * @param array<string, mixed> $params
     * @return array<int, \KeluneCRM\Models\Campaign>
     */
    public function getAll($params = []): array
    {
        $page = $params['page'] ?? 1;
        $per_page = $params['per_page'] ?? 20;
        $offset = ($page - 1) * $per_page;
        $search = $params['search'] ?? '';
        $status = $params['status'] ?? '';
        $campaign_type = $params['campaign_type'] ?? '';

        $where = ['1=1'];

        if (!empty($search)) {
            $search = '%' . $this->db->esc_like($search) . '%';
            $where[] = $this->db->prepare('(name LIKE %s OR subject LIKE %s)', $search, $search);
        }

        if (!empty($status)) {
            $where[] = $this->db->prepare('status = %s', $status);
        }

        if (!empty($campaign_type)) {
            $where[] = $this->db->prepare('campaign_type = %s', $campaign_type);
        }

        $where_clause = implode(' AND ', $where);

        [$orderby, $order] = $this->resolveOrderBy($params);

        $query = "SELECT * FROM {$this->campaignsTable} WHERE {$where_clause} ORDER BY {$orderby} {$order} LIMIT %d OFFSET %d";

        $results = $this->db->get_results(
            $this->db->prepare($query, $per_page, $offset),
            ARRAY_A
        ) ?: [];

        return array_map(fn ($row): \KeluneCRM\Models\Campaign => new Campaign($row), $results);
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
            'id', 'name', 'status', 'campaign_type',
            'scheduled_at', 'sent_at', 'created_at', 'updated_at',
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
        $campaign_type = $params['campaign_type'] ?? '';

        $where = ['1=1'];

        if (!empty($search)) {
            $search = '%' . $this->db->esc_like($search) . '%';
            $where[] = $this->db->prepare('(name LIKE %s OR subject LIKE %s)', $search, $search);
        }

        if (!empty($status)) {
            $where[] = $this->db->prepare('status = %s', $status);
        }

        if (!empty($campaign_type)) {
            $where[] = $this->db->prepare('campaign_type = %s', $campaign_type);
        }

        $where_clause = implode(' AND ', $where);

        return (int) $this->db->get_var("SELECT COUNT(*) FROM {$this->campaignsTable} WHERE {$where_clause}");
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
            'campaign_type' => $data['campaign_type'] ?? 'regular',
            'status' => $data['status'] ?? Campaign::STATUS_DRAFT,
            'subject' => $data['subject'] ?? '',
            'preview_text' => $data['preview_text'] ?? '',
            'from_name' => $data['from_name'] ?? '',
            'from_email' => $data['from_email'] ?? '',
            'reply_to' => $data['reply_to'] ?? '',
            'email_provider_id' => !empty($data['email_provider_id']) ? (int) $data['email_provider_id'] : null,
            'email_content' => $data['email_content'] ?? '',
            'content_mode' => $data['content_mode'] ?? 'html',
            'json_structure' => $data['json_structure'] ?? null,
            'template_id' => $data['template_id'] ?? null,
            'target_segments' => is_array($data['target_segments'] ?? null) ? json_encode($data['target_segments']) : null,
            'target_lists' => is_array($data['target_lists'] ?? null) ? json_encode($data['target_lists']) : null,
            'target_tags' => is_array($data['target_tags'] ?? null) ? json_encode($data['target_tags']) : null,
            'exclude_segments' => is_array($data['exclude_segments'] ?? null) ? json_encode($data['exclude_segments']) : null,
            'exclude_lists' => is_array($data['exclude_lists'] ?? null) ? json_encode($data['exclude_lists']) : null,
            'exclude_tags' => is_array($data['exclude_tags'] ?? null) ? json_encode($data['exclude_tags']) : null,
            'settings' => is_array($data['settings'] ?? null) ? json_encode($data['settings']) : null,
            'stats' => is_array($data['stats'] ?? null) ? json_encode($data['stats']) : json_encode([]),
            'ab_testing_enabled' => $data['ab_testing_enabled'] ?? 0,
            'ab_test_winner_metric' => $data['ab_test_winner_metric'] ?? 'open_rate',
            'ab_test_sample_size' => $data['ab_test_sample_size'] ?? 50,
            'scheduled_at' => $data['scheduled_at'] ?? null,
            'created_by' => $data['created_by'] ?? get_current_user_id(),
            'created_at' => current_time('mysql', true),
            // Seed updated_at in UTC on create: the DEFAULT CURRENT_TIMESTAMP
            // column would otherwise hold DB-session-local time until the first
            // edit, so a never-edited row shows a wrong-offset "updated" time.
            'updated_at' => current_time('mysql', true),
        ];

        $result = $this->db->insert($this->campaignsTable, $insert_data);

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
            'name', 'description', 'campaign_type', 'status', 'subject', 'preview_text',
            'from_name', 'from_email', 'reply_to', 'email_provider_id', 'email_content', 'content_mode', 'json_structure', 'template_id',
            'target_segments', 'target_lists', 'target_tags',
            'exclude_segments', 'exclude_lists', 'exclude_tags',
            'settings', 'stats', 'scheduled_at', 'sent_at',
            'ab_testing_enabled', 'ab_test_winner_metric', 'ab_test_sample_size',
        ];

        // Columns where an empty value is a meaningful "clear it" instruction, so
        // presence is tested with array_key_exists and the value stored as null.
        $nullable_fields = ['scheduled_at', 'sent_at', 'email_provider_id', 'template_id', 'json_structure'];

        foreach ($allowed_fields as $field) {
            $present = in_array($field, $nullable_fields, true)
                ? array_key_exists($field, $data)
                : isset($data[$field]);

            if (!$present) {
                continue;
            }

            if (in_array($field, ['target_segments', 'target_lists', 'target_tags', 'exclude_segments', 'exclude_lists', 'exclude_tags', 'settings', 'stats'], true)) {
                $update_data[$field] = is_array($data[$field]) ? json_encode($data[$field]) : $data[$field];
            } elseif ($field === 'email_provider_id') {
                // Empty selection means "use the default provider" → store null.
                $update_data[$field] = !empty($data[$field]) ? (int) $data[$field] : null;
            } elseif (in_array($field, $nullable_fields, true)) {
                $update_data[$field] = !empty($data[$field]) ? $data[$field] : null;
            } else {
                $update_data[$field] = $data[$field];
            }
        }

        if (empty($update_data)) {
            return false;
        }

        $update_data['updated_at'] = current_time('mysql', true);

        $result = $this->db->update(
            $this->campaignsTable,
            $update_data,
            ['id' => $id]
        );

        return $result !== false;
    }

    /**
     * Permit dispatch. Whether the send starts now or waits for `scheduled_at`
     * is decided by the campaign's own schedule, not by this call.
     *
     * @param int $id
     */
    public function activate($id): bool
    {
        return $this->update($id, ['status' => Campaign::STATUS_ACTIVE]);
    }

    /**
     * Hold dispatch. Queued rows stay queued — the sender skips them while the
     * campaign is not active — so activating again resumes where it stopped.
     *
     * @param int $id
     */
    public function pause($id): bool
    {
        return $this->update($id, ['status' => Campaign::STATUS_PAUSED]);
    }

    /**
     * Close a campaign whose queue has fully drained.
     *
     * @param int $id
     */
    public function markSent($id): bool
    {
        return $this->update($id, [
            'status' => Campaign::STATUS_SENT,
            'sent_at' => current_time('mysql', true),
        ]);
    }

    /** @param int $id */
    public function delete($id): bool
    {
        $this->db->delete($this->campaignEmailsTable, ['campaign_id' => $id]);
        $this->db->delete($this->campaignLinksTable, ['campaign_id' => $id]);
        $this->db->delete($this->campaignVariantsTable, ['campaign_id' => $id]);

        // The A/B decision the Pro add-on records per campaign. Cleared here, with
        // the variants, because deleting a campaign must leave nothing behind
        // whether or not Pro is installed to clean up after itself.
        delete_option('kelune_crm_ab_test_' . (int) $id);

        return $this->db->delete($this->campaignsTable, ['id' => $id]) !== false;
    }

    /**
     * @param int $id
     * @return int|false
     */
    public function duplicate($id)
    {
        $campaign = $this->find($id);

        if (!$campaign) {
            return false;
        }

        $data = $campaign->toArray();
        // A copy starts over: no send history, and no inherited send time — an
        // old date would make the copy due the moment it is activated.
        unset($data['id'], $data['created_at'], $data['updated_at'], $data['sent_at'], $data['scheduled_at']);

        $data['name'] = $data['name'] . ' (Copy)';
        $data['status'] = Campaign::STATUS_DRAFT;
        $data['stats'] = [];

        $new_id = $this->create($data);

        if ($new_id) {
            $this->duplicateVariants($id, (int) $new_id);
        }

        return $new_id;
    }

    /**
     * Copy all A/B variants from one campaign to another, resetting their stats.
     */
    private function duplicateVariants(int $source_id, int $target_id): void
    {
        $variants = $this->db->get_results(
            $this->db->prepare(
                "SELECT variant_type, variant_label, test_percentage, subject, email_content, from_name
                 FROM {$this->campaignVariantsTable} WHERE campaign_id = %d",
                $source_id
            ),
            ARRAY_A
        );

        if (empty($variants)) {
            return;
        }

        foreach ($variants as $variant) {
            $this->db->insert($this->campaignVariantsTable, [
                'campaign_id' => $target_id,
                'variant_type' => $variant['variant_type'],
                'variant_label' => $variant['variant_label'],
                'test_percentage' => $variant['test_percentage'],
                'subject' => $variant['subject'],
                'email_content' => $variant['email_content'],
                'from_name' => $variant['from_name'],
                'created_at' => current_time('mysql', true),
            ]);
        }
    }

    /**
     * @param int $campaign_id
     * @return int
     */
    public function calculateRecipientCount($campaign_id)
    {
        $campaign = $this->find($campaign_id);

        if (!$campaign) {
            return 0;
        }

        return $this->getRecipientCount(
            $campaign->getTargetSegmentsArray(),
            $campaign->getTargetListsArray(),
            $campaign->getTargetTagsArray(),
            $campaign->getExcludeSegmentsArray(),
            $campaign->getExcludeListsArray(),
            $campaign->getExcludeTagsArray()
        );
    }

    /**
     * Narrow a set of contact ids to the ones that may currently be emailed.
     *
     * Queried in chunks: a large list can hold tens of thousands of ids and a
     * single IN() of that size risks blowing past max_allowed_packet.
     *
     * @param array<int, mixed> $contact_ids
     * @return array<int, string>
     */
    private function filterSendableContacts(array $contact_ids): array
    {
        $ids = array_values(array_unique(array_filter(array_map('absint', $contact_ids))));

        if ($ids === []) {
            return [];
        }

        $sendable = [];

        foreach (array_chunk($ids, 5000) as $chunk) {
            $placeholders = implode(',', array_fill(0, count($chunk), '%d'));
            $query = $this->db->prepare(
                "SELECT id FROM {$this->contactsTable}
                WHERE status = 'active'
                AND email IS NOT NULL AND email <> ''
                AND id IN ({$placeholders})",
                $chunk
            );

            if ($query) {
                $sendable = array_merge($sendable, $this->db->get_col($query) ?: []);
            }
        }

        return $sendable;
    }

    /**
     * @param array<int, mixed> $segments
     * @param array<int, mixed> $lists
     * @param array<int, mixed> $tags
     * @param array<int, mixed> $exclude_segments
     * @param array<int, mixed> $exclude_lists
     * @param array<int, mixed> $exclude_tags
     * @return array<int, mixed>
     */
    public function getRecipientIds($segments = [], $lists = [], $tags = [], $exclude_segments = [], $exclude_lists = [], $exclude_tags = []): array
    {
        $contact_ids = [];

        if (!empty($segments)) {
            foreach ($segments as $segment_id) {
                $segment_contact_ids = $this->db->get_col(
                    $this->db->prepare(
                        "SELECT contact_id FROM {$this->segmentContactsTable} WHERE segment_id = %d",
                        $segment_id
                    )
                );
                $contact_ids = array_merge($contact_ids, $segment_contact_ids);
            }
        }

        if (!empty($lists)) {
            foreach ($lists as $list_id) {
                $list_contact_ids = $this->db->get_col(
                    $this->db->prepare(
                        "SELECT contact_id FROM {$this->contactListsTable} WHERE list_id = %d",
                        $list_id
                    )
                );
                $contact_ids = array_merge($contact_ids, $list_contact_ids);
            }
        }

        if (!empty($tags)) {
            foreach ($tags as $tag_id) {
                $tag_contact_ids = $this->db->get_col(
                    $this->db->prepare(
                        "SELECT contact_id FROM {$this->contactTagsTable} WHERE tag_id = %d",
                        $tag_id
                    )
                );
                $contact_ids = array_merge($contact_ids, $tag_contact_ids);
            }
        }

        // Targeting rules that match nobody mean nobody — never everybody. An
        // emptied or deleted list must not silently widen the send to the whole
        // database, which is the one mistake a mailing tool cannot take back.
        $contact_ids = array_unique($contact_ids);

        // The pivot tables know nothing about contact status, so without this an
        // unsubscribed contact keeps receiving list-targeted campaigns and a
        // pending opt-in contact is mailed before confirming.
        $contact_ids = $this->filterSendableContacts($contact_ids);

        $exclude_contact_ids = [];
        if (!empty($exclude_segments)) {
            foreach ($exclude_segments as $segment_id) {
                $segment_contact_ids = $this->db->get_col(
                    $this->db->prepare(
                        "SELECT contact_id FROM {$this->segmentContactsTable} WHERE segment_id = %d",
                        $segment_id
                    )
                );
                $exclude_contact_ids = array_merge($exclude_contact_ids, $segment_contact_ids);
            }
        }

        if (!empty($exclude_lists)) {
            foreach ($exclude_lists as $list_id) {
                $list_contact_ids = $this->db->get_col(
                    $this->db->prepare(
                        "SELECT contact_id FROM {$this->contactListsTable} WHERE list_id = %d",
                        $list_id
                    )
                );
                $exclude_contact_ids = array_merge($exclude_contact_ids, $list_contact_ids);
            }
        }

        if (!empty($exclude_tags)) {
            foreach ($exclude_tags as $tag_id) {
                $tag_contact_ids = $this->db->get_col(
                    $this->db->prepare(
                        "SELECT contact_id FROM {$this->contactTagsTable} WHERE tag_id = %d",
                        $tag_id
                    )
                );
                $exclude_contact_ids = array_merge($exclude_contact_ids, $tag_contact_ids);
            }
        }

        if (!empty($exclude_contact_ids)) {
            $exclude_contact_ids = array_unique($exclude_contact_ids);
            $contact_ids = array_diff($contact_ids, $exclude_contact_ids);
        }

        return array_values($contact_ids);
    }

    /**
     * Recipients this campaign still owes an email: contacts it targets that
     * hold no queue row.
     *
     * Only contacts that already existed when the send began count, so a
     * finished campaign never drips out to people who joined afterwards. A send
     * that queues in batches (an A/B sample first) reports its untouched
     * remainder here, which is what stops the completion sweep closing it early.
     *
     * @return array<int, int>
     */
    public function unqueuedRecipientIds(int $campaign_id): array
    {
        $started = $this->db->get_var(
            $this->db->prepare(
                "SELECT MIN(created_at) FROM {$this->campaignEmailsTable} WHERE campaign_id = %d",
                $campaign_id
            )
        );

        $campaign = $this->find($campaign_id);

        if (!$started || !$campaign) {
            return [];
        }

        $recipients = array_values(array_unique(array_filter(array_map('absint', $this->getRecipientIds(
            $campaign->getTargetSegmentsArray(),
            $campaign->getTargetListsArray(),
            $campaign->getTargetTagsArray(),
            $campaign->getExcludeSegmentsArray(),
            $campaign->getExcludeListsArray(),
            $campaign->getExcludeTagsArray()
        )))));

        $missing = [];

        // Chunked for the same reason filterSendableContacts() is: a large list
        // can hold tens of thousands of ids.
        foreach (array_chunk($recipients, 5000) as $chunk) {
            $placeholders = implode(',', array_fill(0, count($chunk), '%d'));
            $query = $this->db->prepare(
                "SELECT c.id FROM {$this->contactsTable} c
                WHERE c.id IN ({$placeholders})
                AND c.created_at <= %s
                AND NOT EXISTS (
                    SELECT 1 FROM {$this->campaignEmailsTable} ce
                    WHERE ce.campaign_id = %d AND ce.contact_id = c.id
                )",
                array_merge($chunk, [$started, $campaign_id])
            );

            if ($query) {
                $missing = array_merge($missing, $this->db->get_col($query) ?: []);
            }
        }

        return array_map('intval', $missing);
    }

    /**
     * @param array<int, mixed> $segments
     * @param array<int, mixed> $lists
     * @param array<int, mixed> $tags
     * @param array<int, mixed> $exclude_segments
     * @param array<int, mixed> $exclude_lists
     * @param array<int, mixed> $exclude_tags
     */
    public function getRecipientCount($segments = [], $lists = [], $tags = [], $exclude_segments = [], $exclude_lists = [], $exclude_tags = []): int
    {
        $contact_ids = $this->getRecipientIds($segments, $lists, $tags, $exclude_segments, $exclude_lists, $exclude_tags);
        return count($contact_ids);
    }

    /**
     * @param int $campaign_id
     * @return array<string, mixed>
     */
    public function getStats($campaign_id): array
    {
        $stats = $this->db->get_row(
            $this->db->prepare(
                // 'cancelled'/'parked' rows are withheld from a contact who is
                // not mailable, so they are not sends: counting them would
                // inflate total_sent and deflate every rate built on it.
                "SELECT
                    COUNT(*) as total_sent,
                    SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as delivered,
                    SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced,
                    SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as unique_opens,
                    SUM(open_count) as total_opens,
                    SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as unique_clicks,
                    SUM(click_count) as total_clicks,
                    SUM(CASE WHEN unsubscribed_at IS NOT NULL THEN 1 ELSE 0 END) as unsubscribes
                FROM {$this->campaignEmailsTable}
                WHERE campaign_id = %d
                AND status NOT IN ('cancelled', 'parked')",
                $campaign_id
            ),
            ARRAY_A
        );

        if (!$stats || $stats['total_sent'] == 0) {
            return [
                'total_sent' => 0,
                'delivered' => 0,
                'bounced' => 0,
                'unique_opens' => 0,
                'total_opens' => 0,
                'unique_clicks' => 0,
                'total_clicks' => 0,
                'unsubscribes' => 0,
                'open_rate' => 0,
                'click_rate' => 0,
                'bounce_rate' => 0,
                'unsubscribe_rate' => 0,
            ];
        }

        $total = (int) $stats['total_sent'];
        $delivered = (int) $stats['delivered'];

        return [
            'total_sent' => $total,
            'delivered' => $delivered,
            'bounced' => (int) $stats['bounced'],
            'unique_opens' => (int) $stats['unique_opens'],
            'total_opens' => (int) $stats['total_opens'],
            'unique_clicks' => (int) $stats['unique_clicks'],
            'total_clicks' => (int) $stats['total_clicks'],
            'unsubscribes' => (int) $stats['unsubscribes'],
            'open_rate' => $delivered > 0 ? round(($stats['unique_opens'] / $delivered) * 100, 2) : 0,
            'click_rate' => $delivered > 0 ? round(($stats['unique_clicks'] / $delivered) * 100, 2) : 0,
            'bounce_rate' => $total > 0 ? round(($stats['bounced'] / $total) * 100, 2) : 0,
            'unsubscribe_rate' => $delivered > 0 ? round(($stats['unsubscribes'] / $delivered) * 100, 2) : 0,
        ];
    }

    /**
     * @param int $campaign_id
     * @return array<string, mixed>
     */
    public function updateStats($campaign_id)
    {
        $stats = $this->getStats($campaign_id);

        $this->update($campaign_id, [
            'stats' => $stats,
        ]);

        return $stats;
    }

    /** @return array<string, mixed> */
    public function getSummaryStats(): array
    {
        $total = $this->db->get_var("SELECT COUNT(*) FROM {$this->campaignsTable}");
        $active = $this->db->get_var($this->db->prepare("SELECT COUNT(*) FROM {$this->campaignsTable} WHERE status = %s", Campaign::STATUS_ACTIVE));
        // Scheduled is a display state, not a status: an active campaign whose
        // send time has not arrived yet.
        $scheduled = $this->db->get_var(
            $this->db->prepare(
                "SELECT COUNT(*) FROM {$this->campaignsTable}
                WHERE status = %s AND scheduled_at IS NOT NULL AND scheduled_at > UTC_TIMESTAMP()",
                Campaign::STATUS_ACTIVE
            )
        );

        $avg_stats = $this->db->get_row(
            "SELECT
                AVG(CAST(JSON_EXTRACT(stats, '$.open_rate') AS DECIMAL(5,2))) as avg_open_rate,
                AVG(CAST(JSON_EXTRACT(stats, '$.click_rate') AS DECIMAL(5,2))) as avg_click_rate
            FROM {$this->campaignsTable}
            WHERE status = 'sent' AND stats IS NOT NULL",
            ARRAY_A
        );

        return [
            'total_campaigns' => (int) $total,
            'active_campaigns' => (int) $active,
            'scheduled_campaigns' => (int) $scheduled,
            'avg_open_rate' => round((float) ($avg_stats['avg_open_rate'] ?? 0), 2),
            'avg_click_rate' => round((float) ($avg_stats['avg_click_rate'] ?? 0), 2),
        ];
    }

    /**
     * Opens/clicks broken down by recipient country (joined from contacts).
     *
     * @return array<int, array<string, mixed>>
     */
    public function getGeographicStats(int $campaign_id): array
    {
        $rows = $this->db->get_results(
            $this->db->prepare(
                "SELECT
                    CASE WHEN co.country IS NULL OR co.country = '' THEN 'Unknown' ELSE co.country END as country,
                    COUNT(*) as sends,
                    SUM(CASE WHEN ce.opened_at IS NOT NULL THEN 1 ELSE 0 END) as opens,
                    SUM(CASE WHEN ce.clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicks
                FROM {$this->campaignEmailsTable} ce
                LEFT JOIN {$this->contactsTable} co ON co.id = ce.contact_id
                WHERE ce.campaign_id = %d
                AND ce.status NOT IN ('cancelled', 'parked')
                GROUP BY country
                ORDER BY sends DESC",
                $campaign_id
            ),
            ARRAY_A
        );

        return array_map(function ($r): array {
            $sends = (int) $r['sends'];
            $opens = (int) $r['opens'];
            $clicks = (int) $r['clicks'];

            return [
                'country' => (string) $r['country'],
                'sends' => $sends,
                'opens' => $opens,
                'clicks' => $clicks,
                'open_rate' => $sends > 0 ? round(($opens / $sends) * 100, 2) : 0,
                'click_rate' => $sends > 0 ? round(($clicks / $sends) * 100, 2) : 0,
            ];
        }, $rows ?: []);
    }

    /**
     * Engagement broken down by a tracked column (device_type or browser).
     * Only opened emails carry these values, so figures are among opens.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getEngagementBreakdown(int $campaign_id, string $column): array
    {
        $allowed = ['device_type', 'browser', 'os'];
        if (!in_array($column, $allowed, true)) {
            return [];
        }

        $rows = $this->db->get_results(
            $this->db->prepare(
                "SELECT
                    CASE WHEN {$column} IS NULL OR {$column} = '' THEN 'Unknown' ELSE {$column} END as label,
                    SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as opens,
                    SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as clicks
                FROM {$this->campaignEmailsTable}
                WHERE campaign_id = %d AND opened_at IS NOT NULL
                GROUP BY label
                ORDER BY opens DESC",
                $campaign_id
            ),
            ARRAY_A
        );

        return array_map(function ($r): array {
            $opens = (int) $r['opens'];
            $clicks = (int) $r['clicks'];

            return [
                'label' => (string) $r['label'],
                'opens' => $opens,
                'clicks' => $clicks,
                'click_rate' => $opens > 0 ? round(($clicks / $opens) * 100, 2) : 0,
            ];
        }, $rows ?: []);
    }

    /**
     * Per-link click counts for a campaign.
     *
     * Counts only: clicks are recorded per link, not per recipient, so a link
     * can be followed several times by the same contact. Nothing here can be
     * turned into a rate — every ratio the send would support has the same
     * denominator for every row anyway, so it would rank nothing the counts do
     * not already rank.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getLinkStats(int $campaign_id): array
    {
        $rows = $this->db->get_results(
            $this->db->prepare(
                "SELECT original_url, total_clicks
                FROM {$this->campaignLinksTable}
                WHERE campaign_id = %d
                ORDER BY total_clicks DESC",
                $campaign_id
            ),
            ARRAY_A
        );

        return array_map(static function ($r): array {
            return [
                'url' => (string) $r['original_url'],
                'total_clicks' => (int) $r['total_clicks'],
            ];
        }, $rows ?: []);
    }

    /**
     * Recent sent campaigns with their cached open/click rates, for the
     * analytics performance table.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getPerformanceList(int $limit = 20): array
    {
        $rows = $this->db->get_results(
            $this->db->prepare(
                "SELECT id, name, status, sent_at, stats
                 FROM {$this->campaignsTable}
                 WHERE status = 'sent'
                 ORDER BY sent_at DESC
                 LIMIT %d",
                $limit
            ),
            ARRAY_A
        ) ?: [];

        return array_map([$this, 'mapPerformanceRow'], $rows);
    }

    /**
     * Top sent campaigns ranked by a cached rate metric (open_rate|click_rate).
     *
     * @return array<int, array<string, mixed>>
     */
    public function getTopCampaigns(string $metric = 'open_rate', int $limit = 5): array
    {
        $metric = in_array($metric, ['open_rate', 'click_rate'], true) ? $metric : 'open_rate';
        $orderExpr = "CAST(JSON_EXTRACT(stats, '$.{$metric}') AS DECIMAL(6,2))";

        $rows = $this->db->get_results(
            $this->db->prepare(
                "SELECT id, name, status, sent_at, stats
                 FROM {$this->campaignsTable}
                 WHERE status = 'sent' AND stats IS NOT NULL
                 ORDER BY {$orderExpr} DESC
                 LIMIT %d",
                $limit
            ),
            ARRAY_A
        ) ?: [];

        return array_map([$this, 'mapPerformanceRow'], $rows);
    }

    /**
     * Flatten a campaign row + its cached stats JSON into a chart-ready shape.
     *
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function mapPerformanceRow(array $row): array
    {
        $stats = [];
        if (!empty($row['stats'])) {
            $decoded = json_decode((string) $row['stats'], true);
            if (is_array($decoded)) {
                $stats = $decoded;
            }
        }

        return [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'status' => (string) $row['status'],
            'sent_at' => $row['sent_at'] !== null ? (string) $row['sent_at'] : null,
            'total_sent' => (int) ($stats['total_sent'] ?? 0),
            'unique_opens' => (int) ($stats['unique_opens'] ?? 0),
            'unique_clicks' => (int) ($stats['unique_clicks'] ?? 0),
            'open_rate' => (float) ($stats['open_rate'] ?? 0),
            'click_rate' => (float) ($stats['click_rate'] ?? 0),
        ];
    }
}
