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
        // Admin-menu / admin-bar divider styling. The admin bar (and its
        // styling) also renders on the front end, so hook both contexts.
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

        // With an active default provider, route ALL wp_mail() through it —
        // password resets, other plugins, and this plugin's Global/Custom sends.
        $this->container->get('site_mailer')->register();

        $this->loadModules();

        // Free has finished bootstrapping. The Pro add-on hangs all of its
        // registration (REST controllers, processors, triggers, flags) on this.
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
     * The activation hook fires only on (re)activation, so a bumped
     * KELUNE_CRM_DB_VERSION would never reach existing installs. The Migrator
     * no-ops when the stored version is current.
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
     * Redirect to the dashboard once after single-plugin activation, consuming
     * the transient Activator seeds. Skipped on bulk activation so activating
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
     * Enqueue the admin-menu / admin-bar divider styling. Runs on both
     * admin_enqueue_scripts (passes a page hook) and wp_enqueue_scripts
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

        // React app bundle. Entry filenames are content-hashed and named in
        // manifest.php; async chunks (js/, css/) load at runtime.
        $dist_url = KELUNE_CRM_PLUGIN_URL . 'assets/apps/dashboard';

        $manifest = $this->dashboardManifest();
        $main_js  = $manifest['js'];
        $main_css = $manifest['css'];

        if ('' !== $main_css) {
            wp_enqueue_style(
                'kelune-crm-dashboard',
                $dist_url . '/' . $main_css,
                ['wp-components'],
                $this->version
            );
        }

        if ('' !== $main_js) {
            wp_enqueue_script(
                'kelune-crm-dashboard',
                $dist_url . '/' . $main_js,
                [
                    // Core registers wp-tinymce but enqueues it only on
                    // classic-editor screens; the email editor needs it here.
                    'wp-tinymce',
                    // wp-i18n exposes window.wp.i18n for the dashboard's __() wrapper.
                    'wp-i18n',
                ],
                $this->version,
                true
            );

            // WordPress feeds languages/kelune-crm-<locale>-
            // kelune-crm-dashboard.json (or its md5 variant) into
            // window.wp.i18n for this handle.
            wp_set_script_translations(
                'kelune-crm-dashboard',
                'kelune-crm',
                KELUNE_CRM_PLUGIN_DIR . 'languages'
            );

            // The bundle is an ES module: WordPress builds and prints the tag,
            // we only add type="module" to the attributes it assembles.
            add_filter('wp_script_attributes', static function (array $attributes): array {
                if (($attributes['id'] ?? '') === 'kelune-crm-dashboard-js') {
                    $attributes['type'] = 'module';
                }

                return $attributes;
            });

            // Attach the dashboard's bootstrap data to the enqueued handle. Kept
            // inside this block: localizing is meaningless without the script it
            // hangs off, so it runs only when the bundle actually enqueued.
            // Add-ons extend the blob through `kelune_crm_dashboard_config`;
            // Pro uses it to seed the license form's email field.
            $config = [
                'api_url' => rest_url('kelune-crm/v1'),
                'nonce' => wp_create_nonce('wp_rest'),
                'admin_url' => admin_url(),
                // Plain permalinks force REST onto the ?rest_route= form, which
                // trips up external consumers of the incoming-webhook URL. The
                // setup wizard surfaces a nudge to switch to pretty permalinks.
                'permalinks_plain' => '' === get_option('permalink_structure', ''),
                'plugin_url' => KELUNE_CRM_PLUGIN_URL,
                'version' => $this->version,
                // Base for the editor's content stylesheet.
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
                // Global email footer for preview (business tags resolved,
                // unsubscribe → site home). The dashboard appends the wrapped
                // form to fragments and swaps the builder's marker for the
                // unwrapped one, so previews match what recipients get.
                'email_footer_preview_html' => (new \KeluneCRM\Services\EmailService())->renderFooterForPreview(),
                'email_footer_content_preview_html' => (new \KeluneCRM\Services\EmailService())->renderFooterContentForPreview(),
                // Free/Pro state for the dashboard: whether the Pro add-on is active
                // and the per-feature flag map. React reads these to reveal Pro
                // surfaces (nav items, pages) only while Pro is active.
                'pro_active' => $this->isProActive(),
                'features' => $this->getFeatures(),
            ];

            /** @var array<string, mixed> $config */
            $config = apply_filters('kelune_crm_dashboard_config', $config);

            wp_localize_script('kelune-crm-dashboard', 'kelunecrm', $config);
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
     * feature to false; Pro enables them via the `kelune_crm_features` filter.
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

    /**
     * Read the dashboard bundle manifest.
     *
     * Missing or malformed values degrade to empty strings, which skips the
     * enqueue rather than emitting a broken URL.
     *
     * @return array{js: string, css: string}
     */
    private function dashboardManifest(): array
    {
        static $manifest = null;

        if (null !== $manifest) {
            return $manifest;
        }

        $file = KELUNE_CRM_PLUGIN_DIR . 'assets/apps/dashboard/manifest.php';
        $data = is_readable($file) ? require $file : [];

        if (!is_array($data)) {
            $data = [];
        }

        // Interpolated into a URL: keep to a basename so nothing traverses out.
        $manifest = [
            'js' => isset($data['js']) && is_string($data['js']) ? basename($data['js']) : '',
            'css' => isset($data['css']) && is_string($data['css']) ? basename($data['css']) : '',
        ];

        return $manifest;
    }

    private function registerPostTypes(): void {}

    /**
     * Cron event names this plugin does not run, cleared whenever they are found.
     *
     * An install can still carry the event, where it fires into a hook nothing
     * listens on — visible in Site Health as a plugin event with no callback —
     * and blocks a same-named feature from ever scheduling itself, since every
     * scheduler here is guarded by wp_next_scheduled(). A feature that claims one
     * of these names drops it from this list.
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
     * Not gated on use_gravatar_service — that governs disclosing *contacts'*
     * addresses to a third party, while a WP user is the admin's own account,
     * which wp-admin already shows an avatar for everywhere else.
     *
     * show_avatars is the right gate, and must be checked explicitly:
     * get_avatar_url() does not honour it (that guard is in get_avatar()), so an
     * admin who turned avatars off site-wide would still get one here.
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
     * Printed inline into the admin page HTML, so it must never carry a
     * credential even on an administrators-only screen. A secret setting has to
     * be stripped here (and masked in SettingsController), never added blindly.
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
