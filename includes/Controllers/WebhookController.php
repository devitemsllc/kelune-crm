<?php

declare(strict_types=1);

namespace KeluneCRM\Controllers;

use KeluneCRM\Api\Controllers\BaseController;
use KeluneCRM\Repositories\IncomingWebhookRepository;
use WP_REST_Request;

if (!defined('ABSPATH')) {
    exit;
}

class WebhookController extends BaseController
{
    protected string $restBase = 'webhooks';
    private \KeluneCRM\Repositories\IncomingWebhookRepository $repository;

    public function __construct()
    {
        $this->repository = new IncomingWebhookRepository();
    }

    /** @param string $namespace */
    public function registerRoutes($namespace = 'kelune-crm/v1'): void
    {
        $this->namespace = $namespace;

        register_rest_route($namespace, '/webhooks', [
            'methods' => 'GET',
            'callback' => [$this, 'index'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/webhooks', [
            'methods' => 'POST',
            'callback' => [$this, 'store'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/webhooks/(?P<id>\d+)', [
            'methods' => 'GET',
            'callback' => [$this, 'show'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/webhooks/(?P<id>\d+)', [
            'methods' => 'PUT',
            'callback' => [$this, 'update'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/webhooks/(?P<id>\d+)', [
            'methods' => 'DELETE',
            'callback' => [$this, 'destroy'],
            'permission_callback' => [$this, 'checkDeletePermission'],
        ]);

        register_rest_route($namespace, '/webhooks/(?P<id>\d+)/regenerate-key', [
            'methods' => 'POST',
            'callback' => [$this, 'regenerateKey'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/webhooks/(?P<id>\d+)/toggle-status', [
            'methods' => 'POST',
            'callback' => [$this, 'toggleStatus'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/webhooks/(?P<id>\d+)/logs', [
            'methods' => 'GET',
            'callback' => [$this, 'getLogs'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);
    }

    public function index(WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        try {
            $params = [
                'page' => $request->get_param('page') ?: 1,
                'per_page' => $request->get_param('per_page') ?: 20,
                'status' => $request->get_param('status'),
                'search' => $request->get_param('search'),
                'orderby' => $request->get_param('orderby'),
                'order' => $request->get_param('order'),
            ];

            $result = $this->repository->getAll($params);

            return $this->successResponse([
                'data' => array_map(function ($webhook) {
                    return $webhook->toArray();
                }, $result['data']),
                'total' => $result['total'],
                'page' => $result['page'],
                'per_page' => $result['per_page'],
            ]);
        } catch (\Exception $e) {
            return $this->errorResponse($e->getMessage(), 'fetch_error', 500);
        }
    }

    /** Actions a webhook may be permitted to perform. */
    private const ALLOWED_ACTIONS = [
        'create_contact',
        'update_contact',
        'add_tag',
        'remove_tag',
        'add_list',
        'remove_list',
    ];

    /**
     * Sanitize the admin-supplied fields on a create/update payload.
     *
     * Only whitelisted keys are kept; text fields are sanitized, id lists cast
     * to positive ints, status constrained to the known set and allowed_actions
     * intersected with the supported actions.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function sanitizeWritablePayload(array $data): array
    {
        $clean = [];

        if (isset($data['webhook_name'])) {
            $clean['webhook_name'] = sanitize_text_field((string) $data['webhook_name']);
        }

        if (isset($data['description'])) {
            $clean['description'] = sanitize_textarea_field((string) $data['description']);
        }

        if (isset($data['ip_whitelist'])) {
            $clean['ip_whitelist'] = sanitize_textarea_field((string) $data['ip_whitelist']);
        }

        if (isset($data['status'])) {
            $clean['status'] = in_array($data['status'], ['active', 'inactive'], true)
                ? $data['status']
                : 'active';
        }

        if (isset($data['default_lists']) && is_array($data['default_lists'])) {
            $clean['default_lists'] = array_values(array_filter(array_map('absint', $data['default_lists'])));
        }

        if (isset($data['default_tags']) && is_array($data['default_tags'])) {
            $clean['default_tags'] = array_values(array_filter(array_map('absint', $data['default_tags'])));
        }

        if (isset($data['allowed_actions']) && is_array($data['allowed_actions'])) {
            $clean['allowed_actions'] = array_values(array_intersect(
                array_map('sanitize_text_field', $data['allowed_actions']),
                self::ALLOWED_ACTIONS
            ));
        }

        return $clean;
    }

    public function store(WP_REST_Request $request): \WP_Error|\WP_REST_Response
    {
        try {
            $data = $request->get_json_params();

            if (empty($data['webhook_name'])) {
                return $this->errorResponse(__('Webhook name is required', 'kelune-crm'), 'missing_field', 400);
            }

            if (empty($data['allowed_actions']) || !is_array($data['allowed_actions'])) {
                return $this->errorResponse(__('At least one allowed action must be selected', 'kelune-crm'), 'missing_field', 400);
            }

            $data = $this->sanitizeWritablePayload($data);

            if (empty($data['allowed_actions'])) {
                return $this->errorResponse(__('At least one allowed action must be selected', 'kelune-crm'), 'missing_field', 400);
            }

            $id = $this->repository->create($data);

            if (!$id) {
                return $this->errorResponse(__('Failed to create webhook', 'kelune-crm'), 'create_error', 500);
            }

            $webhook = $this->repository->find($id);

            if (!$webhook) {
                return $this->errorResponse(__('Webhook not found', 'kelune-crm'), 'not_found', 404);
            }

            return $this->successResponse($webhook->toArray(), __('Webhook created successfully', 'kelune-crm'), 201);
        } catch (\Exception $e) {
            return $this->errorResponse($e->getMessage(), 'create_error', 500);
        }
    }

    public function show(WP_REST_Request $request): \WP_Error|\WP_REST_Response
    {
        try {
            $id = (int) $request->get_param('id');
            $webhook = $this->repository->find($id);

            if (!$webhook) {
                return $this->errorResponse(__('Webhook not found', 'kelune-crm'), 'not_found', 404);
            }

            return $this->successResponse($webhook->toArray());
        } catch (\Exception $e) {
            return $this->errorResponse($e->getMessage(), 'fetch_error', 500);
        }
    }

    public function update(WP_REST_Request $request): \WP_Error|\WP_REST_Response
    {
        try {
            $id = (int) $request->get_param('id');
            $data = $request->get_json_params();

            $webhook = $this->repository->find($id);

            if (!$webhook) {
                return $this->errorResponse(__('Webhook not found', 'kelune-crm'), 'not_found', 404);
            }

            $data = $this->sanitizeWritablePayload($data);

            $result = $this->repository->update($id, $data);

            if (!$result) {
                return $this->errorResponse(__('Failed to update webhook', 'kelune-crm'), 'update_error', 500);
            }

            $updated_webhook = $this->repository->find($id);

            if (!$updated_webhook) {
                return $this->errorResponse(__('Webhook not found', 'kelune-crm'), 'not_found', 404);
            }

            return $this->successResponse($updated_webhook->toArray(), __('Webhook updated successfully', 'kelune-crm'));
        } catch (\Exception $e) {
            return $this->errorResponse($e->getMessage(), 'update_error', 500);
        }
    }

    public function destroy(WP_REST_Request $request): \WP_Error|\WP_REST_Response
    {
        try {
            $id = (int) $request->get_param('id');

            $webhook = $this->repository->find($id);

            if (!$webhook) {
                return $this->errorResponse(__('Webhook not found', 'kelune-crm'), 'not_found', 404);
            }

            $result = $this->repository->delete($id);

            if (!$result) {
                return $this->errorResponse(__('Failed to delete webhook', 'kelune-crm'), 'delete_error', 500);
            }

            return $this->successResponse([], __('Webhook deleted successfully', 'kelune-crm'));
        } catch (\Exception $e) {
            return $this->errorResponse($e->getMessage(), 'delete_error', 500);
        }
    }

    public function regenerateKey(WP_REST_Request $request): \WP_Error|\WP_REST_Response
    {
        try {
            $id = (int) $request->get_param('id');

            $webhook = $this->repository->find($id);

            if (!$webhook) {
                return $this->errorResponse(__('Webhook not found', 'kelune-crm'), 'not_found', 404);
            }

            $new_key = $this->repository->regenerateKey($id);

            if (!$new_key) {
                return $this->errorResponse(__('Failed to regenerate webhook key', 'kelune-crm'), 'regenerate_error', 500);
            }

            return $this->successResponse([
                'webhook_key' => $new_key,
            ], __('Webhook key regenerated successfully', 'kelune-crm'));
        } catch (\Exception $e) {
            return $this->errorResponse($e->getMessage(), 'regenerate_error', 500);
        }
    }

    public function toggleStatus(WP_REST_Request $request): \WP_Error|\WP_REST_Response
    {
        try {
            $id = (int) $request->get_param('id');

            $webhook = $this->repository->find($id);

            if (!$webhook) {
                return $this->errorResponse(__('Webhook not found', 'kelune-crm'), 'not_found', 404);
            }

            $result = $this->repository->toggleStatus($id);

            if (!$result) {
                return $this->errorResponse(__('Failed to toggle webhook status', 'kelune-crm'), 'toggle_error', 500);
            }

            $updated_webhook = $this->repository->find($id);

            if (!$updated_webhook) {
                return $this->errorResponse(__('Webhook not found', 'kelune-crm'), 'not_found', 404);
            }

            return $this->successResponse($updated_webhook->toArray(), __('Webhook status updated successfully', 'kelune-crm'));
        } catch (\Exception $e) {
            return $this->errorResponse($e->getMessage(), 'toggle_error', 500);
        }
    }

    public function getLogs(WP_REST_Request $request): \WP_Error|\WP_REST_Response
    {
        global $wpdb;

        try {
            $id = (int) $request->get_param('id');
            $page = $request->get_param('page') ?: 1;
            $per_page = $request->get_param('per_page') ?: 20;
            $offset = ($page - 1) * $per_page;

            $webhook = $this->repository->find($id);

            if (!$webhook) {
                return $this->errorResponse(__('Webhook not found', 'kelune-crm'), 'not_found', 404);
            }

            $tableName = $wpdb->prefix . 'kelune_crm_webhook_logs';

            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API, fresh read required.
            $total = (int) $wpdb->get_var($wpdb->prepare(
                'SELECT COUNT(*) FROM %i WHERE webhook_id = %d',
                $tableName,
                $id
            ));

            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API, fresh read required.
            $logs = $wpdb->get_results($wpdb->prepare(
                'SELECT * FROM %i
                WHERE webhook_id = %d
                ORDER BY created_at DESC
                LIMIT %d OFFSET %d',
                $tableName,
                $id,
                $per_page,
                $offset
            ), ARRAY_A);

            $logs = array_map(function ($log) {
                if (!empty($log['request_headers'])) {
                    $log['request_headers'] = json_decode($log['request_headers'], true);
                }
                if (!empty($log['request_payload'])) {
                    $log['request_payload'] = json_decode($log['request_payload'], true);
                }
                if (!empty($log['response_body'])) {
                    $log['response_body'] = json_decode($log['response_body'], true);
                }
                return $log;
            }, $logs);

            return $this->successResponse([
                'data' => $logs,
                'total' => $total,
                'page' => $page,
                'per_page' => $per_page,
            ]);
        } catch (\Exception $e) {
            return $this->errorResponse($e->getMessage(), 'fetch_error', 500);
        }
    }
}
