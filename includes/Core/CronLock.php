<?php

declare(strict_types=1);

namespace KeluneCRM\Core;

/**
 * A short-lived, cross-process advisory lock backed by a single wp_options row.
 *
 * WP-Cron, a manual "Run Now" and the loopback continuation can all reach the
 * same drainer at once. The per-row claim already stops double-processing; this
 * lock stops every racer bootstrapping PHP and fighting over the same batch, by
 * letting the loser bail after one atomic query.
 *
 * The primitive is a conditional UPDATE on wp_options: claim the row only when
 * free or older than the TTL. An external object cache must NOT be used as a
 * fast path — some drop-ins back add()/get() with a per-process array, letting
 * two processes both "acquire" the lock.
 */
final class CronLock
{
    /** Prefix for the wp_options row backing each named lock. */
    private const OPTION_PREFIX = 'kelune_crm_lock_';

    /**
     * Atomically acquire a named lock.
     *
     * @param string $name Lock identifier (e.g. 'automations').
     * @param int    $ttl  Seconds after which a held lock is treated as abandoned.
     * @return bool True when this process now holds the lock.
     */
    public static function acquire(string $name, int $ttl): bool
    {
        global $wpdb;

        $option = self::optionName($name);
        $now = time();

        // Ensure a row exists so the conditional UPDATE below has something to
        // claim. INSERT IGNORE is a no-op once the row is present.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic lock primitive on wp_options; cannot go through the cached options API.
        $wpdb->query(
            $wpdb->prepare(
                "INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, %s)",
                $option,
                '',
                'no'
            )
        );

        // Claim only if free ('' casts to 0) or the previous holder's timestamp
        // has aged past the TTL. This single statement is the synchronisation
        // point: exactly one concurrent caller sees a non-zero affected-row count.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic lock primitive on wp_options; cannot go through the cached options API.
        $claimed = $wpdb->query(
            $wpdb->prepare(
                "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s AND (option_value = '' OR option_value < %d)",
                (string) $now,
                $option,
                $now - $ttl
            )
        );

        if (is_int($claimed) && $claimed > 0) {
            wp_cache_delete($option, 'options');

            return true;
        }

        return false;
    }

    /**
     * Refresh a held lock's timestamp so a long run is not mistaken for a dead
     * one and reclaimed mid-flight.
     */
    public static function refresh(string $name): void
    {
        global $wpdb;

        $option = self::optionName($name);

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic lock primitive on wp_options; cannot go through the cached options API.
        $wpdb->query(
            $wpdb->prepare(
                "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s",
                (string) time(),
                $option
            )
        );

        wp_cache_delete($option, 'options');
    }

    /**
     * Release a held lock by blanking its timestamp so the next caller can
     * claim it immediately. Safe to call even if not held — the worst case is
     * freeing the slot a moment early.
     */
    public static function release(string $name): void
    {
        global $wpdb;

        $option = self::optionName($name);

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Atomic lock primitive on wp_options; cannot go through the cached options API.
        $wpdb->query(
            $wpdb->prepare(
                "UPDATE {$wpdb->options} SET option_value = %s WHERE option_name = %s",
                '',
                $option
            )
        );

        wp_cache_delete($option, 'options');
    }

    private static function optionName(string $name): string
    {
        return self::OPTION_PREFIX . $name;
    }
}
