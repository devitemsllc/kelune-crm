<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Bounce;

/**
 * How an outgoing message is tagged so a bounce can be traced to its
 * `email_logs` row. Drivers write these, normalizers read them back; Mailgun
 * and SendGrid do not echo custom headers, so each has its own field.
 */
final class BounceAttribution
{
    /** In the raw MIME, so SMTP and SES keep it; SES echoes it only with original headers on. */
    public const HEADER = 'X-Kelune-CRM-Log';

    /** Mailgun `v:` user variable. */
    public const MAILGUN_VARIABLE = 'kelune_log';

    /** SendGrid `custom_args` key. */
    public const SENDGRID_ARG = 'kelune_log';

    /** A value interpolated into a raw header line must not be able to inject one. */
    public static function sanitizeToken(string $token): string
    {
        return (string) preg_replace('/[^A-Za-z0-9_]/', '', $token);
    }

    /** ISO 8601 or Unix seconds (number or numeric string) → UTC `Y-m-d H:i:s`, or ''. */
    public static function eventTime(mixed $value): string
    {
        if (is_int($value) || is_float($value)) {
            return gmdate('Y-m-d H:i:s', (int) $value);
        }

        if (!is_string($value) || '' === $value) {
            return '';
        }

        if (is_numeric($value)) {
            return gmdate('Y-m-d H:i:s', (int) (float) $value);
        }

        $parsed = strtotime($value);

        return false === $parsed ? '' : gmdate('Y-m-d H:i:s', $parsed);
    }

    /** PHPMailer may emit a long header as RFC 2047 encoded words across folded lines. */
    public static function tokenFromHeaderValue(string $value): string
    {
        $decoded = preg_replace_callback(
            '/=\\?[^?]*\\?([QqBb])\\?([^?]*)\\?=/',
            static function (array $word): string {
                if ('B' === strtoupper($word[1])) {
                    return (string) base64_decode($word[2], true);
                }

                // In an encoded word `_` is a space; a literal underscore arrives as =5F.
                return quoted_printable_decode(str_replace('_', ' ', $word[2]));
            },
            $value
        );

        return self::sanitizeToken(is_string($decoded) ? $decoded : $value);
    }
}
