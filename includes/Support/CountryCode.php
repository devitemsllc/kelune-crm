<?php

declare(strict_types=1);

namespace KeluneCRM\Support;

/**
 * Normalizer for the contacts.country column.
 */
class CountryCode
{
    /**
     * VARCHAR(2) column, and WP strips the strict SQL modes, so a longer value
     * truncates to a different country ("United States" → "Un"). Anything that
     * is not an ISO 3166-1 alpha-2 code is dropped.
     */
    public static function normalize(mixed $value): string
    {
        $code = strtoupper(sanitize_text_field(is_scalar($value) ? (string) $value : ''));

        return 1 === preg_match('/^[A-Z]{2}$/', $code) ? $code : '';
    }
}
