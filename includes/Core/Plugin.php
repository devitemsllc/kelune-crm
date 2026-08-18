<?php

declare(strict_types=1);

namespace KeluneCRM\Core;

use KeluneCRM\Admin\AdminMenu;
use KeluneCRM\Api\RestApi;
use KeluneCRM\Database\Migrator;

class Plugin
{
    private static ?\KeluneCRM\Core\Plugin $instance = null;

    private \KeluneCRM\Core\Container $container;

    private string $version;

    private function __construct()
    {
        $this->version = KELUNE_CRM_VERSION;
        $this->container = new Container();
        $this->registerServices();
        $this->init();
    }

    public static function getInstance(): self
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function registerServices(): void
    {
        $this->container->register('db', function () {
            global $wpdb;
            return $wpdb;
        });

        $this->container->register('migrator', function ($container): \KeluneCRM\Database\Migrator {
            return new Migrator($container->get('db'));
        });

        $this->container->register('admin_menu', function (): \KeluneCRM\Admin\AdminMenu {
            return new AdminMenu();
        });

        $this->container->register('rest_api', function (): \KeluneCRM\Api\RestApi {
            return new RestApi();
        });

        $this->container->register('campaign_scheduler', function (): \KeluneCRM\Services\CampaignScheduler {
            return new \KeluneCRM\Services\CampaignScheduler();
        });

        // Automation services
        $this->container->register('automation_trigger_service', function (): \KeluneCRM\Services\AutomationTriggerService {
            return new \KeluneCRM\Services\AutomationTriggerService();
        });

        // Automatic contact entry points (WordPress users, comment form).
        $this->container->register('wp_user_sync_handler', function (): \KeluneCRM\Handlers\WpUserSyncHandler {
            return new \KeluneCRM\Handlers\WpUserSyncHandler();
        });

        $this->container->register('comment_subscription_handler', function (): \KeluneCRM\Handlers\CommentSubscriptionHandler {
            return new \KeluneCRM\Handlers\CommentSubscriptionHandler();
        });

        $this->container->register('contact_status_sweeper', function (): \KeluneCRM\Handlers\ContactStatusSweeper {
            return new \KeluneCRM\Handlers\ContactStatusSweeper();
        });

        $this->container->register('cleanup_handler', function (): \KeluneCRM\Handlers\CleanupHandler {
            return new \KeluneCRM\Handlers\CleanupHandler();
        });

        $this->container->register('site_mailer', function (): \KeluneCRM\Services\SiteMailerService {
            return new \KeluneCRM\Services\SiteMailerService();
        });
    }

    private function init(): void
    {
        add_action('init', [$this, 'onInit']);
        add_action('admin_init', [$this, 'maybeMigrate']);
        add_action('admin_init', [$this, 'maybeActivationRedirect']);
        add_action('admin_menu', [$this, 'initAdminMenu']);
        add_action('admin_bar_menu', [$this, 'initAdminBar'], 100);
        add_action('rest_api_init', [$this, 'initRestApi']);
        add_action('admin_enqueue_scripts', [$this, 'enqueueAdminAssets']);
        add_action('admin_enqueue_scripts', [$this, 'enqueueMenuAssets']);
        add_action('wp_enqueue_scripts', [$this, 'enqueueMenuAssets']);

        // Register custom cron schedules
        add_filter('cron_schedules', [$this, 'addCustomCronSchedules']);

        // Single drain path for the background queues: WP-Cron, the manual
        // "Run Now", and the non-blocking loopback light endpoint all converge
        // here, serialised by a cross-process lock.
        \KeluneCRM\Services\QueueRunner::registerHooks();

        $scheduler = $this->container->get('campaign_scheduler');
        $scheduler->register();

        $trigger_service = $this->container->get('automation_trigger_service');
        $trigger_service->register();

        // Automatic contact entry points. Registered unconditionally — they run
        // on the front end (comment form) as well as in wp-admin, and each one
        // gates itself on its own setting.
        $this->container->get('wp_user_sync_handler')->register();
        $this->container->get('comment_subscription_handler')->register();

        // Cancels/parks a contact's queued email and automation work when their
        // status changes. Unconditional: an unsubscribe arrives on the front end
        // (the email link), not just from wp-admin.
        $this->container->get('contact_status_sweeper')->register();

        // Daily queue housekeeping (recovers abandoned claims, purges old
        // terminal rows).
        $this->container->get('cleanup_handler')->register();

        // Site-wide mailer: once an active default email provider exists, route
        // ALL wp_mail() (password resets, other plugins, and this plugin's own
        // Global/Custom sends) through it — the plugin acts as the
        // site's SMTP service.
        $this->container->get('site_mailer')->register();

        $this->loadModules();

        // Signal that the Free plugin has finished bootstrapping. The Pro add-on
        // hangs all of its registration (REST controllers, automation processors,
        // triggers, feature flags) on this action (release plan §3.1).
        do_action('kelune_crm_loaded', $this->container);
    }

    public function onInit(): void
    {
        $this->registerPostTypes();
        $this->initCronJobs();
    }

    /**
     * Run pending database migrations on admin load.
     *
     * The activation hook only fires on (re)activation, so bumping
     * KELUNE_CRM_DB_VERSION would otherwise never reach existing installs.
     * The Migrator no-ops when the stored version is already current.
     */
    public function maybeMigrate(): void
    {
        $this->container->get('migrator')->migrate();

        // Keep the stored plugin version current. Activation hooks do NOT fire on
        // a WordPress.org auto-update, so the option seeded at activation would go
        // stale; syncing here (admin_init) makes it track the last-run version.
        if (get_option('kelune_crm_version') !== KELUNE_CRM_VERSION) {
            update_option('kelune_crm_version', KELUNE_CRM_VERSION);
        }
    }

    /**
     * Redirect to the dashboard once, right after single-plugin activation.
     * Activator seeds the short-lived transient; consume it here on the next
     * admin request. Skipped on bulk activation (network/multi) so activating
     * several plugins at once is not hijacked.
     */
    public function maybeActivationRedirect(): void
    {
        if (!get_transient('kelune_crm_activation_redirect')) {
            return;
        }

        delete_transient('kelune_crm_activation_redirect');

        if (wp_doing_ajax() || is_network_admin()) {
            return;
        }

        // Bulk activation: let WP stay on the plugins list.
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only presence check, no state change.
        if (isset($_GET['activate-multi'])) {
            return;
        }

        if (!current_user_can('manage_options')) {
            return;
        }

        wp_safe_redirect(admin_url('admin.php?page=kelune-crm'));
        exit;
    }

    /**
     * @param array<string, mixed> $schedules
     * @return array<string, mixed>
     */
    public function addCustomCronSchedules($schedules)
    {
        // Display labels are intentionally untranslated: the cron_schedules
        // filter fires before the init hook (e.g. during activation), so calling
        // translation fns here triggers WordPress 6.7's "loaded too early" notice.
        $schedules['kelune_crm_every_minute'] = [
            'interval' => 60,
            'display' => 'Every Minute (Kelune CRM)',
        ];

        return $schedules;
    }

    public function initAdminMenu(): void
    {
        if (is_admin()) {
            $adminMenu = $this->container->get('admin_menu');
            $adminMenu->register();
        }
    }

    public function initAdminBar(\WP_Admin_Bar $wpAdminBar): void
    {
        $adminMenu = $this->container->get('admin_menu');
        $adminMenu->registerAdminBar($wpAdminBar);
    }

    public function initRestApi(): void
    {
        $restApi = $this->container->get('rest_api');
        $restApi->register();
    }

    /**
     * Enqueue the brand icon styling and the admin app wrapper reset. Runs on
     * both admin_enqueue_scripts (passes a page hook) and wp_enqueue_scripts
     * (passes nothing), hence the loose argument.
     *
     * @param mixed $hook
     */
    public function enqueueMenuAssets($hook = ''): void
    {
        $adminMenu = $this->container->get('admin_menu');
        $adminMenu->enqueueAssets(is_string($hook) ? $hook : '');
    }

    public function enqueueAdminAssets(string $hook): void
    {
        // Only load on our admin pages
        if (strpos($hook, 'kelune-crm') === false) {
            return;
        }

        // WordPress media library (wp.media) — used by the dashboard to pick
        // images/assets (e.g. the email template builder's image block).
        wp_enqueue_media();

        // Vite-built dashboard: three vendor bundles plus the app, all classic
        // scripts with fixed names. No code splitting, so nothing is fetched at
        // runtime; cache-busting is the ?ver= plugin version.
        $dist_dir = KELUNE_CRM_PLUGIN_DIR . 'assets/admin/dist';
        $dist_url = KELUNE_CRM_PLUGIN_URL . 'assets/admin/dist';

        if (file_exists($dist_dir . '/kelune-crm-admin.css')) {
            wp_enqueue_style(
                'kelune-crm-admin-app',
                $dist_url . '/kelune-crm-admin.css',
                ['wp-components'],
                $this->version
            );
        }

        // React is not bundled: every build reads WordPress' own copy from the
        // globals its UMD builds define. Declaring the handles as dependencies
        // is what guarantees they are printed first.
        $react_deps = ['react', 'react-dom', 'react-jsx-runtime'];

        // Ant Design (+ icons + dayjs), the charting stack, and the editor stack.
        // Each hangs its packages off a global the app bundle reads instead of
        // carrying its own copy. They depend only on React, never on each other;
        // the app depends on all three, which orders them ahead of it.
        $vendor_handles = [];

        foreach (['antd', 'charts', 'editors'] as $vendor) {
            $handle = 'kelune-crm-admin-' . $vendor;
            $file = '/kelune-crm-admin-' . $vendor . '.js';

            if (!file_exists($dist_dir . $file)) {
                continue;
            }

            wp_enqueue_script($handle, $dist_url . $file, $react_deps, $this->version, true);

            $vendor_handles[] = $handle;
        }

        if (file_exists($dist_dir . '/kelune-crm-admin.js')) {
            wp_enqueue_script(
                'kelune-crm-admin-app',
                $dist_url . '/kelune-crm-admin.js',
                array_merge(
                    $react_deps,
                    $vendor_handles,
                    [
                        // window.wp.i18n, which the dashboard's __() wrapper and
                        // wp_set_script_translations() below both need.
                        'wp-i18n',
                        // Core's bundled TinyMCE, which the rich-text email
                        // editor initialises itself. Core registers the handle
                        // but enqueues it only on classic-editor screens.
                        'wp-tinymce',
                    ]
                ),
                $this->version,
                true
            );

            // Load the dashboard's translations for the kelune-crm text
            // domain. WordPress serves languages/kelune-crm-<locale>-
            // kelune-crm-admin-app.json (or a md5-hashed variant) into
            // window.wp.i18n for the enqueued handle.
            wp_set_script_translations(
                'kelune-crm-admin-app',
                'kelune-crm',
                KELUNE_CRM_PLUGIN_DIR . 'languages'
            );

            // Attach the dashboard's bootstrap data to the enqueued handle. Kept
            // inside this block: localizing is meaningless without the script it
            // hangs off, so it runs only when the bundle actually enqueued.
            wp_localize_script('kelune-crm-admin-app', 'kelunecrm', [
                'api_url' => rest_url('kelune-crm/v1'),
                'nonce' => wp_create_nonce('wp_rest'),
                'admin_url' => admin_url(),
                // Plain permalinks force REST onto the ?rest_route= form, which
                // trips up external consumers of the incoming-webhook URL. The
                // setup wizard surfaces a nudge to switch to pretty permalinks.
                'permalinks_plain' => '' === get_option('permalink_structure', ''),
                'plugin_url' => KELUNE_CRM_PLUGIN_URL,
                'version' => $this->version,
                // Base for the editor's content stylesheet (the library itself
                // arrives through the wp-tinymce dependency above).
                'tinymce_base' => includes_url('js/tinymce'),
                'wp_version' => get_bloginfo('version'),
                // Active locale for the dashboard's Ant Design + dayjs locale packs.
                'locale' => get_user_locale(),
                'user' => [
                    'id' => get_current_user_id(),
                    'email' => wp_get_current_user()->user_email,
                    'name' => wp_get_current_user()->display_name,
                    'capabilities' => wp_get_current_user()->allcaps,
                    'avatar_url' => $this->getCurrentUserAvatarUrl(),
                ],
                'settings' => $this->getSettings(),
                // The global email footer, rendered for preview (business tags
                // resolved, unsubscribe → site home). The dashboard appends the
                // wrapped form to fragment previews, and swaps the builder's global
                // footer marker for the unwrapped content form, so every preview shows
                // what real recipients get.
                'email_footer_preview_html' => (new \KeluneCRM\Services\EmailService())->renderFooterForPreview(),
                'email_footer_content_preview_html' => (new \KeluneCRM\Services\EmailService())->renderFooterContentForPreview(),
                // Free/Pro state for the dashboard: whether the Pro add-on is active
                // and the per-feature flag map. React reads these to reveal Pro
                // surfaces (nav items, pages) only while Pro is active.
                'pro_active' => $this->isProActive(),
                'features' => $this->getFeatures(),
            ]);
        }
    }

    /**
     * Whether the Pro add-on is active. Defaults to false in Free; the Pro
     * plugin flips it via the `kelune_crm_pro_active` filter.
     */
    private function isProActive(): bool
    {
        return (bool) apply_filters('kelune_crm_pro_active', false);
    }

    /**
     * Per-feature flag map exposed to the dashboard. Free defaults every Pro
     * feature to false; the Pro add-on enables them via the
     * `kelune_crm_features` filter (release plan §3.4).
     *
     * @return array<string, bool>
     */
    private function getFeatures(): array
    {
        $defaults = [
            'segments' => false,
            'smart_links' => false,
            'campaign_ab_testing' => false,
            'automation_conditions' => false,
            'automation_advanced_actions' => false,
            'automation_advanced_triggers' => false,
        ];

        /**
         * Filter the dashboard feature flags.
         *
         * @param array<string, bool> $defaults Feature key => enabled.
         */
        $features = apply_filters('kelune_crm_features', $defaults);

        // Normalise to booleans so the dashboard can trust the shape.
        return array_map(static fn ($enabled): bool => (bool) $enabled, $features);
    }

    private function registerPostTypes(): void {}

    /**
     * Events this plugin once scheduled and no longer runs.
     *
     * Deleting the wp_schedule_event() call is not enough: installs that
     * activated while it existed still carry the event, and it would fire on
     * every cron spawn into a hook nothing listens on — visible to the user in
     * Site Health and cron tools as a plugin event with no callback. Worse, the
     * stale entry would block a future feature of the same name from scheduling
     * itself at the interval it actually wants, since every scheduler here is
     * guarded by wp_next_scheduled(). So they are cleared on the way past.
     *
     * When one of these features lands, it registers its own event alongside its
     * listener and drops the name from this list.
     *
     * @var list<string>
     */
    private const RETIRED_CRON_EVENTS = [
        // Campaign email is queued in campaign_emails and drained by
        // kelune_crm_process_campaign_queue (see CampaignScheduler).
        'kelune_crm_process_email_queue',
        // Segments belong to the Pro add-on, which runs its own
        // kelune_crm_refresh_segments_cron (Pro's SegmentRefreshService).
        'kelune_crm_calculate_segments',
        // No analytics report is generated on a schedule.
        'kelune_crm_weekly_analytics',
    ];

    private function initCronJobs(): void
    {
        foreach (self::RETIRED_CRON_EVENTS as $event) {
            if (wp_next_scheduled($event)) {
                wp_clear_scheduled_hook($event);
            }
        }

        // Automation processor
        if (!wp_next_scheduled('kelune_crm_process_automations')) {
            wp_schedule_event(time(), 'kelune_crm_every_minute', 'kelune_crm_process_automations');
        }

        // Daily cleanup (CleanupHandler)
        if (!wp_next_scheduled('kelune_crm_daily_cleanup')) {
            wp_schedule_event(time(), 'daily', 'kelune_crm_daily_cleanup');
        }
    }

    private function loadModules(): void
    {
        // Load core modules. The list is filterable so add-ons can register
        // additional modules; classes are resolved at runtime.
        $modules = apply_filters('kelune_crm_modules', [
            'ContactManager',
            'EmailCampaigns',
            'Automations',
            'Analytics',
        ]);

        foreach ((array) $modules as $module) {
            $class = '\\KeluneCRM\\Modules\\' . $module . '\\' . $module;
            if (class_exists($class)) {
                new $class($this->container);
            }
        }
    }

    /**
     * The logged-in user's avatar for the dashboard greeting, or null.
     *
     * Deliberately NOT gated on use_gravatar_service: that setting governs
     * disclosing *contacts'* addresses to a third party, and a WP user is not a
     * contact — it is the admin's own account, which WordPress already shows an
     * avatar for in the admin bar, profile screen and comments. Suppressing it
     * only here would make this screen inconsistent with the rest of wp-admin.
     *
     * WordPress's own show_avatars option is the right gate here. Note that
     * get_avatar_url() does NOT check it — that guard lives in get_avatar()
     * (pluggable.php) — so it has to be checked explicitly, or an admin who
     * turned avatars off site-wide would still get one on this screen.
     * get_avatar_url() is still what resolves the URL, so an avatar supplied by
     * another plugin wins over Gravatar as it does everywhere else in wp-admin.
     */
    private function getCurrentUserAvatarUrl(): ?string
    {
        if (!get_option('show_avatars')) {
            return null;
        }

        $url = get_avatar_url(get_current_user_id());

        return is_string($url) && $url !== '' ? $url : null;
    }

    /**
     * The settings blob handed to the dashboard on page load.
     *
     * This array is printed inline into the admin page HTML, so it must never
     * carry a credential even on a screen only administrators can reach. No
     * setting holds one today; a future secret setting must be stripped here
     * (and masked in SettingsController) rather than added blindly.
     *
     * @return array<string, mixed>
     */
    private function getSettings(): array
    {
        return (new \KeluneCRM\Services\SettingsService())->all();
    }

    public function getContainer(): Container
    {
        return $this->container;
    }

    public function getVersion(): string
    {
        return $this->version;
    }
}
