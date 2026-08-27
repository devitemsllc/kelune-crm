<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Repositories\ListRepository;

class ListsController extends BaseController
{
    protected string $restBase = 'lists';
    private \KeluneCRM\Repositories\ListRepository $repository;

    public function __construct()
    {
        $this->repository = new ListRepository();
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
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function getItems(\WP_REST_Request $request)
    {
        $params = [
            'page' => absint($request->get_param('page') ?: 1),
            'per_page' => absint($request->get_param('per_page') ?: 100),
            'search' => sanitize_text_field((string) ($request->get_param('search') ?? '')),
            'status' => sanitize_text_field((string) ($request->get_param('status') ?? '')),
            'type' => sanitize_text_field((string) ($request->get_param('type') ?? '')),
            'orderby' => sanitize_key((string) ($request->get_param('orderby') ?? 'name')),
            'order' => sanitize_text_field((string) ($request->get_param('order') ?? 'ASC')),
        ];

        $lists = $this->repository->getAll($params);
        $total = $this->repository->getCount($params);

        $items = [];
        foreach ($lists as $list) {
            $data = $list->toArray();
            $data['contact_count'] = (int) $this->repository->getContactCount((int) $list->id);
            $items[] = $data;
        }

        $response = $this->successResponse($items);
        $response->header('X-WP-Total', (string) $total);

        return $response;
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function getItem(\WP_REST_Request $request)
    {
        $id = absint($request['id']);
        $list = $this->repository->find($id);

        if (!$list) {
            return $this->errorResponse(__('List not found', 'kelune-crm'), 'not_found', 404);
        }

        $data = $list->toArray();
        $data['contact_count'] = (int) $this->repository->getContactCount($id);

        return $this->successResponse($data);
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function createItem(\WP_REST_Request $request)
    {
        $name = sanitize_text_field($request->get_param('name'));
        $description = sanitize_textarea_field($request->get_param('description'));

        if (empty($name)) {
            return $this->errorResponse(__('List name is required', 'kelune-crm'), 'name_required');
        }

        if ($this->repository->findByName($name)) {
            return $this->errorResponse(__('List already exists', 'kelune-crm'), 'list_exists');
        }

        $id = $this->repository->create([
            'name' => $name,
            'description' => $description,
        ]);

        if (!$id) {
            return $this->errorResponse(__('Failed to create list', 'kelune-crm'), 'create_failed', 500);
        }

        $list = $this->repository->find($id);
        $data = $list ? $list->toArray() : [];
        $data['contact_count'] = 0;

        return $this->successResponse($data);
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function updateItem(\WP_REST_Request $request)
    {
        $id = absint($request['id']);
        $list = $this->repository->find($id);

        if (!$list) {
            return $this->errorResponse(__('List not found', 'kelune-crm'), 'not_found', 404);
        }

        // Only the fields the request carried are written; an omitted field
        // keeps its stored value.
        $data = [];

        if ($request->has_param('name')) {
            $name = sanitize_text_field((string) $request->get_param('name'));

            if ('' === $name) {
                return $this->errorResponse(__('List name is required', 'kelune-crm'), 'name_required');
            }

            $data['name'] = $name;
        }

        if ($request->has_param('description')) {
            $data['description'] = sanitize_textarea_field((string) $request->get_param('description'));
        }

        if ([] !== $data && !$this->repository->update($id, $data)) {
            return $this->errorResponse(__('Failed to update list', 'kelune-crm'), 'update_failed', 500);
        }

        $list = $this->repository->find($id);
        $data = $list ? $list->toArray() : [];
        $data['contact_count'] = (int) $this->repository->getContactCount($id);

        return $this->successResponse($data);
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function deleteItem(\WP_REST_Request $request)
    {
        $id = absint($request['id']);
        $list = $this->repository->find($id);

        if (!$list) {
            return $this->errorResponse(__('List not found', 'kelune-crm'), 'not_found', 404);
        }

        $deleted = $this->repository->delete($id);

        if (!$deleted) {
            return $this->errorResponse(__('Failed to delete list', 'kelune-crm'), 'delete_failed', 500);
        }

        return $this->successResponse(['deleted' => true, 'id' => $id]);
    }
}
