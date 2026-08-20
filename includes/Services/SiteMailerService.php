<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Models\EmailProvider;
use KeluneCRM\Repositories\EmailProviderRepository;

/**
 * Routes every site-wide wp_mail() call through the plugin's default email
 * provider connection via the `pre_wp_mail` filter. When an active default
 * provider exists the wp_mail() arguments are parsed into a PHPMailer instance
 * and handed to the provider driver, short-circuiting core's transport; when
 * none exists null is returned so WordPress sends normally.
 */
class SiteMailerService
{
    private EmailProviderRepository $providerRepository;
    private EmailService $emailService;

    /**
     * Re-entrancy guard: the drivers don't call wp_mail() themselves, but a
     * third-party phpmailer_init hook could, which would loop forever.
     */
    private bool $sending = false;

    public function __construct()
    {
        $this->providerRepository = new EmailProviderRepository();
        $this->emailService = new EmailService();
    }

    /**
     * Register the site-wide mailer. The filter is added unconditionally (cheap,
     * no DB hit at boot); the default-provider lookup runs lazily only when an
     * email is actually being sent.
     */
    public function register(): void
    {
        add_filter('pre_wp_mail', [$this, 'route'], 10, 2);
    }

    /**
     * Route a wp_mail() call through the default provider connection.
     *
     * @param null|bool $short_circuit Non-null if another filter already handled the send.
     * @param mixed     $atts          Compacted wp_mail() args: to, subject, message, headers, attachments.
     * @return null|bool Null to let WordPress send normally; bool = handled (send result).
     */
    public function route($short_circuit, $atts)
    {
        // Respect a decision another plugin already made, and never re-enter.
        if (null !== $short_circuit || $this->sending) {
            return $short_circuit;
        }

        $this->sending = true;

        try {
            $message = $this->parseAtts(is_array($atts) ? $atts : []);

            // Route by From: a From that a connection owns (its bound sender or
            // a verified sender) goes through that connection untouched;
            // anything else falls to the default connection, which rewrites the
            // From to its verified sender. With no active provider at all, both
            // resolve to null — return null and let WordPress send normally.
            $provider = $this->providerRepository->findForSender((string) $message['from_email'])
                ?? $this->providerRepository->findDefault();

            if (!$provider instanceof EmailProvider) {
                return null;
            }

            $result = $this->emailService->sendThroughProvider($provider, $message);
        } catch (\Throwable $e) {
            $result = new \WP_Error('site_mailer_failed', $e->getMessage());
        } finally {
            $this->sending = false;
        }

        $mail_data = is_array($atts) ? $atts : [];

        if (is_wp_error($result)) {
            /**
             * Mirrors core wp_mail()'s failure hook so logging integrations and
             * "resend" tooling see the same signal for provider sends.
             */
            // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Intentionally mirrors core wp_mail()'s failure hook so logging/resend integrations receive the same signal.
            do_action('wp_mail_failed', new \WP_Error(
                'wp_mail_failed',
                $result->get_error_message(),
                $mail_data
            ));

            return false;
        }

        /** Mirrors core wp_mail()'s success hook. */
        // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Intentionally mirrors core wp_mail()'s success hook.
        do_action('wp_mail_succeeded', $mail_data);

        return true;
    }

    /**
     * Parse wp_mail() arguments into the structured message array
     * {@see EmailService::sendThroughProvider()} expects, applying the same
     * header handling and From defaults as core wp_mail().
     *
     * @param array<string, mixed> $atts
     * @return array<string, mixed>
     */
    private function parseAtts(array $atts): array
    {
        $to = $atts['to'] ?? '';
        $subject = (string) ($atts['subject'] ?? '');
        $body = (string) ($atts['message'] ?? '');
        $headers = $atts['headers'] ?? '';
        $attachments = $atts['attachments'] ?? [];

        $parsed = $this->parseHeaders($headers);

        // From: header value, else core's default (wordpress@<sitedomain>),
        // filtered exactly as core wp_mail() filters it.
        $from_email = $parsed['from_email'];
        $from_name = $parsed['from_name'];
        if ($from_email === '') {
            $from_email = $this->defaultFromEmail();
        }
        if ($from_name === '') {
            $from_name = 'WordPress';
        }
        /** This filter is documented in wp-includes/pluggable.php (wp_mail). */
        // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Core wp_mail() filter, applied intentionally for parity.
        $from_email = (string) apply_filters('wp_mail_from', $from_email);
        /** This filter is documented in wp-includes/pluggable.php (wp_mail). */
        // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Core wp_mail() filter, applied intentionally for parity.
        $from_name = (string) apply_filters('wp_mail_from_name', $from_name);

        return [
            'to' => $to,
            'subject' => $subject,
            'html' => $body,
            'text' => '',
            'from_email' => sanitize_email($from_email),
            'from_name' => sanitize_text_field($from_name),
            'reply_to' => $parsed['reply_to'],
            'reply_to_name' => $parsed['reply_to_name'],
            'cc' => $parsed['cc'],
            'bcc' => $parsed['bcc'],
            'attachments' => $this->normalizeAttachments($attachments),
            'headers' => $parsed['custom'],
            'content_type' => $parsed['content_type'],
            'charset' => $parsed['charset'],
        ];
    }

    /**
     * Parse a wp_mail() $headers value (string or array), following core's own
     * parsing: split on newlines, then the first colon, recognise
     * From / Reply-To / Cc / Bcc / Content-Type, keep the rest as custom.
     *
     * @param string|array<int, string> $headers
     * @return array{from_email: string, from_name: string, reply_to: string, reply_to_name: string, cc: array<int, string>, bcc: array<int, string>, content_type: string, charset: string, custom: array<string, string>}
     */
    private function parseHeaders($headers): array
    {
        $out = [
            'from_email' => '',
            'from_name' => '',
            'reply_to' => '',
            'reply_to_name' => '',
            'cc' => [],
            'bcc' => [],
            'content_type' => 'text/plain',
            'charset' => '',
            'custom' => [],
        ];

        if (empty($headers)) {
            return $out;
        }

        if (!is_array($headers)) {
            $headers = explode("\n", str_replace("\r\n", "\n", (string) $headers));
        }

        foreach ($headers as $header) {
            $header = (string) $header;
            if (strpos($header, ':') === false) {
                continue;
            }

            [$name, $content] = explode(':', trim($header), 2);
            $name = strtolower(trim($name));
            $content = trim($content);

            switch ($name) {
                case 'from':
                    $addr = $this->splitAddress($content);
                    $out['from_email'] = $addr['email'];
                    $out['from_name'] = $addr['name'];
                    break;
                case 'content-type':
                    if (strpos($content, ';') !== false) {
                        [$type, $rest] = explode(';', $content, 2);
                        $out['content_type'] = trim($type);
                        if (preg_match('/charset=["\']?([^"\';\s]+)/i', $rest, $m)) {
                            $out['charset'] = trim($m[1]);
                        }
                    } else {
                        $out['content_type'] = trim($content);
                    }
                    break;
                case 'cc':
                    $out['cc'] = array_merge($out['cc'], $this->splitList($content));
                    break;
                case 'bcc':
                    $out['bcc'] = array_merge($out['bcc'], $this->splitList($content));
                    break;
                case 'reply-to':
                    $addr = $this->splitAddress($content);
                    $out['reply_to'] = $addr['email'];
                    $out['reply_to_name'] = $addr['name'];
                    break;
                default:
                    if ($content !== '') {
                        $out['custom'][trim(explode(':', trim($header), 2)[0])] = $content;
                    }
                    break;
            }
        }

        return $out;
    }

    /**
     * Split a "Name <email>" (or bare email) string into name + email.
     *
     * @return array{email: string, name: string}
     */
    private function splitAddress(string $value): array
    {
        $value = trim($value);
        if (preg_match('/^(.*?)<(.+?)>\s*$/', $value, $m)) {
            return [
                'email' => trim($m[2]),
                'name' => trim(trim($m[1]), '"'),
            ];
        }

        return ['email' => $value, 'name' => ''];
    }

    /**
     * Split a comma-separated address list into individual "Name <email>" parts.
     *
     * @return array<int, string>
     */
    private function splitList(string $value): array
    {
        $parts = array_map('trim', explode(',', $value));

        return array_values(array_filter($parts, static fn (string $p): bool => $p !== ''));
    }

    /**
     * Normalise the wp_mail() attachments value (newline string or array) into a
     * list of file paths.
     *
     * @param string|array<int|string, mixed> $attachments
     * @return array<int, string>
     */
    private function normalizeAttachments($attachments): array
    {
        if (empty($attachments)) {
            return [];
        }

        if (!is_array($attachments)) {
            $attachments = explode("\n", str_replace("\r\n", "\n", (string) $attachments));
        }

        $paths = [];
        foreach ($attachments as $attachment) {
            // wp_mail() also accepts filename => path pairs; the path is the value.
            $path = trim((string) $attachment);
            if ($path !== '') {
                $paths[] = $path;
            }
        }

        return $paths;
    }

    /**
     * Core wp_mail()'s default From address: wordpress@<site-host> (without a
     * leading www.). Kept in sync with wp-includes/pluggable.php.
     */
    private function defaultFromEmail(): string
    {
        $sitename = strtolower((string) wp_parse_url(network_home_url(), PHP_URL_HOST));
        if (strpos($sitename, 'www.') === 0) {
            $sitename = substr($sitename, 4);
        }

        return 'wordpress@' . $sitename;
    }
}
