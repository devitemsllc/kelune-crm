<?php

declare(strict_types=1);

namespace KeluneCRM\Support;

/**
 * The capability catalog.
 *
 * Every permission the CRM checks is declared once here, grouped for the
 * Roles & Permissions matrix. A capability outside this catalog is never
 * granted: the REST layer validates every incoming one against `all()`.
 */
final class Capabilities
{
    /** Required to open the CRM dashboard; every other capability needs it. */
    public const ACCESS = 'kelune_crm_access';

    public const VIEW_CONTACTS = 'kelune_crm_view_contacts';
    public const CREATE_CONTACTS = 'kelune_crm_create_contacts';
    public const EDIT_CONTACTS = 'kelune_crm_edit_contacts';
    public const DELETE_CONTACTS = 'kelune_crm_delete_contacts';
    public const IMPORT_CONTACTS = 'kelune_crm_import_contacts';
    public const EXPORT_CONTACTS = 'kelune_crm_export_contacts';

    public const VIEW_LISTS = 'kelune_crm_view_lists';
    public const CREATE_LISTS = 'kelune_crm_create_lists';
    public const EDIT_LISTS = 'kelune_crm_edit_lists';
    public const DELETE_LISTS = 'kelune_crm_delete_lists';

    public const VIEW_TAGS = 'kelune_crm_view_tags';
    public const CREATE_TAGS = 'kelune_crm_create_tags';
    public const EDIT_TAGS = 'kelune_crm_edit_tags';
    public const DELETE_TAGS = 'kelune_crm_delete_tags';

    public const VIEW_SEGMENTS = 'kelune_crm_view_segments';
    public const CREATE_SEGMENTS = 'kelune_crm_create_segments';
    public const EDIT_SEGMENTS = 'kelune_crm_edit_segments';
    public const DELETE_SEGMENTS = 'kelune_crm_delete_segments';

    public const VIEW_CAMPAIGNS = 'kelune_crm_view_campaigns';
    public const CREATE_CAMPAIGNS = 'kelune_crm_create_campaigns';
    public const EDIT_CAMPAIGNS = 'kelune_crm_edit_campaigns';
    public const DELETE_CAMPAIGNS = 'kelune_crm_delete_campaigns';
    public const SEND_CAMPAIGNS = 'kelune_crm_send_campaigns';

    public const VIEW_AUTOMATIONS = 'kelune_crm_view_automations';
    public const CREATE_AUTOMATIONS = 'kelune_crm_create_automations';
    public const EDIT_AUTOMATIONS = 'kelune_crm_edit_automations';
    public const DELETE_AUTOMATIONS = 'kelune_crm_delete_automations';

    public const VIEW_EMAIL_TEMPLATES = 'kelune_crm_view_email_templates';
    public const CREATE_EMAIL_TEMPLATES = 'kelune_crm_create_email_templates';
    public const EDIT_EMAIL_TEMPLATES = 'kelune_crm_edit_email_templates';
    public const DELETE_EMAIL_TEMPLATES = 'kelune_crm_delete_email_templates';

    public const VIEW_EMAIL_LOGS = 'kelune_crm_view_email_logs';
    public const EXPORT_EMAIL_LOGS = 'kelune_crm_export_email_logs';
    public const DELETE_EMAIL_LOGS = 'kelune_crm_delete_email_logs';

    public const VIEW_SMART_LINKS = 'kelune_crm_view_smart_links';
    public const CREATE_SMART_LINKS = 'kelune_crm_create_smart_links';
    public const EDIT_SMART_LINKS = 'kelune_crm_edit_smart_links';
    public const DELETE_SMART_LINKS = 'kelune_crm_delete_smart_links';

    public const VIEW_ANALYTICS = 'kelune_crm_view_analytics';

    public const MANAGE_SETTINGS = 'kelune_crm_manage_settings';
    public const MANAGE_CUSTOM_FIELDS = 'kelune_crm_manage_custom_fields';
    public const MANAGE_EMAIL_PROVIDERS = 'kelune_crm_manage_email_providers';
    public const MANAGE_WEBHOOKS = 'kelune_crm_manage_webhooks';
    public const MANAGE_ROLES = 'kelune_crm_manage_roles';

    /**
     * The catalog, grouped as the permission matrix renders it.
     *
     * `pro` marks a group the Pro add-on owns: the capabilities live in Free so
     * a role can be prepared before Pro is installed, and the matrix shows the
     * group either way, badged while Pro is inactive.
     *
     * @return array<int, array{key: string, label: string, pro: bool, capabilities: array<string, string>}>
     */
    public static function groups(): array
    {
        $groups = [
            [
                'key' => 'general',
                'label' => __('General', 'kelune-crm'),
                'pro' => false,
                'capabilities' => [
                    self::ACCESS => __('Access the CRM dashboard', 'kelune-crm'),
                ],
            ],
            [
                'key' => 'contacts',
                'label' => __('Contacts', 'kelune-crm'),
                'pro' => false,
                'capabilities' => [
                    self::VIEW_CONTACTS => __('View contacts', 'kelune-crm'),
                    self::CREATE_CONTACTS => __('Create contacts', 'kelune-crm'),
                    self::EDIT_CONTACTS => __('Edit contacts', 'kelune-crm'),
                    self::DELETE_CONTACTS => __('Delete contacts', 'kelune-crm'),
                    self::IMPORT_CONTACTS => __('Import contacts', 'kelune-crm'),
                    self::EXPORT_CONTACTS => __('Export contacts', 'kelune-crm'),
                ],
            ],
            [
                'key' => 'lists',
                'label' => __('Lists', 'kelune-crm'),
                'pro' => false,
                'capabilities' => [
                    self::VIEW_LISTS => __('View lists', 'kelune-crm'),
                    self::CREATE_LISTS => __('Create lists', 'kelune-crm'),
                    self::EDIT_LISTS => __('Edit lists', 'kelune-crm'),
                    self::DELETE_LISTS => __('Delete lists', 'kelune-crm'),
                ],
            ],
            [
                'key' => 'tags',
                'label' => __('Tags', 'kelune-crm'),
                'pro' => false,
                'capabilities' => [
                    self::VIEW_TAGS => __('View tags', 'kelune-crm'),
                    self::CREATE_TAGS => __('Create tags', 'kelune-crm'),
                    self::EDIT_TAGS => __('Edit tags', 'kelune-crm'),
                    self::DELETE_TAGS => __('Delete tags', 'kelune-crm'),
                ],
            ],
            [
                'key' => 'segments',
                'label' => __('Segments', 'kelune-crm'),
                'pro' => true,
                'capabilities' => [
                    self::VIEW_SEGMENTS => __('View segments', 'kelune-crm'),
                    self::CREATE_SEGMENTS => __('Create segments', 'kelune-crm'),
                    self::EDIT_SEGMENTS => __('Edit segments', 'kelune-crm'),
                    self::DELETE_SEGMENTS => __('Delete segments', 'kelune-crm'),
                ],
            ],
            [
                'key' => 'campaigns',
                'label' => __('Campaigns', 'kelune-crm'),
                'pro' => false,
                'capabilities' => [
                    self::VIEW_CAMPAIGNS => __('View campaigns', 'kelune-crm'),
                    self::CREATE_CAMPAIGNS => __('Create campaigns', 'kelune-crm'),
                    self::EDIT_CAMPAIGNS => __('Edit campaigns', 'kelune-crm'),
                    self::DELETE_CAMPAIGNS => __('Delete campaigns', 'kelune-crm'),
                    self::SEND_CAMPAIGNS => __('Send and schedule campaigns', 'kelune-crm'),
                ],
            ],
            [
                'key' => 'automations',
                'label' => __('Automations', 'kelune-crm'),
                'pro' => false,
                'capabilities' => [
                    self::VIEW_AUTOMATIONS => __('View automations', 'kelune-crm'),
                    self::CREATE_AUTOMATIONS => __('Create automations', 'kelune-crm'),
                    self::EDIT_AUTOMATIONS => __('Edit automations', 'kelune-crm'),
                    self::DELETE_AUTOMATIONS => __('Delete automations', 'kelune-crm'),
                ],
            ],
            [
                'key' => 'email_templates',
                'label' => __('Email Templates', 'kelune-crm'),
                'pro' => false,
                'capabilities' => [
                    self::VIEW_EMAIL_TEMPLATES => __('View email templates', 'kelune-crm'),
                    self::CREATE_EMAIL_TEMPLATES => __('Create email templates', 'kelune-crm'),
                    self::EDIT_EMAIL_TEMPLATES => __('Edit email templates', 'kelune-crm'),
                    self::DELETE_EMAIL_TEMPLATES => __('Delete email templates', 'kelune-crm'),
                ],
            ],
            [
                'key' => 'email_logs',
                'label' => __('Email Logs', 'kelune-crm'),
                'pro' => false,
                'capabilities' => [
                    self::VIEW_EMAIL_LOGS => __('View email logs', 'kelune-crm'),
                    self::EXPORT_EMAIL_LOGS => __('Export email logs', 'kelune-crm'),
                    self::DELETE_EMAIL_LOGS => __('Delete email logs', 'kelune-crm'),
                ],
            ],
            [
                'key' => 'smart_links',
                'label' => __('Smart Links', 'kelune-crm'),
                'pro' => true,
                'capabilities' => [
                    self::VIEW_SMART_LINKS => __('View smart links', 'kelune-crm'),
                    self::CREATE_SMART_LINKS => __('Create smart links', 'kelune-crm'),
                    self::EDIT_SMART_LINKS => __('Edit smart links', 'kelune-crm'),
                    self::DELETE_SMART_LINKS => __('Delete smart links', 'kelune-crm'),
                ],
            ],
            [
                'key' => 'analytics',
                'label' => __('Analytics', 'kelune-crm'),
                'pro' => false,
                'capabilities' => [
                    self::VIEW_ANALYTICS => __('View analytics and reports', 'kelune-crm'),
                ],
            ],
            [
                'key' => 'settings',
                'label' => __('Settings', 'kelune-crm'),
                'pro' => false,
                'capabilities' => [
                    self::MANAGE_SETTINGS => __('Manage settings', 'kelune-crm'),
                    self::MANAGE_CUSTOM_FIELDS => __('Manage custom fields', 'kelune-crm'),
                    self::MANAGE_EMAIL_PROVIDERS => __('Manage email providers', 'kelune-crm'),
                    self::MANAGE_WEBHOOKS => __('Manage incoming webhooks', 'kelune-crm'),
                    self::MANAGE_ROLES => __('Manage roles and permissions', 'kelune-crm'),
                ],
            ],
        ];

        /**
         * Filter the capability catalog.
         *
         * Add-ons append their own groups here; every capability they add
         * becomes assignable in the permission matrix and is granted to the
         * administrator on the next capability sync.
         *
         * @param array<int, array{key: string, label: string, pro: bool, capabilities: array<string, string>}> $groups
         */
        return apply_filters('kelune_crm_capability_groups', $groups);
    }

    /**
     * @return array<int, string>
     */
    public static function all(): array
    {
        $caps = [];

        foreach (self::groups() as $group) {
            foreach (array_keys($group['capabilities']) as $cap) {
                $caps[] = $cap;
            }
        }

        return array_values(array_unique($caps));
    }

    /**
     * Guards every write path so a role can never be given a capability
     * outside the CRM's own.
     */
    public static function exists(string $capability): bool
    {
        return in_array($capability, self::all(), true);
    }

    /**
     * @return array<int, string>
     */
    public static function groupCapabilities(string $key): array
    {
        foreach (self::groups() as $group) {
            if ($group['key'] === $key) {
                return array_keys($group['capabilities']);
            }
        }

        return [];
    }

    /**
     * Capabilities granted to each role the plugin installs, keyed by role slug.
     *
     * @return array<string, array<int, string>>
     */
    public static function presets(): array
    {
        $all = self::all();
        $settings = self::groupCapabilities('settings');

        $viewOnly = array_values(array_filter($all, static function (string $cap): bool {
            return str_starts_with($cap, 'kelune_crm_view_');
        }));

        $manager = array_values(array_filter($all, static function (string $cap): bool {
            return $cap !== self::MANAGE_ROLES;
        }));

        // An agent works the data day to day: read, add, edit and import, but
        // never delete, export, send, or touch site configuration.
        $agent = array_values(array_filter($all, static function (string $cap) use ($settings): bool {
            if (in_array($cap, $settings, true)) {
                return false;
            }

            return str_starts_with($cap, 'kelune_crm_view_')
                || str_starts_with($cap, 'kelune_crm_create_')
                || str_starts_with($cap, 'kelune_crm_edit_')
                || str_starts_with($cap, 'kelune_crm_import_');
        }));

        $agent[] = self::ACCESS;

        return [
            'kelune_crm_manager' => $manager,
            'kelune_crm_agent' => array_values(array_unique($agent)),
            'kelune_crm_viewer' => array_values(array_unique(array_merge([self::ACCESS], $viewOnly))),
        ];
    }
}
