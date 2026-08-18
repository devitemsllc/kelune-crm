<?php

declare(strict_types=1);

namespace KeluneCRM\Core;

class Deactivator
{
    public static function deactivate(): void
    {
        self::clearCronJobs();
        self::clearTransients();
        flush_rewrite_rules();
    }

    private static function clearCronJobs(): void
    {
        $cron_jobs = [
            'kelune_crm_process_email_queue',
            'kelune_crm_process_automations',
            'kelune_crm_calculate_segments',
            'kelune_crm_daily_cleanup',
            'kelune_crm_weekly_analytics',
            'kelune_crm_process_scheduled_campaigns',
            'kelune_crm_process_campaign_queue',
        ];

        // Clear every occurrence of each hook, not just the next one — a hook
        // that somehow got double-scheduled would otherwise leave a stray event
        // behind after deactivation.
        foreach ($cron_jobs as $job) {
            wp_clear_scheduled_hook($job);
        }
    }

    private static function clearTransients(): void
    {
        global $wpdb;

        // Delete all plugin transients. Every transient this plugin (and the Pro
        // add-on) writes is namespaced with the `kelune_crm_` prefix. Uses a
        // direct query because there is no core API to bulk delete transients by
        // prefix.
        // phpcs:disable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
        $wpdb->query(
            "DELETE FROM {$wpdb->options}
             WHERE option_name LIKE '_transient_kelune_crm_%'
             OR option_name LIKE '_transient_timeout_kelune_crm_%'"
        );
        // phpcs:enable WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
    }
}
