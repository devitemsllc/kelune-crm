<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Models\CustomField;
use KeluneCRM\Repositories\CustomFieldRepository;

class CustomFieldsController extends BaseController
{
    protected string $restBase = 'custom-fields';
    private \KeluneCRM\Repositories\CustomFieldRepository $repository;

    public function __construct()
    {
        $this->repository = new CustomFieldRepository();
    }

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

        // Collection endpoints
        register_rest_route($namespace, '/' . $this->restBase, [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'getItems'],
                'permission_callback' => [$this, 'checkReadPermission'],
            ],
            [
                'methods' => \WP_REST_Server::CREATABLE,
                'callback' => [$this, 'createItem'],
                'permission_callback' => [$this, 'checkWritePermission'],
            ],
        ]);

        // Single item endpoints
        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>[\d]+)', [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'getItem'],
                'permission_callback' => [$this, 'checkReadPermission'],
            ],
            [
                'methods' => \WP_REST_Server::EDITABLE,
                'callback' => [$this, 'updateItem'],
                'permission_callback' => [$this, 'checkWritePermission'],
            ],
            [
                'methods' => \WP_REST_Server::DELETABLE,
                'callback' => [$this, 'deleteItem'],
                'permission_callback' => [$this, 'checkDeletePermission'],
            ],
        ]);

        // Reorder endpoint
        register_rest_route($namespace, '/' . $this->restBase . '/reorder', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'reorder'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);
    }

    public function getItems(\WP_REST_Request $request): \WP_REST_Response
    {
        $params = [
            'page' => absint($request->get_param('page') ?? 1),
            'per_page' => max(1, absint($request->get_param('per_page') ?? 100)),
            'search' => sanitize_text_field((string) ($request->get_param('search') ?? '')),
            'field_type' => sanitize_text_field((string) ($request->get_param('field_type') ?? '')),
            'required' => $request->has_param('required')
                ? sanitize_text_field((string) $request->get_param('required'))
                : '',
        ];

        $fields = $this->repository->getAll($params);
        $total = $this->repository->getCount([
            'search' => $params['search'],
            'field_type' => $params['field_type'],
            'required' => $params['required'],
        ]);

        $fields_array = array_map(function ($field) {
            return $field->toArray();
        }, $fields);

        $response = $this->successResponse($fields_array);
        $response->header('X-WP-Total', (string) $total);
        $response->header('X-WP-TotalPages', (string) ceil($total / $params['per_page']));

        return $response;
    }

    public function getItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = absint($request['id']);
        $field = $this->repository->find($id);

        if (!$field) {
            return $this->errorResponse(
                __('Custom field not found', 'kelune-crm'),
                'not_found',
                404
            );
        }

        return $this->successResponse($field->toArray());
    }

    public function createItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $field_label = sanitize_text_field($request->get_param('field_label'));
        $field_key = sanitize_text_field($request->get_param('field_key'));
        $field_type = sanitize_text_field($request->get_param('field_type'));
        $field_options = $this->sanitizeFieldOptions($request->get_param('field_options'));
        $field_default = sanitize_text_field($request->get_param('field_default'));
        $field_required = $request->get_param('field_required') ? 1 : 0;
        // Only honour an explicit order; otherwise let the repository assign the
        // next order (MAX + 1). Forcing 0 here would defeat that auto-increment.
        $field_order = $request->has_param('field_order')
            ? absint($request->get_param('field_order'))
            : null;

        if (empty($field_label)) {
            return $this->errorResponse(
                __('Field label is required', 'kelune-crm'),
                'field_label_required',
                400
            );
        }

        if (empty($field_key)) {
            $field_key = CustomField::sanitizeKey($field_label);
        } else {
            $field_key = CustomField::sanitizeKey($field_key);
        }

        if ($this->repository->findByKey($field_key)) {
            return $this->errorResponse(
                __('A field with this key already exists', 'kelune-crm'),
                'field_key_exists',
                400
            );
        }

        $field_data = [
            'field_label' => $field_label,
            'field_key' => $field_key,
            'field_type' => $field_type,
            'field_options' => $field_options,
            'field_default' => $field_default,
            'field_required' => $field_required,
        ];

        // Include order only when explicitly provided so the repository's
        // MAX + 1 auto-assignment runs for the common (no-order) create path.
        if ($field_order !== null) {
            $field_data['field_order'] = $field_order;
        }

        $field = new CustomField($field_data);
        $errors = $field->validate();

        if (!empty($errors)) {
            return $this->errorResponse(
                implode(', ', $errors),
                'validation_failed',
                400
            );
        }

        $id = $this->repository->create($field_data);

        if (!$id) {
            return $this->errorResponse(
                __('Failed to create custom field', 'kelune-crm'),
                'create_failed',
                500
            );
        }

        $created_field = $this->repository->find($id);

        if (!$created_field) {
            return $this->errorResponse(
                __('Custom field not found', 'kelune-crm'),
                'not_found',
                404
            );
        }

        return $this->successResponse($created_field->toArray());
    }

    public function updateItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = absint($request['id']);
        $field = $this->repository->find($id);

        if (!$field) {
            return $this->errorResponse(
                __('Custom field not found', 'kelune-crm'),
                'not_found',
                404
            );
        }

        $update_data = [];

        if ($request->has_param('field_label')) {
            $update_data['field_label'] = sanitize_text_field($request->get_param('field_label'));
        }

        if ($request->has_param('field_key')) {
            $update_data['field_key'] = CustomField::sanitizeKey($request->get_param('field_key'));
        }

        if ($request->has_param('field_type')) {
            $update_data['field_type'] = sanitize_text_field($request->get_param('field_type'));
        }

        if ($request->has_param('field_options')) {
            $update_data['field_options'] = $this->sanitizeFieldOptions($request->get_param('field_options'));
        }

        if ($request->has_param('field_default')) {
            $update_data['field_default'] = sanitize_text_field($request->get_param('field_default'));
        }

        if ($request->has_param('field_required')) {
            $update_data['field_required'] = $request->get_param('field_required') ? 1 : 0;
        }

        if ($request->has_param('field_order')) {
            $update_data['field_order'] = absint($request->get_param('field_order'));
        }

        if (!empty($update_data['field_key']) && $update_data['field_key'] !== $field->field_key) {
            if ($this->repository->findByKey($update_data['field_key'])) {
                return $this->errorResponse(
                    __('A field with this key already exists', 'kelune-crm'),
                    'field_key_exists',
                    400
                );
            }
        }

        $updated = $this->repository->update($id, $update_data);

        if (!$updated) {
            return $this->errorResponse(
                __('Failed to update custom field', 'kelune-crm'),
                'update_failed',
                500
            );
        }

        $updated_field = $this->repository->find($id);

        if (!$updated_field) {
            return $this->errorResponse(
                __('Custom field not found', 'kelune-crm'),
                'not_found',
                404
            );
        }

        return $this->successResponse($updated_field->toArray());
    }

    public function deleteItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = absint($request['id']);
        $field = $this->repository->find($id);

        if (!$field) {
            return $this->errorResponse(
                __('Custom field not found', 'kelune-crm'),
                'not_found',
                404
            );
        }

        $deleted = $this->repository->delete($id);

        if (!$deleted) {
            return $this->errorResponse(
                __('Failed to delete custom field', 'kelune-crm'),
                'delete_failed',
                500
            );
        }

        return $this->successResponse([
            'deleted' => true,
            'id' => $id,
        ]);
    }

    public function reorder(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $orders = $request->get_param('orders');

        if (empty($orders) || !is_array($orders)) {
            return $this->errorResponse(
                __('Orders array is required', 'kelune-crm'),
                'orders_required',
                400
            );
        }

        foreach ($orders as $order) {
            if (!isset($order['id']) || !isset($order['field_order'])) {
                return $this->errorResponse(
                    __('Each order must have id and field_order', 'kelune-crm'),
                    'invalid_order_structure',
                    400
                );
            }
        }

        $result = $this->repository->reorder($orders);

        if (!$result) {
            return $this->errorResponse(
                __('Failed to reorder custom fields', 'kelune-crm'),
                'reorder_failed',
                500
            );
        }

        return $this->successResponse([], __('Custom fields reordered successfully', 'kelune-crm'));
    }

    /**
     * Sanitize a custom field's options blob before storage. Every key and
     * string leaf is reduced to plain text, recursively (the shape may nest) —
     * stored-XSS hardening for values later rendered in admin and public forms.
     *
     * @param mixed $options
     * @return array<int|string, mixed>|null
     */
    private function sanitizeFieldOptions($options): ?array
    {
        if (!is_array($options)) {
            return null;
        }

        $clean = [];

        foreach ($options as $key => $value) {
            $safe_key = is_int($key) ? $key : sanitize_key((string) $key);

            if (is_array($value)) {
                $clean[$safe_key] = $this->sanitizeFieldOptions($value);
            } elseif (is_string($value)) {
                $clean[$safe_key] = sanitize_text_field($value);
            } elseif (is_scalar($value) || $value === null) {
                $clean[$safe_key] = $value;
            }
        }

        return $clean;
    }
}
