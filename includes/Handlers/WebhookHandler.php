<?php

declare(strict_types=1);

namespace KeluneCRM\Handlers;

use KeluneCRM\Repositories\ContactRepository;
use KeluneCRM\Repositories\IncomingWebhookRepository;
use KeluneCRM\Services\PayloadNormalizer;
use KeluneCRM\Services\RateLimiter;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

if (!defined('ABSPATH')) {
    exit;
}

class WebhookHandler
{
    private \KeluneCRM\Repositories\IncomingWebhookRepository $repository;
    /** @var \wpdb */
    private $wpdb;
    private string $logsTable;
    private \KeluneCRM\Services\PayloadNormalizer $normalizer;
    private \KeluneCRM\Services\RateLimiter $rateLimiter;
    private \KeluneCRM\Repositories\ContactRepository $contactRepository;

    public function __construct()
    {
        global $wpdb;
        $this->wpdb = $wpdb;
        $this->repository = new IncomingWebhookRepository();
        $this->logsTable = $wpdb->prefix . 'kelune_crm_webhook_logs';
        $this->normalizer = new PayloadNormalizer();
        $this->rateLimiter = new RateLimiter();
        $this->contactRepository = new ContactRepository();
    }

    public function registerRoutes(string $namespace = 'kelune-crm/v1'): void
    {
        // Public webhook receiver. Authorization is the secret webhook_key in
        // the URL (a prepared DB lookup in handle()), plus per-key active check,
        // rate limiting and IP allow-listing — machine-to-machine, so no nonce.
        register_rest_route($namespace, '/webhook/(?P<webhook_key>[a-zA-Z0-9_-]+)', [
            'methods' => 'POST',
            'callback' => [$this, 'handle'],
            'permission_callback' => [$this, 'allowPublicAccess'],
        ]);
    }

    /**
     * Permission gate for the public webhook receiver. Returns true because
     * authorization is the secret key carried in the URL, enforced in handle().
     */
    public function allowPublicAccess(WP_REST_Request $request): bool
    {
        return true;
    }

    public function handle(WP_REST_Request $request): \WP_Error|\WP_REST_Response
    {
        $start_time = microtime(true);
        $webhook_key = $request->get_param('webhook_key');
        $ip_address = $this->getClientIp();

        $webhook = $this->repository->findByKey($webhook_key);

        if (!$webhook) {
            $message = __('Webhook not found', 'kelune-crm');
            $this->logRequest(null, $request, 404, ['error' => $message], $ip_address, $start_time, $message);
            return new WP_Error('not_found', $message, ['status' => 404]);
        }

        if (!$webhook->isActive()) {
            $message = __('Webhook is inactive', 'kelune-crm');
            $this->logRequest($webhook->id, $request, 403, ['error' => $message], $ip_address, $start_time, $message);
            return new WP_Error('inactive', $message, ['status' => 403]);
        }

        $rateLimitCheck = $this->rateLimiter->check((int) $webhook->id);
        if (!$rateLimitCheck['allowed']) {
            $this->logRequest($webhook->id, $request, 429, ['error' => $rateLimitCheck['message']], $ip_address, $start_time, $rateLimitCheck['message']);
            return new WP_Error('rate_limit_exceeded', $rateLimitCheck['message'], [
                'status' => 429,
                'retry_after' => $rateLimitCheck['retry_after'],
            ]);
        }

        if (!$webhook->isIpAllowed($ip_address)) {
            $message = __('IP address not allowed', 'kelune-crm');
            $this->logRequest($webhook->id, $request, 403, ['error' => $message], $ip_address, $start_time, $message);
            return new WP_Error('forbidden', $message, ['status' => 403]);
        }

        // Get request data - support multiple content types
        $payload = $request->get_json_params(); // Try JSON first

        if (empty($payload)) {
            // Try form data or URL-encoded
            $payload = $request->get_body_params();
        }

        if (empty($payload)) {
            $message = __('Empty payload', 'kelune-crm');
            $this->logRequest($webhook->id, $request, 400, ['error' => $message], $ip_address, $start_time, $message);
            return new WP_Error('invalid_payload', $message, ['status' => 400]);
        }

        // Normalize payload (handles both flat and nested formats)
        $normalized = $this->normalizer->normalize($payload);

        $data = isset($normalized['data']) ? $normalized['data'] : $normalized;
        if (empty($data['email'])) {
            $message = __('Email is required', 'kelune-crm');
            $this->logRequest($webhook->id, $request, 400, ['error' => $message], $ip_address, $start_time, $message);
            return new WP_Error('validation_error', $message, ['status' => 400]);
        }

        // Apply default lists and tags ONLY if not provided in payload
        $defaultLists = !empty($webhook->default_lists) ? (is_array($webhook->default_lists) ? $webhook->default_lists : json_decode($webhook->default_lists, true)) : [];
        $defaultTags = !empty($webhook->default_tags) ? (is_array($webhook->default_tags) ? $webhook->default_tags : json_decode($webhook->default_tags, true)) : [];

        if (!isset($data['lists']) && !empty($defaultLists)) {
            $data['lists'] = $defaultLists;
        }

        if (!isset($data['tags']) && !empty($defaultTags)) {
            $data['tags'] = $defaultTags;
        }

        // Process the webhook - smart upsert
        try {
            $result = $this->processContact($data, $webhook);

            $this->rateLimiter->increment((int) $webhook->id);
            $this->repository->incrementRequestCount((int) $webhook->id);

            $this->logRequest($webhook->id, $request, 200, $result, $ip_address, $start_time);

            return new WP_REST_Response([
                'success' => true,
                'message' => __('Webhook processed successfully', 'kelune-crm'),
                'data' => $result,
            ], 200);
        } catch (\Exception $e) {
            // An exception may carry an HTTP status in its code (e.g. 403 when a
            // required action is not allowed for this webhook); anything outside
            // the 4xx/5xx range is treated as an unexpected server error.
            $code = $e->getCode();
            $status = (is_int($code) && $code >= 400 && $code < 600) ? $code : 500;
            $errorCode = $status === 403 ? 'forbidden' : 'processing_error';
            $this->logRequest($webhook->id, $request, $status, ['error' => $e->getMessage()], $ip_address, $start_time, $e->getMessage());
            return new WP_Error($errorCode, $e->getMessage(), ['status' => $status]);
        }
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function processContact(array $payload, \KeluneCRM\Models\IncomingWebhook $webhook): array
    {
        // Fire WordPress action for extensibility
        do_action('kelune_crm_webhook_before_process', $payload, $webhook);

        global $wpdb;
        $tableName = $wpdb->prefix . 'kelune_crm_contacts';

        $email = sanitize_email($payload['email']);

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API, fresh read required.
        $existing = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM %i WHERE email = %s',
            $tableName,
            $email
        ));

        $contact_id = null;
        $action_performed = '';

        if ($existing) {
            // Contact exists - check if update is allowed
            if ($webhook->isActionAllowed('update_contact')) {
                $update_data = ['updated_at' => current_time('mysql', true)];

                if (isset($payload['first_name'])) {
                    $update_data['first_name'] = sanitize_text_field($payload['first_name']);
                }

                if (isset($payload['last_name'])) {
                    $update_data['last_name'] = sanitize_text_field($payload['last_name']);
                }

                if (isset($payload['status'])) {
                    // Clamp to a real contact status; an unrecognised value is
                    // ignored rather than written, so a webhook cannot park a
                    // contact in a status no code path understands.
                    $status = sanitize_text_field((string) $payload['status']);
                    if (\KeluneCRM\Models\Contact::isValidStatus($status)) {
                        $update_data['status'] = $status;
                    }
                }

                if (isset($payload['custom_fields']) && is_array($payload['custom_fields'])) {
                    // Merge with existing custom fields
                    $existing_custom_fields = json_decode($existing->custom_fields ?: '{}', true);
                    $existing_custom_fields = is_array($existing_custom_fields) ? $existing_custom_fields : [];
                    $merged_fields = array_merge(
                        $existing_custom_fields,
                        $this->sanitizeCustomFields($payload['custom_fields'])
                    );
                    $update_data['custom_fields'] = wp_json_encode($merged_fields);
                }

                // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API.
                $wpdb->update($tableName, $update_data, ['id' => $existing->id]);
                $action_performed = 'updated';
            } else {
                $action_performed = 'skipped_update';
            }
            $contact_id = $existing->id;
        } else {
            // Contact doesn't exist - check if create is allowed
            if (!$webhook->isActionAllowed('create_contact')) {
                throw new \Exception(esc_html__('Contact not found and the create_contact action is not allowed for this webhook.', 'kelune-crm'), 403);
            }

            $data = [
                'email' => $email,
                'first_name' => isset($payload['first_name']) ? sanitize_text_field($payload['first_name']) : '',
                'last_name' => isset($payload['last_name']) ? sanitize_text_field($payload['last_name']) : '',
                'status' => 'active',
                'source' => 'webhook',
                'created_at' => current_time('mysql', true),
                'updated_at' => current_time('mysql', true),
            ];

            if (isset($payload['custom_fields']) && is_array($payload['custom_fields'])) {
                $data['custom_fields'] = wp_json_encode($this->sanitizeCustomFields($payload['custom_fields']));
            }

            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API.
            $wpdb->insert($tableName, $data);
            $contact_id = $wpdb->insert_id;
            $action_performed = 'created';
        }

        // Fire the same domain hooks the REST controller and sync service fire,
        // so a webhook contact enrols in automations like a dashboard one.
        if ($contact_id && in_array($action_performed, ['created', 'updated'], true)) {
            $contact = $this->contactRepository->find((int) $contact_id);
            if ($contact) {
                if ('created' === $action_performed) {
                    do_action('kelune_crm_contact_created', (int) $contact_id, $contact->toArray());
                } else {
                    do_action('kelune_crm_contact_updated', (int) $contact_id, $contact->toArray());
                }
            }
        }

        // Process lists - ADD
        $lists_added = 0;
        if (!empty($payload['lists']) && is_array($payload['lists']) && $webhook->isActionAllowed('add_list')) {
            $added = $this->assignListsToContact($contact_id, $payload['lists']);
            $lists_added = count($added);
            // Mirror the dashboard: a list attach fires `lists_added`, which is
            // itself an automation trigger (e.g. "on Added to List").
            if (!empty($added)) {
                do_action('kelune_crm_lists_added', (int) $contact_id, $added);
            }
        }

        // Process lists - REMOVE
        $lists_removed = 0;
        if (!empty($payload['lists_remove']) && is_array($payload['lists_remove']) && $webhook->isActionAllowed('remove_list')) {
            $removed = $this->removeListsFromContact($contact_id, $payload['lists_remove']);
            $lists_removed = count($removed);
            if (!empty($removed)) {
                do_action('kelune_crm_lists_removed', (int) $contact_id, $removed);
            }
        }

        // Process tags - ADD
        $tags_added = 0;
        if (!empty($payload['tags']) && is_array($payload['tags']) && $webhook->isActionAllowed('add_tag')) {
            $added = $this->assignTagsToContact($contact_id, $payload['tags']);
            $tags_added = count($added);
            if (!empty($added)) {
                do_action('kelune_crm_tags_added', (int) $contact_id, $added);
            }
        }

        // Process tags - REMOVE
        $tags_removed = 0;
        if (!empty($payload['tags_remove']) && is_array($payload['tags_remove']) && $webhook->isActionAllowed('remove_tag')) {
            $removed = $this->removeTagsFromContact($contact_id, $payload['tags_remove']);
            $tags_removed = count($removed);
            if (!empty($removed)) {
                do_action('kelune_crm_tags_removed', (int) $contact_id, $removed);
            }
        }

        $result = [
            'contact_id' => $contact_id,
            'email' => $email,
            'action' => $action_performed,
            'lists_added' => $lists_added,
            'lists_removed' => $lists_removed,
            'tags_added' => $tags_added,
            'tags_removed' => $tags_removed,
        ];

        // Fire WordPress action after processing
        do_action('kelune_crm_webhook_after_process', $payload, $webhook, $result);

        return $result;
    }

    /**
     * @param int|null $webhook_id
     * @param array<string, mixed> $response_data
     * @param string|null $error_message
     */
    private function logRequest($webhook_id, WP_REST_Request $request, int $status, array $response_data, string $ip_address, string|float $start_time, $error_message = null): void
    {
        // Skip logging if webhook_id is null (webhook not found)
        if ($webhook_id === null) {
            return;
        }

        $processing_time = round((microtime(true) - (float) $start_time) * 1000, 2);

        $payload = $request->get_json_params();
        if (empty($payload)) {
            $payload = $request->get_body_params();
        }

        $log_data = [
            'webhook_id' => $webhook_id,
            'request_url' => $request->get_route(),
            'request_method' => $request->get_method(),
            'request_headers' => json_encode($request->get_headers()),
            'request_payload' => json_encode($payload),
            'response_status' => $status,
            'response_body' => json_encode($response_data),
            'ip_address' => $ip_address,
            'processing_time' => $processing_time,
            'error_message' => $error_message,
            'created_at' => current_time('mysql', true),
        ];

        $this->wpdb->insert($this->logsTable, $log_data);
    }

    private function getClientIp(): string
    {
        $ip_keys = ['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_REAL_IP', 'REMOTE_ADDR'];

        foreach ($ip_keys as $key) {
            if (!isset($_SERVER[$key])) {
                continue;
            }
            $ip = sanitize_text_field(wp_unslash($_SERVER[$key]));
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }

        return '0.0.0.0';
    }

    /**
     * Sanitize a webhook payload's custom_fields map.
     *
     * This endpoint is authorized by a webhook key, not a logged-in user, so the
     * payload is untrusted input from the public internet — and these values are
     * rendered back into the admin contact screen. Keys are reduced to key-safe
     * strings and every value to plain text, one level deep: a list keeps its
     * shape but each item is sanitized, and nested structures are dropped.
     *
     * @param array<string, mixed> $fields
     * @return array<string, string|array<int, string>>
     */
    private function sanitizeCustomFields(array $fields): array
    {
        $clean = [];

        foreach ($fields as $key => $value) {
            $safe_key = sanitize_key((string) $key);

            if ($safe_key === '') {
                continue;
            }

            if (is_array($value)) {
                $clean[$safe_key] = array_values(array_map(
                    static fn ($item): string => sanitize_text_field(is_scalar($item) ? (string) $item : ''),
                    $value
                ));

                continue;
            }

            if (!is_scalar($value)) {
                $value = '';
            }

            $clean[$safe_key] = sanitize_text_field((string) $value);
        }

        return $clean;
    }

    /**
     * Assign lists to contact (additive - merges with existing)
     *
     * @param int $contact_id
     * @param mixed $list_ids
     * @return array<int, int> Added list IDs
     */
    private function assignListsToContact($contact_id, $list_ids): array
    {
        if (empty($list_ids) || !is_array($list_ids)) {
            return [];
        }

        global $wpdb;
        $tableName = $wpdb->prefix . 'kelune_crm_contact_lists';
        $added = [];

        foreach ($list_ids as $list_id) {
            $list_id = intval($list_id);
            if ($list_id <= 0) {
                continue;
            }

            // Use INSERT IGNORE to avoid duplicates
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API.
            $result = $wpdb->query($wpdb->prepare(
                'INSERT IGNORE INTO %i (contact_id, list_id, subscribed_at) VALUES (%d, %d, %s)',
                $tableName,
                $contact_id,
                $list_id,
                current_time('mysql', true)
            ));

            if ($result) {
                $added[] = $list_id;
            }
        }

        return $added;
    }

    /**
     * Assign tags to contact (additive - merges with existing)
     *
     * @param int $contact_id
     * @param mixed $tag_ids Array of tag IDs or tag names (for backward compatibility)
     * @return array<int, int> Added tag IDs
     */
    private function assignTagsToContact($contact_id, $tag_ids): array
    {
        if (empty($tag_ids) || !is_array($tag_ids)) {
            return [];
        }

        global $wpdb;
        $tags_table = $wpdb->prefix . 'kelune_crm_tags';
        $contactTagsTable = $wpdb->prefix . 'kelune_crm_contact_tags';
        $added = [];

        foreach ($tag_ids as $tag_identifier) {
            $tag_id = intval($tag_identifier);

            // If not a valid integer, try to find tag by name (backward compatibility)
            if ($tag_id <= 0 && is_string($tag_identifier)) {
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API, fresh read required.
                $tag = $wpdb->get_row($wpdb->prepare(
                    'SELECT id FROM %i WHERE name = %s OR slug = %s LIMIT 1',
                    $tags_table,
                    $tag_identifier,
                    sanitize_title($tag_identifier)
                ));

                if ($tag) {
                    $tag_id = intval($tag->id);
                }
            }

            // Skip if still not a valid ID
            if ($tag_id <= 0) {
                continue;
            }

            // Use INSERT IGNORE to avoid duplicates
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API.
            $result = $wpdb->query($wpdb->prepare(
                'INSERT IGNORE INTO %i (contact_id, tag_id, tagged_at) VALUES (%d, %d, %s)',
                $contactTagsTable,
                $contact_id,
                $tag_id,
                current_time('mysql', true)
            ));

            if ($result) {
                $added[] = $tag_id;
            }
        }

        return $added;
    }

    /**
     * Remove lists from contact
     *
     * @param int $contact_id
     * @param mixed $list_ids
     * @return array<int, int> Removed list IDs
     */
    private function removeListsFromContact($contact_id, $list_ids): array
    {
        if (empty($list_ids) || !is_array($list_ids)) {
            return [];
        }

        global $wpdb;
        $tableName = $wpdb->prefix . 'kelune_crm_contact_lists';
        $removed = [];

        foreach ($list_ids as $list_id) {
            $list_id = intval($list_id);
            if ($list_id <= 0) {
                continue;
            }

            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API.
            $result = $wpdb->delete($tableName, [
                'contact_id' => $contact_id,
                'list_id' => $list_id,
            ]);

            if ($result) {
                $removed[] = $list_id;
            }
        }

        return $removed;
    }

    /**
     * Remove tags from contact
     *
     * @param int $contact_id
     * @param mixed $tag_ids Array of tag IDs or tag names (for backward compatibility)
     * @return array<int, int> Removed tag IDs
     */
    private function removeTagsFromContact($contact_id, $tag_ids): array
    {
        if (empty($tag_ids) || !is_array($tag_ids)) {
            return [];
        }

        global $wpdb;
        $tags_table = $wpdb->prefix . 'kelune_crm_tags';
        $contactTagsTable = $wpdb->prefix . 'kelune_crm_contact_tags';
        $removed = [];

        foreach ($tag_ids as $tag_identifier) {
            $tag_id = intval($tag_identifier);

            // If not a valid integer, try to find tag by name (backward compatibility)
            if ($tag_id <= 0 && is_string($tag_identifier)) {
                // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API, fresh read required.
                $tag = $wpdb->get_row($wpdb->prepare(
                    'SELECT id FROM %i WHERE name = %s OR slug = %s LIMIT 1',
                    $tags_table,
                    $tag_identifier,
                    sanitize_title($tag_identifier)
                ));

                if ($tag) {
                    $tag_id = intval($tag->id);
                }
            }

            // Skip if still not a valid ID
            if ($tag_id <= 0) {
                continue;
            }

            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API.
            $result = $wpdb->delete($contactTagsTable, [
                'contact_id' => $contact_id,
                'tag_id' => $tag_id,
            ]);

            if ($result) {
                $removed[] = $tag_id;
            }
        }

        return $removed;
    }
}
