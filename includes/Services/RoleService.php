<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Support\Capabilities;

/**
 * Roles and permissions.
 *
 * CRM permissions are plain WordPress capabilities held by plain WordPress
 * roles, so `current_user_can()` answers every check and a user carrying
 * several roles gets the union of their capabilities for free.
 */
class RoleService
{
    /**
     * Capabilities already known to the site, so a sync hands out only the
     * *new* ones and never resurrects one an administrator removed.
     */
    private const KNOWN_CAPS_OPTION = 'kelune_crm_known_capabilities';

    /** Prefix identifying a role this plugin owns. */
    private const ROLE_PREFIX = 'kelune_crm_';

    /**
     * @return array<string, string>
     */
    public static function builtInRoles(): array
    {
        return [
            'kelune_crm_manager' => __('CRM Manager', 'kelune-crm'),
            'kelune_crm_agent' => __('CRM Agent', 'kelune-crm'),
            'kelune_crm_viewer' => __('CRM Viewer', 'kelune-crm'),
        ];
    }

    public static function isBuiltInRole(string $slug): bool
    {
        return array_key_exists($slug, self::builtInRoles());
    }

    public static function isCrmRole(string $slug): bool
    {
        return str_starts_with($slug, self::ROLE_PREFIX);
    }

    /**
     * Safe to call repeatedly — an existing role keeps the capabilities it has.
     */
    public function install(): void
    {
        $presets = Capabilities::presets();

        foreach (self::builtInRoles() as $slug => $name) {
            if (get_role($slug) !== null) {
                continue;
            }

            $caps = ['read' => true];
            foreach ($presets[$slug] ?? [] as $cap) {
                $caps[$cap] = true;
            }

            add_role($slug, $name, $caps);
        }

        $this->grantToAdministrators(Capabilities::all());
        update_option(self::KNOWN_CAPS_OPTION, Capabilities::all());
    }

    /**
     * Reconcile the site with the current capability catalog. Runs on every
     * admin load: it is how an update, or an add-on appending capabilities
     * through `kelune_crm_capability_groups`, reaches roles created before
     * those capabilities existed.
     */
    public function sync(): void
    {
        $known = get_option(self::KNOWN_CAPS_OPTION, null);

        if (!is_array($known)) {
            $this->install();

            return;
        }

        $current = Capabilities::all();
        $added = array_values(array_diff($current, $known));

        if ($added === []) {
            return;
        }

        $this->grantToAdministrators($added);

        $presets = Capabilities::presets();
        foreach (self::builtInRoles() as $slug => $name) {
            $role = get_role($slug);
            if ($role === null) {
                continue;
            }

            foreach (array_intersect($added, $presets[$slug] ?? []) as $cap) {
                $role->add_cap($cap);
            }
        }

        update_option(self::KNOWN_CAPS_OPTION, $current);
    }

    /**
     * @param array<int, string> $capabilities
     */
    private function grantToAdministrators(array $capabilities): void
    {
        $roles = wp_roles();

        foreach (array_keys($roles->roles) as $slug) {
            $role = get_role((string) $slug);

            // Any role that can administer the site owns the CRM outright —
            // on multisite that is more than just `administrator`.
            if ($role === null || empty($role->capabilities['manage_options'])) {
                continue;
            }

            foreach ($capabilities as $cap) {
                $role->add_cap($cap);
            }
        }
    }

    /**
     * The shipped capability sets, offered in the role editor as a starting point.
     *
     * @return array<int, array{slug: string, name: string, capabilities: array<int, string>}>
     */
    public function presets(): array
    {
        $presets = Capabilities::presets();
        $result = [];

        foreach (self::builtInRoles() as $slug => $name) {
            if (!isset($presets[$slug])) {
                continue;
            }

            $result[] = [
                'slug' => $slug,
                'name' => $name,
                'capabilities' => array_values($presets[$slug]),
            ];
        }

        return $result;
    }

    /**
     * Every role on the site, annotated with the CRM capabilities it holds.
     *
     * @return array<int, array<string, mixed>>
     */
    public function roles(): array
    {
        $catalog = Capabilities::all();
        $counts = $this->userCountsByRole();
        $result = [];

        foreach (wp_roles()->roles as $slug => $role) {
            $slug = (string) $slug;
            $caps = is_array($role['capabilities'] ?? null) ? $role['capabilities'] : [];

            $granted = [];
            foreach ($catalog as $cap) {
                if (!empty($caps[$cap])) {
                    $granted[] = $cap;
                }
            }

            $isAdmin = !empty($caps['manage_options']);

            $result[] = [
                'slug' => $slug,
                'name' => translate_user_role((string) ($role['name'] ?? $slug)),
                'is_crm_role' => self::isCrmRole($slug),
                'is_built_in' => self::isBuiltInRole($slug),
                // A site administrator always holds every capability, so the
                // matrix shows the row as locked rather than editable.
                'is_administrator' => $isAdmin,
                'capabilities' => $isAdmin ? $catalog : $granted,
                'users_count' => $counts[$slug] ?? 0,
            ];
        }

        return $result;
    }

    /**
     * @return array<string, int>
     */
    private function userCountsByRole(): array
    {
        $counts = count_users();

        return array_map('intval', $counts['avail_roles']);
    }

    /**
     * @param array<int, string> $capabilities
     * @return array<string, mixed>|\WP_Error
     */
    public function createRole(string $name, array $capabilities): array|\WP_Error
    {
        $name = trim($name);

        if ($name === '') {
            return new \WP_Error('kelune_crm_role_name', __('Role name is required.', 'kelune-crm'), ['status' => 400]);
        }

        $slug = $this->uniqueSlug($name);

        $caps = ['read' => true];
        foreach ($this->filterCapabilities($capabilities) as $cap) {
            $caps[$cap] = true;
        }

        if (add_role($slug, $name, $caps) === null) {
            return new \WP_Error('kelune_crm_role_exists', __('That role could not be created.', 'kelune-crm'), ['status' => 400]);
        }

        return $this->findRole($slug) ?? [];
    }

    /**
     * Rename a role and/or replace the CRM capabilities it holds. Capabilities
     * outside the catalog (WordPress core's, another plugin's) are untouched.
     *
     * @param array<int, string>|null $capabilities
     * @return array<string, mixed>|\WP_Error
     */
    public function updateRole(string $slug, ?string $name, ?array $capabilities): array|\WP_Error
    {
        $role = get_role($slug);

        if ($role === null) {
            return new \WP_Error('kelune_crm_role_missing', __('Role not found.', 'kelune-crm'), ['status' => 404]);
        }

        if (!empty($role->capabilities['manage_options'])) {
            return new \WP_Error(
                'kelune_crm_role_locked',
                __('Administrator permissions cannot be changed.', 'kelune-crm'),
                ['status' => 403]
            );
        }

        if ($capabilities !== null) {
            $granted = $this->filterCapabilities($capabilities);

            foreach (Capabilities::all() as $cap) {
                if (in_array($cap, $granted, true)) {
                    $role->add_cap($cap);
                } else {
                    $role->remove_cap($cap);
                }
            }

            // A role with CRM capabilities but no `read` cannot reach wp-admin,
            // where the dashboard lives.
            if ($granted !== [] && empty($role->capabilities['read'])) {
                $role->add_cap('read');
            }
        }

        $name = $name === null ? null : trim($name);

        if ($name !== null && $name !== '' && self::isCrmRole($slug) && !self::isBuiltInRole($slug)) {
            $this->renameRole($slug, $name);
        }

        return $this->findRole($slug) ?? [];
    }

    /**
     * @return true|\WP_Error
     */
    public function deleteRole(string $slug): bool|\WP_Error
    {
        if (!self::isCrmRole($slug) || self::isBuiltInRole($slug)) {
            return new \WP_Error(
                'kelune_crm_role_undeletable',
                __('Only custom CRM roles can be deleted.', 'kelune-crm'),
                ['status' => 403]
            );
        }

        if (get_role($slug) === null) {
            return new \WP_Error('kelune_crm_role_missing', __('Role not found.', 'kelune-crm'), ['status' => 404]);
        }

        // Strip the role from its holders first, or they keep a dangling role
        // slug that no longer resolves to any capabilities.
        foreach (get_users(['role' => $slug, 'fields' => 'ID']) as $userId) {
            $user = get_user_by('id', (int) $userId);
            if ($user instanceof \WP_User) {
                $user->remove_role($slug);
            }
        }

        remove_role($slug);

        return true;
    }

    /**
     * A page of site users, annotated with the CRM capabilities each holds,
     * narrowed by the search term and role filter when they are given.
     *
     * @param array<string, mixed> $args
     * @return array{items: array<int, array<string, mixed>>, total: int}
     */
    public function users(array $args = []): array
    {
        $page = max(1, (int) ($args['page'] ?? 1));
        $perPage = min(100, max(1, (int) ($args['per_page'] ?? 20)));
        $search = trim((string) ($args['search'] ?? ''));
        $role = (string) ($args['role'] ?? '');

        // Whitelisted, so an arbitrary column can never reach the ORDER BY.
        $sortable = ['display_name', 'user_login', 'user_email', 'user_registered', 'ID'];
        $orderby = (string) ($args['orderby'] ?? 'display_name');
        $orderby = in_array($orderby, $sortable, true) ? $orderby : 'display_name';
        $order = strtoupper((string) ($args['order'] ?? 'ASC')) === 'DESC' ? 'DESC' : 'ASC';

        $query = [
            'number' => $perPage,
            'paged' => $page,
            'orderby' => $orderby,
            'order' => $order,
        ];

        if ($search !== '') {
            $query['search'] = '*' . $search . '*';
            $query['search_columns'] = ['user_login', 'user_email', 'display_name', 'user_nicename'];
        }

        if ($role !== '') {
            $query['role'] = $role;
        }

        $userQuery = new \WP_User_Query($query);
        $items = [];

        /** @var \WP_User $user */
        foreach ($userQuery->get_results() as $user) {
            $items[] = $this->prepareUser($user);
        }

        return [
            'items' => $items,
            'total' => (int) $userQuery->get_total(),
        ];
    }

    /**
     * Replace a user's roles. With multiple roles disabled only the first role
     * survives, which is what the WordPress user editor itself allows.
     *
     * @param array<int, string> $roles
     * @return array<string, mixed>|\WP_Error
     */
    public function setUserRoles(int $userId, array $roles): array|\WP_Error
    {
        $user = get_user_by('id', $userId);

        if (!$user instanceof \WP_User) {
            return new \WP_Error('kelune_crm_user_missing', __('User not found.', 'kelune-crm'), ['status' => 404]);
        }

        if (!current_user_can('promote_users') || !current_user_can('edit_user', $userId)) {
            return new \WP_Error(
                'kelune_crm_user_forbidden',
                __('You are not allowed to change this user\'s roles.', 'kelune-crm'),
                ['status' => 403]
            );
        }

        $editable = array_keys(self::editableRoles());
        $requested = array_values(array_filter(
            array_map(self::resolveSlug(...), $roles),
            static fn (string $slug): bool => in_array($slug, $editable, true)
        ));

        // An empty request means "no role at all" and is valid; a request
        // naming only roles that do not exist is not.
        if ($roles !== [] && $requested === []) {
            return new \WP_Error(
                'kelune_crm_role_invalid',
                __('None of those roles exist.', 'kelune-crm'),
                ['status' => 400]
            );
        }

        if (!self::multipleRolesEnabled()) {
            $requested = array_slice($requested, 0, 1);
        }

        // A role editor must not be able to lock you out of your own site.
        if ($userId === get_current_user_id() && in_array('administrator', $user->roles, true) && !in_array('administrator', $requested, true)) {
            return new \WP_Error(
                'kelune_crm_self_demote',
                __('You cannot remove your own administrator role.', 'kelune-crm'),
                ['status' => 403]
            );
        }

        $existing = array_intersect($user->roles, $editable);

        foreach (array_diff($existing, $requested) as $slug) {
            $user->remove_role($slug);
        }

        foreach (array_diff($requested, $existing) as $slug) {
            $user->add_role($slug);
        }

        $refreshed = get_user_by('id', $userId);

        return $refreshed instanceof \WP_User ? $this->prepareUser($refreshed) : [];
    }

    /**
     * A role slug is not required to be lowercase, so another plugin may
     * register one `sanitize_key()` would alter: match the raw value first to
     * keep such a role editable. Returns a registered slug or the sanitized
     * input, never anything arbitrary.
     */
    public static function resolveSlug(string $slug): string
    {
        if (isset(wp_roles()->roles[$slug])) {
            return $slug;
        }

        return sanitize_key($slug);
    }

    /**
     * The roles the current user may hand out.
     *
     * `get_editable_roles()` lives in wp-admin/includes/user.php, which is not
     * loaded on a REST request, so pull the file in before calling it.
     *
     * @return array<string, array<string, mixed>>
     */
    public static function editableRoles(): array
    {
        if (!function_exists('get_editable_roles')) {
            require_once ABSPATH . 'wp-admin/includes/user.php';
        }

        return get_editable_roles();
    }

    public static function multipleRolesEnabled(): bool
    {
        return (bool) (new SettingsService())->get('multiple_user_roles_enabled', false);
    }

    /**
     * @return array<string, mixed>
     */
    private function prepareUser(\WP_User $user): array
    {
        $catalog = Capabilities::all();
        $granted = [];

        foreach ($catalog as $cap) {
            if (user_can($user, $cap)) {
                $granted[] = $cap;
            }
        }

        return [
            'id' => $user->ID,
            'name' => $user->display_name,
            'username' => $user->user_login,
            'email' => $user->user_email,
            // WordPress stores this in UTC, which is what the dashboard expects.
            'registered' => $user->user_registered,
            'avatar_url' => get_avatar_url($user->ID),
            'roles' => array_values($user->roles),
            'is_administrator' => user_can($user, 'manage_options'),
            'crm_capabilities' => $granted,
            'editable' => current_user_can('edit_user', $user->ID),
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private function findRole(string $slug): ?array
    {
        foreach ($this->roles() as $role) {
            if ($role['slug'] === $slug) {
                return $role;
            }
        }

        return null;
    }

    /**
     * Keep only capabilities the catalog declares — the UI never offers others,
     * and accepting one would let a role grant itself powers outside the CRM.
     *
     * @param array<int, string> $capabilities
     * @return array<int, string>
     */
    private function filterCapabilities(array $capabilities): array
    {
        $clean = array_map('sanitize_key', $capabilities);

        return array_values(array_unique(array_filter(
            $clean,
            static fn (string $cap): bool => Capabilities::exists($cap)
        )));
    }

    /**
     * `sanitize_title()` percent-encodes what it cannot romanise, so a name in
     * a non-Latin script yields escapes: they are dropped here, and a name that
     * leaves nothing behind gets a generic key — the display name carries the
     * meaning either way.
     */
    private function uniqueSlug(string $name): string
    {
        $stem = preg_replace('/%[0-9a-f]{2}/i', '', sanitize_title($name)) ?? '';
        $stem = trim(sanitize_key(str_replace('-', '_', $stem)), '_');
        $base = substr(self::ROLE_PREFIX . ($stem === '' ? 'role' : $stem), 0, 60);
        $slug = $base;
        $suffix = 2;

        while (get_role($slug) !== null) {
            $slug = $base . '_' . $suffix++;
        }

        return $slug;
    }

    /**
     * WordPress has no rename API, so the display name is written back into the
     * roles option directly through WP_Roles.
     */
    private function renameRole(string $slug, string $name): void
    {
        $roles = wp_roles();

        if (!isset($roles->roles[$slug])) {
            return;
        }

        $roles->roles[$slug]['name'] = $name;
        $roles->role_names[$slug] = $name;

        update_option($roles->role_key, $roles->roles);
    }
}
