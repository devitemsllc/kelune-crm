<?php

/**
 * Runtime PSR-4 autoloader mapping the `KeluneCRM\` namespace onto
 * `includes/` (e.g. `KeluneCRM\Core\Plugin` → `includes/Core/Plugin.php`).
 *
 * @package KeluneCRM
 */

declare(strict_types=1);

if (!defined('ABSPATH')) {
    exit;
}

spl_autoload_register(static function (string $class): void {
    $prefix  = 'KeluneCRM\\';
    $baseDir = __DIR__ . '/includes/';

    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relativeClass = substr($class, $len);
    $file          = $baseDir . str_replace('\\', '/', $relativeClass) . '.php';

    if (is_file($file)) {
        require $file;
    }
});
