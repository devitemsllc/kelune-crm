<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Services\RoleService;
use KeluneCRM\Support\Capabilities;

class RolesController extends BaseController
{
    protected string $restBase = 'roles';

    protected string $readCapability = Capabilities::MANAGE_ROLES;

    protected string $writeCapability = Capabilities::MANAGE_ROLES;

    protected string $deleteCapability = Capabilities::MANAGE_ROLES;

    private RoleService $roles;

    public function __construct()
    {
        $this->roles = new RoleService();
    }

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

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

        register_rest_route($namespace, '/' . $this->restBase . '/users', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getUsers'],
            'permission_callback' => [$this, 'checkReadPermission'],
            'args' => [
                'page' => ['sanitize_callback' => 'absint'],
                'per_page' => ['sanitize_callback' => 'absint'],
                'search' => ['sanitize_callback' => 'sanitize_text_field'],
                'role' => ['sanitize_callback' => 'sanitize_key'],
                'orderby' => ['sanitize_callback' => 'sanitize_text_field'],
                'order' => ['sanitize_callback' => 'sanitize_text_field'],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/users/(?P<id>\d+)', [
            'methods' => \WP_REST_Server::EDITABLE,
            'callback' => [$this, 'updateUserRoles'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<slug>[A-Za-z0-9_\-]+)', [
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

    public function getItems(\WP_REST_Request $request): \WP_REST_Response
    {
        return $this->successResponse([
            'roles' => $this->roles->roles(),
            'capability_groups' => Capabilities::groups(),
            'presets' => $this->roles->presets(),
            'multiple_roles_enabled' => RoleService::multipleRolesEnabled(),
            'can_assign_users' => current_user_can('promote_users'),
        ]);
    }

    public function createItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $role = $this->roles->createRole(
            $this->nameParam($request),
            $this->capabilityParam($request)
        );

        if (is_wp_error($role)) {
            return $role;
        }

        return $this->successResponse($role, __('Role created.', 'kelune-crm'), 201);
    }

    public function updateItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $name = $request->has_param('name')
            ? $this->nameParam($request)
            : null;

        $capabilities = $request->has_param('capabilities')
            ? $this->capabilityParam($request)
            : null;

        $role = $this->roles->updateRole(
            RoleService::resolveSlug((string) $request->get_param('slug')),
            $name,
            $capabilities
        );

        if (is_wp_error($role)) {
            return $role;
        }

        return $this->successResponse($role, __('Role updated.', 'kelune-crm'));
    }

    public function deleteItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $deleted = $this->roles->deleteRole(RoleService::resolveSlug((string) $request->get_param('slug')));

        if (is_wp_error($deleted)) {
            return $deleted;
        }

        return $this->successResponse([], __('Role deleted.', 'kelune-crm'));
    }

    public function getUsers(\WP_REST_Request $request): \WP_REST_Response
    {
        $result = $this->roles->users([
            'page' => absint($request->get_param('page') ?? 1),
            'per_page' => absint($request->get_param('per_page') ?? 20),
            'search' => (string) ($request->get_param('search') ?? ''),
            'role' => (string) ($request->get_param('role') ?? ''),
            'orderby' => (string) ($request->get_param('orderby') ?? ''),
            'order' => (string) ($request->get_param('order') ?? ''),
        ]);

        $response = $this->successResponse($result['items']);
        $response->header('X-WP-Total', (string) $result['total']);

        return $response;
    }

    public function updateUserRoles(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $roles = $request->get_param('roles');
        $roles = is_array($roles) ? $roles : [];

        $user = $this->roles->setUserRoles(
            absint($request->get_param('id')),
            array_map(RoleService::resolveSlug(...), $this->stringList($roles))
        );

        if (is_wp_error($user)) {
            return $user;
        }

        return $this->successResponse($user, __('User roles updated.', 'kelune-crm'));
    }

    /** A non-scalar param yields an empty name, which createRole() rejects. */
    private function nameParam(\WP_REST_Request $request): string
    {
        $name = $request->get_param('name');

        return is_scalar($name) ? sanitize_text_field((string) $name) : '';
    }

    /**
     * @return array<int, string>
     */
    private function capabilityParam(\WP_REST_Request $request): array
    {
        $capabilities = $request->get_param('capabilities');

        if (!is_array($capabilities)) {
            return [];
        }

        return array_map('sanitize_key', $this->stringList($capabilities));
    }

    /**
     * A non-scalar element becomes an empty string rather than being dropped, so
     * the length survives: setUserRoles() reads an empty list as "no role at all"
     * and must still see a submission that merely names nothing valid.
     *
     * @param array<mixed> $values
     * @return array<int, string>
     */
    private function stringList(array $values): array
    {
        return array_map(
            static fn (mixed $value): string => is_scalar($value) ? (string) $value : '',
            array_values($values)
        );
    }
}
