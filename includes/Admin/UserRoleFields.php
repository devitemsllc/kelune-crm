<?php

declare(strict_types=1);

namespace KeluneCRM\Admin;

use KeluneCRM\Services\RoleService;

/**
 * Multiple roles per user on the WordPress user screens.
 *
 * WordPress stores several roles per user perfectly well but only ever offers
 * one in its editor, so the single-role dropdown is replaced by a checkbox
 * list. With the setting off nothing here registers.
 */
class UserRoleFields
{
    private const NONCE_ACTION = 'kelune_crm_user_roles';

    private const NONCE_NAME = 'kelune_crm_user_roles_nonce';

    private const FIELD_NAME = 'kelune_crm_user_roles';

    public function register(): void
    {
        // Deferred to `init`: reading the setting translates the settings
        // defaults, and translating earlier trips WordPress'
        // "textdomain loaded too early" notice.
        add_action('init', [$this, 'registerFields']);
    }

    public function registerFields(): void
    {
        if (!RoleService::multipleRolesEnabled()) {
            return;
        }

        add_action('user_new_form', [$this, 'renderNewUserField']);
        add_action('show_user_profile', [$this, 'renderProfileField']);
        add_action('edit_user_profile', [$this, 'renderProfileField']);
        add_action('user_register', [$this, 'saveNewUser'], 5);
        add_action('profile_update', [$this, 'saveProfile'], 10, 2);
    }

    /**
     * Add New User: pre-check whatever role the (hidden) dropdown would have
     * defaulted to, so submitting without touching the list behaves as before.
     */
    public function renderNewUserField(): void
    {
        if (!current_user_can('promote_users')) {
            return;
        }

        // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Read-only renderer gated by promote_users; $_POST is read only to preselect a checkbox on a re-displayed form.
        $role = isset($_POST['role']) ? wp_unslash($_POST['role']) : '';
        $posted = is_scalar($role) ? RoleService::resolveSlug((string) $role) : '';
        $selected = $posted !== '' ? [$posted] : [(string) get_option('default_role')];

        $this->renderCheckboxes($selected, __('User Roles', 'kelune-crm'), false);
    }

    public function renderProfileField(\WP_User $user): void
    {
        if (!current_user_can('promote_users') || !current_user_can('edit_user', $user->ID)) {
            return;
        }

        $selected = array_values(array_intersect($user->roles, array_keys(RoleService::editableRoles())));

        $this->renderCheckboxes($selected, __('User Roles', 'kelune-crm'), true);
    }

    public function saveNewUser(int $userId): void
    {
        $roles = $this->submittedRoles();

        if ($roles === null) {
            return;
        }

        $user = get_user_by('id', $userId);

        if ($user instanceof \WP_User) {
            $this->applyRoles($user, $roles);
        }
    }

    /** @param \WP_User $oldUser Unused; part of the `profile_update` signature. */
    public function saveProfile(int $userId, $oldUser): void
    {
        if (!current_user_can('edit_user', $userId)) {
            return;
        }

        $roles = $this->submittedRoles();

        if ($roles === null) {
            return;
        }

        $user = get_user_by('id', $userId);

        if ($user instanceof \WP_User) {
            $this->applyRoles($user, $roles);
        }
    }

    /**
     * The submitted role slugs, or null when this request is not one of ours
     * (no nonce, or the current user may not promote users).
     *
     * @return array<int, string>|null
     */
    private function submittedRoles(): ?array
    {
        if (!current_user_can('promote_users')) {
            return null;
        }

        $nonce = isset($_POST[self::NONCE_NAME])
            ? sanitize_text_field(wp_unslash($_POST[self::NONCE_NAME]))
            : '';

        if ($nonce === '' || !wp_verify_nonce($nonce, self::NONCE_ACTION)) {
            return null;
        }

        $submitted = isset($_POST[self::FIELD_NAME]) && is_array($_POST[self::FIELD_NAME])
            // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- Each element is normalised by RoleService::resolveSlug() below, which returns a registered role slug or a sanitize_key()'d value.
            ? array_map(RoleService::resolveSlug(...), self::stringList(wp_unslash($_POST[self::FIELD_NAME])))
            : [];

        $editable = array_keys(RoleService::editableRoles());

        return array_values(array_filter(
            $submitted,
            static fn (string $slug): bool => in_array($slug, $editable, true)
        ));
    }

    /**
     * A non-scalar element becomes an empty string, which matches no editable role
     * and is dropped by the caller.
     *
     * @param array<mixed> $values
     * @return array<int, string>
     */
    private static function stringList(array $values): array
    {
        return array_map(
            static fn (mixed $value): string => is_scalar($value) ? (string) $value : '',
            array_values($values)
        );
    }

    /**
     * @param array<int, string> $roles
     */
    private function applyRoles(\WP_User $user, array $roles): void
    {
        $editable = array_keys(RoleService::editableRoles());
        $existing = array_values(array_intersect($user->roles, $editable));

        // An administrator editing their own profile keeps that role whatever
        // the checkboxes say, or the site has no way back in.
        if ($user->ID === get_current_user_id() && in_array('administrator', $existing, true)) {
            $roles[] = 'administrator';
            $roles = array_values(array_unique($roles));
        }

        foreach (array_diff($existing, $roles) as $slug) {
            $user->remove_role($slug);
        }

        foreach (array_diff($roles, $existing) as $slug) {
            $user->add_role($slug);
        }
    }

    /**
     * @param array<int, string> $selected
     */
    private function renderCheckboxes(array $selected, string $label, bool $withHeading): void
    {
        $roles = RoleService::editableRoles();

        wp_nonce_field(self::NONCE_ACTION, self::NONCE_NAME);

        if ($withHeading) {
            echo '<h2>' . esc_html__('Kelune CRM Roles', 'kelune-crm') . '</h2>';
        }

        echo '<table class="form-table" role="presentation"><tr>';
        echo '<th>' . esc_html($label) . '</th><td>';
        echo '<fieldset class="kelune-crm-user-roles"><legend class="screen-reader-text">' . esc_html($label) . '</legend>';

        foreach ($roles as $slug => $role) {
            $slug = (string) $slug;
            $name = translate_user_role((string) ($role['name'] ?? $slug));

            printf(
                '<label style="display:block;margin-bottom:4px;"><input type="checkbox" name="%1$s[]" value="%2$s"%3$s> %4$s</label>',
                esc_attr(self::FIELD_NAME),
                esc_attr($slug),
                checked(in_array($slug, $selected, true), true, false),
                esc_html($name)
            );
        }

        echo '</fieldset>';
        echo '<p class="description">' . esc_html__('A user keeps the combined permissions of every role selected here.', 'kelune-crm') . '</p>';
        echo '</td></tr></table>';

        $this->hideCoreRoleField();
    }

    /**
     * Drop WordPress' own single-role control from the form — left in place it
     * would overwrite the checkbox selection on save.
     */
    private function hideCoreRoleField(): void
    {
        add_action('admin_footer', static function (): void {
            wp_print_inline_script_tag(
                "document.addEventListener('DOMContentLoaded',function(){"
                . "document.querySelectorAll('.user-role-wrap').forEach(function(el){el.remove();});"
                . "var sel=document.getElementById('role');"
                . "if(sel){var row=sel.closest('tr');if(row){row.remove();}}"
                . '});'
            );
        });
    }
}
