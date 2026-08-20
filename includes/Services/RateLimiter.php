<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Per-webhook rate limiting: 100 requests a minute, 1000 an hour.
 */
class RateLimiter
{
    public const LIMIT_PER_MINUTE = 100;
    public const LIMIT_PER_HOUR = 1000;
    public const WINDOW_MINUTE = 60; // seconds
    public const WINDOW_HOUR = 3600; // seconds

    /**
     * Check if request is allowed
     *
     * @param int $webhookId
     * @return array{allowed: bool, message: string, retry_after: int}
     */
    public function check(int $webhookId): array
    {
        $minuteCheck = $this->checkLimit($webhookId, 'minute', self::LIMIT_PER_MINUTE, self::WINDOW_MINUTE);
        if (!$minuteCheck['allowed']) {
            return $minuteCheck;
        }

        $hourCheck = $this->checkLimit($webhookId, 'hour', self::LIMIT_PER_HOUR, self::WINDOW_HOUR);
        if (!$hourCheck['allowed']) {
            return $hourCheck;
        }

        return [
            'allowed' => true,
            'message' => '',
            'retry_after' => 0,
        ];
    }

    /**
     * Increment request counter
     *
     * @param int $webhookId
     * @return void
     */
    public function increment(int $webhookId): void
    {
        $this->incrementCounter($webhookId, 'minute', self::WINDOW_MINUTE);
        $this->incrementCounter($webhookId, 'hour', self::WINDOW_HOUR);
    }

    /**
     * Check specific limit
     *
     * @param int $webhookId
     * @param string $window 'minute' or 'hour'
     * @param int $limit
     * @param int $ttl
     * @return array{allowed: bool, message: string, retry_after: int}
     */
    private function checkLimit(int $webhookId, string $window, int $limit, int $ttl): array
    {
        $key = $this->getCacheKey($webhookId, $window);
        $count = get_transient($key);

        if ($count === false) {
            $count = 0;
        }

        if ($count >= $limit) {
            return [
                'allowed' => false,
                'message' => sprintf(
                    /* translators: %1$d: maximum number of requests, %2$s: time window (minute or hour) */
                    __('Rate limit exceeded. Maximum %1$d requests per %2$s.', 'kelune-crm'),
                    $limit,
                    $window === 'hour'
                        ? __('hour', 'kelune-crm')
                        : __('minute', 'kelune-crm')
                ),
                'retry_after' => $ttl,
            ];
        }

        return [
            'allowed' => true,
            'message' => '',
            'retry_after' => 0,
        ];
    }

    /**
     * Increment counter
     *
     * @param int $webhookId
     * @param string $window
     * @param int $ttl
     * @return void
     */
    private function incrementCounter(int $webhookId, string $window, int $ttl): void
    {
        $key = $this->getCacheKey($webhookId, $window);
        $count = get_transient($key);

        if ($count === false) {
            set_transient($key, 1, $ttl);
        } else {
            set_transient($key, $count + 1, $ttl);
        }
    }

    /**
     * Get cache key
     *
     * @param int $webhookId
     * @param string $window
     * @return string
     */
    private function getCacheKey(int $webhookId, string $window): string
    {
        return sprintf('kelune_crm_webhook_rate_%d_%s', $webhookId, $window);
    }
}
