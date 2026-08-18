<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Providers;

use PHPMailer\PHPMailer\PHPMailer;

interface EmailProviderInterface
{
    /**
     * Transport a fully-assembled email message.
     *
     * The message is built once by {@see \KeluneCRM\Services\EmailService} as
     * a PHPMailer instance — with From, Reply-To, To/Cc/Bcc, subject, HTML +
     * plain-text bodies, attachments and custom headers already applied — so the
     * driver only has to move it (SMTP sends directly, SES sends the raw MIME via
     * SendRawEmail, Mailgun/SendGrid re-map the parts to their API).
     *
     * @param PHPMailer $phpmailer The assembled message.
     * @param array<string, mixed> $config Provider-specific configuration.
     * @return bool|\WP_Error True on success, WP_Error on failure.
     */
    public function send(PHPMailer $phpmailer, array $config = []): bool|\WP_Error;

    /**
     * Test the connection with the email provider
     *
     * @param array<string, mixed> $config Provider configuration
     * @return bool|\WP_Error True on success, WP_Error on failure with error message
     */
    public function testConnection(array $config): bool|\WP_Error;

    /**
     * Return the sender identities this provider is allowed to send from.
     *
     * Entries may be full email addresses (e.g. "noreply@example.com") or bare
     * domains (e.g. "example.com"); a custom From is allowed when it matches an
     * entry exactly or shares its domain. Returns an empty array when the
     * provider cannot enumerate identities (e.g. SMTP) or the lookup fails — in
     * that case callers should permit any sender and warn rather than block.
     *
     * @param array<string, mixed> $config Provider configuration
     * @return array<int, string> Verified sender emails and/or domains
     */
    public function getVerifiedSenders(array $config): array;

    /**
     * Get the provider name
     *
     * @return string
     */
    public function getName(): string;
}
