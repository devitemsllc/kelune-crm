<?php

declare(strict_types=1);

namespace KeluneCRM\Core;

use KeluneCRM\Database\Migrator;
use KeluneCRM\Services\SettingsService;

class Activator
{
    public static function activate(): void
    {
        global $wpdb;

        // Check PHP version
        if (version_compare(PHP_VERSION, KELUNE_CRM_MIN_PHP_VERSION, '<')) {
            deactivate_plugins(KELUNE_CRM_PLUGIN_BASENAME);
            wp_die(esc_html(sprintf(
                /* translators: 1: required PHP version, 2: current PHP version */
                __('Kelune CRM requires PHP %1$s or higher. Your current version is %2$s.', 'kelune-crm'),
                KELUNE_CRM_MIN_PHP_VERSION,
                PHP_VERSION
            )));
        }

        // Check WordPress version
        if (version_compare($GLOBALS['wp_version'], KELUNE_CRM_MIN_WP_VERSION, '<')) {
            deactivate_plugins(KELUNE_CRM_PLUGIN_BASENAME);
            wp_die(esc_html(sprintf(
                /* translators: %s: required WordPress version */
                __('Kelune CRM requires WordPress %s or higher. Please update WordPress.', 'kelune-crm'),
                KELUNE_CRM_MIN_WP_VERSION
            )));
        }

        $migrator = new Migrator($wpdb);
        $migrator->migrate();

        self::setDefaultOptions();
        self::scheduleCronJobs();

        flush_rewrite_rules();

        set_transient('kelune_crm_activation_redirect', true, 30);
    }

    private static function setDefaultOptions(): void
    {
        $default_options = [
            'kelune_crm_version' => KELUNE_CRM_VERSION,
            'kelune_crm_db_version' => KELUNE_CRM_DB_VERSION,
            'kelune_crm_installed_date' => current_time('mysql', true),
            // Seeded from the one canonical map so the stored option can never
            // drift from what the REST controller accepts and consumers read.
            'kelune_crm_settings' => SettingsService::defaults(),
        ];

        foreach ($default_options as $option_name => $option_value) {
            if (get_option($option_name) === false) {
                add_option($option_name, $option_value);
            }
        }
    }

    private static function scheduleCronJobs(): void
    {
        // Register custom cron intervals. Display labels are intentionally
        // untranslated: this filter runs during activation, before the init
        // hook, so translating here triggers WP 6.7's "loaded too early" notice.
        add_filter('cron_schedules', function (array $schedules): array {
            $schedules['kelune_crm_every_minute'] = [
                'interval' => 60,
                'display' => 'Every Minute (Kelune CRM)',
            ];
            return $schedules;
        });

        // Only events that have a listener are scheduled. An event scheduled
        // ahead of the feature that will run it is not a placeholder — every
        // caller here is guarded by wp_next_scheduled(), so a stale event sits
        // in the DB at whatever interval it was first given and silently blocks
        // the real feature from ever scheduling itself correctly. Schedule the
        // event where its listener is registered instead (see CampaignScheduler
        // and CleanupHandler); Plugin::initCronJobs() clears the retired ones.
        if (!wp_next_scheduled('kelune_crm_process_automations')) {
            wp_schedule_event(time(), 'kelune_crm_every_minute', 'kelune_crm_process_automations');
        }

        if (!wp_next_scheduled('kelune_crm_daily_cleanup')) {
            wp_schedule_event(time(), 'daily', 'kelune_crm_daily_cleanup');
        }
    }
}
