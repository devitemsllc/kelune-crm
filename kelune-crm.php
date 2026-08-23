<?php
/**
 * Plugin Name: Kelune CRM
 * Plugin URI: https://kelunecrm.com
 * Description: A complete CRM for WordPress with contact management, email campaigns, and visual marketing automation.
 * Version: 1.0.2
 * Author: Devitems
 * Author URI: https://devitems.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: kelune-crm
 * Domain Path: /languages
 * Requires at least: 6.6
 * Requires PHP: 8.1
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('KELUNE_CRM_VERSION', '1.0.2');
define('KELUNE_CRM_PLUGIN_FILE', __FILE__);
define('KELUNE_CRM_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('KELUNE_CRM_PLUGIN_URL', plugin_dir_url(__FILE__));
define('KELUNE_CRM_PLUGIN_BASENAME', plugin_basename(__FILE__));
define('KELUNE_CRM_DB_VERSION', '1.0.1');
define('KELUNE_CRM_MIN_PHP_VERSION', '8.1');
define('KELUNE_CRM_MIN_WP_VERSION', '6.6');

// Check PHP version
if (version_compare(PHP_VERSION, KELUNE_CRM_MIN_PHP_VERSION, '<')) {
    add_action('admin_notices', function () {
        ?>
        <div class="notice notice-error">
            <p><?php printf(
                /* translators: %1$s: required PHP version, %2$s: current PHP version */
                esc_html__('Kelune CRM requires PHP %1$s or higher. Your current version is %2$s.', 'kelune-crm'),
                esc_html(KELUNE_CRM_MIN_PHP_VERSION),
                esc_html(PHP_VERSION)
            ); ?></p>
        </div>
        <?php
    });
    return;
}

// Check WordPress version
if (version_compare($GLOBALS['wp_version'], KELUNE_CRM_MIN_WP_VERSION, '<')) {
    add_action('admin_notices', function () {
        ?>
        <div class="notice notice-error">
            <p><?php printf(
                /* translators: %s: required WordPress version */
                esc_html__('Kelune CRM requires WordPress %s or higher. Please update WordPress.', 'kelune-crm'),
                esc_html(KELUNE_CRM_MIN_WP_VERSION)
            ); ?></p>
        </div>
        <?php
    });
    return;
}

// Register the first-party PSR-4 autoloader (KeluneCRM\ => includes/).
require_once KELUNE_CRM_PLUGIN_DIR . 'autoload.php';

function kelune_crm_init()
{
    \KeluneCRM\Core\Plugin::getInstance();
}
add_action('plugins_loaded', 'kelune_crm_init', 10);

// Activation hook
register_activation_hook(__FILE__, function () {
    require_once KELUNE_CRM_PLUGIN_DIR . 'includes/Core/Activator.php';
    \KeluneCRM\Core\Activator::activate();
});

// Deactivation hook
register_deactivation_hook(__FILE__, function () {
    require_once KELUNE_CRM_PLUGIN_DIR . 'includes/Core/Deactivator.php';
    \KeluneCRM\Core\Deactivator::deactivate();
});

// No uninstall hook: a CRM's contacts, campaigns, and logs are the user's
// business data, so the plugin never auto-destroys them on delete. Deactivation
// still clears runtime-only state (cron, transients).

// Add action links
add_filter('plugin_action_links_' . KELUNE_CRM_PLUGIN_BASENAME, function ($links) {
    $action_links = [
        '<a href="' . admin_url('admin.php?page=kelune-crm#/dashboard') . '">' . esc_html__('Dashboard', 'kelune-crm') . '</a>',
        '<a href="' . admin_url('admin.php?page=kelune-crm#/contacts') . '">' . esc_html__('Contacts', 'kelune-crm') . '</a>',
        '<a href="' . admin_url('admin.php?page=kelune-crm#/settings') . '">' . esc_html__('Settings', 'kelune-crm') . '</a>',
    ];
    return array_merge($action_links, $links);
});
