<?php

declare(strict_types=1);

namespace KeluneCRM\Services\Providers;

use PHPMailer\PHPMailer\PHPMailer;

class SMTPProvider implements EmailProviderInterface
{
    /**
     * Transport the assembled message over SMTP.
     *
     * The message (recipients, From/Reply-To, bodies, attachments, custom
     * headers) is already built on the PHPMailer instance; this only points it
     * at the SMTP server and sends. Unlike the API drivers there is no re-mapping
     * — PHPMailer speaks SMTP natively.
     *
     * @param array<string, mixed> $config
     * @return bool|\WP_Error
     */
    public function send(PHPMailer $phpmailer, array $config = []): bool|\WP_Error
    {
        $phpmailer->isSMTP();
        $phpmailer->Host = (string) ($config['smtp_host'] ?? '');
        $phpmailer->Port = (int) ($config['smtp_port'] ?? 587);

        // Authenticate only when credentials are configured; some relays (local
        // mailhogs, IP-allowlisted servers) accept unauthenticated submission.
        $username = (string) ($config['smtp_username'] ?? '');
        $password = (string) ($config['smtp_password'] ?? '');
        if ($username !== '') {
            $phpmailer->SMTPAuth = true;
            $phpmailer->Username = $username;
            $phpmailer->Password = $password;
        } else {
            $phpmailer->SMTPAuth = false;
        }

        // Set encryption. For 'none', explicitly disable both SMTPSecure and the
        // opportunistic STARTTLS upgrade so the user's choice is honored.
        $encryption = (string) ($config['smtp_encryption'] ?? 'tls');
        if ($encryption === 'ssl') {
            $phpmailer->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($encryption === 'tls') {
            $phpmailer->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        } else {
            $phpmailer->SMTPSecure = '';
            $phpmailer->SMTPAutoTLS = false;
        }

        // Opportunistic STARTTLS upgrade can be turned off explicitly.
        if (($config['smtp_auto_tls'] ?? 'yes') === 'no') {
            $phpmailer->SMTPAutoTLS = false;
        }

        try {
            $sent = $phpmailer->send();

            if (!$sent) {
                return new \WP_Error(
                    'smtp_send_failed',
                    __('Failed to send email via SMTP', 'kelune-crm')
                );
            }

            return true;
        } catch (\PHPMailer\PHPMailer\Exception $e) {
            return new \WP_Error(
                'smtp_exception',
                /* translators: %s: SMTP exception message */
                sprintf(__('SMTP exception: %s', 'kelune-crm'), $e->getMessage())
            );
        }
    }

    /**
     * Test SMTP connection
     *
     * @param array<string, mixed> $config
     * @return bool|\WP_Error
     */
    public function testConnection(array $config): bool|\WP_Error
    {
        if (empty($config['smtp_host']) || empty($config['smtp_username']) || empty($config['smtp_password'])) {
            return new \WP_Error(
                'invalid_config',
                __('Missing required SMTP configuration', 'kelune-crm')
            );
        }

        // Require PHPMailer classes
        require_once ABSPATH . WPINC . '/PHPMailer/PHPMailer.php';
        require_once ABSPATH . WPINC . '/PHPMailer/SMTP.php';
        require_once ABSPATH . WPINC . '/PHPMailer/Exception.php';

        $phpmailer = new \PHPMailer\PHPMailer\PHPMailer(true);

        try {
            // Configure SMTP settings
            $phpmailer->isSMTP();
            $phpmailer->Host = $config['smtp_host'];
            $phpmailer->Port = (int) ($config['smtp_port'] ?? 587);
            $phpmailer->SMTPAuth = true;
            $phpmailer->Username = $config['smtp_username'];
            $phpmailer->Password = $config['smtp_password'];

            // Set encryption (match send(): honor 'none' by disabling auto-TLS).
            $encryption = $config['smtp_encryption'] ?? 'tls';
            if ($encryption === 'ssl') {
                $phpmailer->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
            } elseif ($encryption === 'tls') {
                $phpmailer->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
            } else {
                $phpmailer->SMTPSecure = '';
                $phpmailer->SMTPAutoTLS = false;
            }

            // Disable debug output for clean user experience
            $phpmailer->SMTPDebug = 0;

            // Set a short timeout for testing
            $phpmailer->Timeout = 10;

            // smtpConnect() opens the socket, negotiates encryption AND (because
            // SMTPAuth is true) authenticates — it throws on a bad host, TLS, or
            // wrong credentials, which the catch blocks below turn into a
            // WP_Error. A true return therefore proves the full path works.
            if (!$phpmailer->smtpConnect()) {
                return new \WP_Error(
                    'connection_failed',
                    __('SMTP connection test failed. Please check your settings and credentials.', 'kelune-crm')
                );
            }

            $phpmailer->smtpClose();

            return true;

        } catch (\PHPMailer\PHPMailer\Exception $e) {
            return new \WP_Error(
                'smtp_exception',
                __('SMTP connection test failed. Please check your credentials.', 'kelune-crm')
            );
        } catch (\Exception $e) {
            return new \WP_Error(
                'connection_error',
                __('SMTP connection test failed. Please check your credentials.', 'kelune-crm')
            );
        }
    }

    /**
     * SMTP cannot enumerate allowed senders — the server accepts whatever From
     * the account permits — so return an empty list. Callers then allow any
     * sender (the SMTP server itself enforces what it will relay).
     *
     * @param array<string, mixed> $config
     * @return array<int, string>
     */
    public function getVerifiedSenders(array $config): array
    {
        return [];
    }

    /**
     * Get provider name
     *
     * @return string
     */
    public function getName(): string
    {
        return 'SMTP';
    }
}
