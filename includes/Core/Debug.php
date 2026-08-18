<?php

declare(strict_types=1);

namespace KeluneCRM\Core;

/**
 * Lightweight debug logger: writes to the PHP error log only when WP_DEBUG or
 * KELUNE_CRM_DEBUG is enabled.
 */
class Debug
{
    public static function log(string $message): void
    {
        if (!self::enabled()) {
            return;
        }

        // error_log() is intentional here: this is the plugin's single, gated
        // diagnostic sink, only reached when WP_DEBUG/KELUNE_CRM_DEBUG is on.
        error_log($message); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
    }

    private static function enabled(): bool
    {
        return (defined('WP_DEBUG') && WP_DEBUG)
            || (defined('KELUNE_CRM_DEBUG') && KELUNE_CRM_DEBUG);
    }
}
