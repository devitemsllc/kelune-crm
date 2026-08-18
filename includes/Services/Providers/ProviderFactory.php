<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Providers;

/**
 * Resolves a provider type string to its driver instance, centralizing the
 * type→driver mapping.
 */
class ProviderFactory
{
    /**
     * Supported provider type keys mapped to display labels.
     *
     * @var array<string, string>
     */
    public const TYPES = [
        'smtp' => 'SMTP',
        'ses' => 'Amazon SES',
        'mailgun' => 'Mailgun',
        'sendgrid' => 'SendGrid',
    ];

    /**
     * Create a driver for the given provider type. Returns null for an unknown
     * type (e.g. 'wp_mail'), letting callers fall back to wp_mail.
     */
    public function make(string $type): ?EmailProviderInterface
    {
        switch ($type) {
            case 'smtp':
                return new SMTPProvider();
            case 'sendgrid':
                return new SendGridProvider();
            case 'mailgun':
                return new MailgunProvider();
            case 'ses':
                return new SESProvider();
            default:
                return null;
        }
    }

    public function isValidType(string $type): bool
    {
        return isset(self::TYPES[$type]);
    }

    public function getLabel(string $type): string
    {
        return self::TYPES[$type] ?? 'Unknown';
    }
}
