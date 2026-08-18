<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Models\Contact;
use KeluneCRM\Models\EmailProvider;
use KeluneCRM\Repositories\CampaignRepository;
use KeluneCRM\Repositories\EmailProviderRepository;
use KeluneCRM\Services\Providers\ProviderFactory;

class EmailService
{
    /**
     * Matches the placeholder a builder document carries in place of the global
     * footer, capturing the template's footer link colour. Emitted by both HTML
     * renderers (PHP + TS) as `<!--cm:global-footer:COLOR-->`; swapped here for
     * the real global footer content at send (its {{unsubscribe_url}} resolves
     * per recipient, its links tinted with the captured colour). MUST match the
     * TS twin (utils/emailHtml.ts globalFooterMarker).
     */
    public const GLOBAL_FOOTER_MARKER_PATTERN = '/<!--cm:global-footer:(.*?)-->/';

    /**
     * Target outbound send rate, in emails per second.
     *
     * Every provider caps throughput (SES allows 14/s by default; SMTP hosts and
     * the API drivers all throttle in some form), and a throttle response comes
     * back as a send failure — which the queue treats as final, never a retry.
     * So an unpaced burst does not slow down, it silently drops recipients.
     * 10/s keeps a margin under the lowest common quota.
     */
    private const EMAILS_PER_SECOND = 10;

    /** @var \wpdb */
    private $db;
    private string $campaignEmailsTable;
    private string $campaignLinksTable;
    private string $contactsTable;
    private \KeluneCRM\Repositories\CampaignRepository $campaignRepository;
    private \KeluneCRM\Repositories\EmailProviderRepository $emailProviderRepository;
    private \KeluneCRM\Services\Providers\ProviderFactory $providerFactory;
    private \KeluneCRM\Services\EmailLogService $emailLogService;
    private \KeluneCRM\Services\SettingsService $settingsService;
    private \KeluneCRM\Services\MergeTagService $mergeTagService;

    public function __construct()
    {
        global $wpdb;
        $this->db = $wpdb;
        $prefix = $wpdb->prefix . 'kelune_crm_';
        $this->campaignEmailsTable = $prefix . 'campaign_emails';
        $this->campaignLinksTable = $prefix . 'campaign_links';
        $this->contactsTable = $prefix . 'contacts';
        $this->campaignRepository = new CampaignRepository();
        $this->emailProviderRepository = new EmailProviderRepository();
        $this->providerFactory = new ProviderFactory();
        $this->emailLogService = new EmailLogService();
        $this->settingsService = new SettingsService();
        $this->mergeTagService = new MergeTagService();
    }

    /**
     * First value that is not an empty string.
     */
    private function firstNonEmpty(string ...$values): string
    {
        foreach ($values as $value) {
            if (trim($value) !== '') {
                return $value;
            }
        }

        return '';
    }

    /**
     * Send a single transactional email through the provider system. Used by
     * automations (and any caller) so every send shares one path and the same
     * provider routing as campaigns.
     *
     * @param array{provider_id?: int|null, from_name?: string, from_email?: string, reply_to?: string, cc?: mixed, bcc?: mixed, attachments?: array<int, mixed>, headers?: array<string, string>, text?: string} $opts
     * @return bool|\WP_Error
     */
    public function sendTransactional(string $to, string $subject, string $content, array $opts = [])
    {
        $provider = $this->resolveProvider($opts['provider_id'] ?? null);

        return $this->dispatch(
            $provider,
            $to,
            $subject,
            $content,
            (string) ($opts['from_name'] ?? ''),
            (string) ($opts['from_email'] ?? ''),
            (string) ($opts['reply_to'] ?? ''),
            [
                'cc' => $opts['cc'] ?? [],
                'bcc' => $opts['bcc'] ?? [],
                'attachments' => $opts['attachments'] ?? [],
                'headers' => $opts['headers'] ?? [],
                'text' => (string) ($opts['text'] ?? ''),
            ]
        );
    }

    /**
     * Resolve which provider connection to send through.
     *
     * Only an EXPLICITLY chosen, active provider is used (campaign/automation
     * "Email Provider" mode). When none is chosen the method returns null, which
     * routes the send through wp_mail() — this is the "Global Email" / "Custom"
     * sender path. We deliberately do NOT fall back to the default provider
     * here: the account default is applied by whatever handles wp_mail (the
     * site's SMTP plugin/server today, and — once built — this plugin's own
     * site-wide mailer that registers the default provider as the wp_mail
     * transport). Auto-resolving the default here would bypass that pipe and
     * make "Global Email" mean something different from the rest of the site.
     */
    private function resolveProvider(?int $provider_id): ?EmailProvider
    {
        if ($provider_id) {
            $provider = $this->emailProviderRepository->find($provider_id);
            if ($provider && $provider->isActive()) {
                return $provider;
            }
        }

        return null;
    }

    /**
     * Dispatch one email through a resolved provider connection (or wp_mail when
     * none is configured).
     *
     * The sender is resolved most-specific-first: the caller's custom values
     * (a campaign's or automation step's own From), then the provider
     * connection's bound sender, then the site-wide default from Settings →
     * Global Email. A provider that carries a verified sender should win over
     * a global default that the provider might reject.
     *
     * For an explicit provider the message is assembled once as a PHPMailer
     * instance (From/Reply-To/To/Cc/Bcc, HTML + plain-text bodies, attachments
     * and custom headers) and the driver only transports it — SMTP sends it
     * directly, SES sends its raw MIME, Mailgun/SendGrid re-map the parts.
     * Without a provider the send goes through wp_mail (Global Email / Custom).
     *
     * @param array{cc?: mixed, bcc?: mixed, attachments?: array<int, mixed>, headers?: array<string, string>, text?: string} $extras
     * @return bool|\WP_Error
     */
    private function dispatch(
        ?EmailProvider $provider,
        string $to,
        string $subject,
        string $content,
        string $custom_from_name = '',
        string $custom_from_email = '',
        string $custom_reply_to = '',
        array $extras = []
    ) {
        $from_email = sanitize_email($this->firstNonEmpty(
            $custom_from_email,
            $provider ? $provider->sender_email : '',
            $this->settingsService->getString('email_from_email')
        ));
        $from_name = sanitize_text_field($this->firstNonEmpty(
            $custom_from_name,
            $provider ? $provider->sender_name : '',
            $this->settingsService->getString('email_from_name')
        ));
        $reply_to = sanitize_email($this->firstNonEmpty(
            $custom_reply_to,
            $provider ? $provider->reply_to : '',
            $this->settingsService->getString('email_reply_to_email')
        ));
        // The reply-to display name only applies to the global default: a
        // caller-supplied or provider-bound reply-to is just an address.
        $reply_to_name = ($reply_to !== '' && $reply_to === sanitize_email($this->settingsService->getString('email_reply_to_email')))
            ? sanitize_text_field($this->settingsService->getString('email_reply_to_name'))
            : '';

        $cc = $extras['cc'] ?? [];
        $bcc = $extras['bcc'] ?? [];
        $attachments = $extras['attachments'] ?? [];
        $custom_headers = $extras['headers'] ?? [];
        $text = (string) ($extras['text'] ?? '');
        if ($text === '' && $content !== '') {
            $text = $this->htmlToText($content);
        }

        // Explicit, recognised provider → assemble the message and hand it off.
        if ($provider) {
            return $this->sendThroughProvider($provider, [
                'to' => $to,
                'subject' => $subject,
                'html' => $content,
                'text' => $text,
                'from_email' => $from_email,
                'from_name' => $from_name,
                'reply_to' => $reply_to,
                'reply_to_name' => $reply_to_name,
                'cc' => $cc,
                'bcc' => $bcc,
                'attachments' => $attachments,
                'headers' => $custom_headers,
                'content_type' => 'text/html',
            ]);
        }

        // No provider (Global Email / Custom modes) → wp_mail. From/Reply-To are
        // interpolated into raw header strings, so they are sanitized above to
        // prevent header injection via an embedded CRLF.
        $headers = ['Content-Type: text/html; charset=UTF-8'];
        if ($from_email !== '') {
            $headers[] = 'From: ' . ($from_name !== '' ? $from_name . ' ' : '') . '<' . $from_email . '>';
        }
        if ($reply_to !== '') {
            $headers[] = 'Reply-To: ' . ($reply_to_name !== '' ? $reply_to_name . ' <' . $reply_to . '>' : $reply_to);
        }
        foreach ($this->normalizeAddresses($cc) as $addr) {
            $headers[] = 'Cc: ' . ($addr['name'] !== '' ? $addr['name'] . ' <' . $addr['email'] . '>' : $addr['email']);
        }
        foreach ($this->normalizeAddresses($bcc) as $addr) {
            $headers[] = 'Bcc: ' . ($addr['name'] !== '' ? $addr['name'] . ' <' . $addr['email'] . '>' : $addr['email']);
        }
        foreach ((array) $custom_headers as $key => $value) {
            $headers[] = (string) $key . ': ' . (string) $value;
        }

        $attachment_paths = [];
        foreach ((array) $attachments as $attachment) {
            if (is_string($attachment) && is_readable($attachment)) {
                $attachment_paths[] = $attachment;
            } elseif (is_array($attachment) && isset($attachment['path']) && is_readable((string) $attachment['path'])) {
                $attachment_paths[] = (string) $attachment['path'];
            }
        }

        $sent = wp_mail($to, $subject, $content, $headers, $attachment_paths);

        return $sent ? true : new \WP_Error('send_failed', __('Email sending failed', 'kelune-crm'));
    }

    /**
     * Assemble a structured message and transport it through one provider
     * connection. Shared by campaign/automation "Email Provider" sends and by
     * the site-wide mailer (SiteMailerService), so every provider send — no
     * matter the entry point — is built and routed the same way.
     *
     * The message is assembled once as a PHPMailer instance, the standard
     * `phpmailer_init` action fires so third-party integrations (logging,
     * DKIM, …) still see the mailer, then the driver transports it (SMTP sends
     * directly, SES sends raw MIME, Mailgun/SendGrid re-map the parts).
     *
     * @param array<string, mixed> $message
     * @return bool|\WP_Error
     */
    public function sendThroughProvider(EmailProvider $provider, array $message)
    {
        $driver = $this->providerFactory->make($provider->provider_type);
        if (!$driver) {
            return new \WP_Error(
                'unknown_provider',
                __('Unknown email provider type.', 'kelune-crm')
            );
        }

        $built = $this->buildMessage($provider, $message);
        if (is_wp_error($built)) {
            return $built;
        }

        // Let third-party integrations that hook phpmailer_init (logging, DKIM,
        // custom headers) act on the assembled message, matching core wp_mail.
        // The provider driver runs after and wins on transport.
        // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedHooknameFound -- Core wp_mail() hook, fired intentionally for integration parity.
        do_action_ref_array('phpmailer_init', [&$built]);

        return $driver->send($built, $provider->toProviderConfig());
    }

    /**
     * Assemble the message as a PHPMailer instance for the provider drivers to
     * transport. Applies the provider's force_from_name / force_from_email /
     * return_path options.
     *
     * @param array<string, mixed> $message
     * @return \PHPMailer\PHPMailer\PHPMailer|\WP_Error
     */
    private function buildMessage(EmailProvider $provider, array $message)
    {
        if (!class_exists(\PHPMailer\PHPMailer\PHPMailer::class)) {
            require_once ABSPATH . WPINC . '/PHPMailer/PHPMailer.php';
            require_once ABSPATH . WPINC . '/PHPMailer/SMTP.php';
            require_once ABSPATH . WPINC . '/PHPMailer/Exception.php';
        }

        $settings = $provider->settings;
        $from_email = (string) $message['from_email'];
        $from_name = (string) $message['from_name'];

        // Force From Email — routing-time behaviour:
        //   • A From that IS one of this connection's allowed senders (its bound
        //     sender_email or a verified sender/domain) is left untouched — the
        //     address is deliverable, so it routes through as-is.
        //   • Any other From is rewritten to the connection's sender_email, so
        //     unverified addresses (e.g. WordPress core's wordpress@domain) don't
        //     bounce. SMTP/SES expose a force_from_email='no' opt-out; Mailgun and
        //     SendGrid have none (they always require a verified sender), so they
        //     force unconditionally.
        $force_opt_out = in_array($provider->provider_type, ['smtp', 'ses'], true)
            && ($settings['force_from_email'] ?? 'yes') === 'no';
        if (!$force_opt_out && $provider->sender_email !== '' && !$provider->ownsSender($from_email)) {
            $from_email = $provider->sender_email;
        }
        if (($settings['force_from_name'] ?? 'no') === 'yes' && $provider->sender_name !== '') {
            $from_name = $provider->sender_name;
        }

        // Content type: HTML unless the caller asked for text/plain (site-wide
        // wp_mail sends default to plain — password resets, most core mail).
        $content_type = strtolower((string) ($message['content_type'] ?? 'text/html'));
        $is_html = strpos($content_type, 'text/plain') === false;
        $charset = (string) ($message['charset'] ?? '');

        $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
        $mail->CharSet = $charset !== '' ? $charset : 'UTF-8';
        $mail->Encoding = 'base64';

        try {
            if ($from_email !== '') {
                $mail->setFrom($from_email, $from_name, false);
            }
            foreach ($this->normalizeAddresses($message['to']) as $addr) {
                $mail->addAddress($addr['email'], $addr['name']);
            }
            foreach ($this->normalizeAddresses($message['cc'] ?? []) as $addr) {
                $mail->addCC($addr['email'], $addr['name']);
            }
            foreach ($this->normalizeAddresses($message['bcc'] ?? []) as $addr) {
                $mail->addBCC($addr['email'], $addr['name']);
            }
            if ((string) $message['reply_to'] !== '') {
                $mail->addReplyTo((string) $message['reply_to'], (string) ($message['reply_to_name'] ?? ''));
            }

            $mail->Subject = (string) $message['subject'];
            $mail->isHTML($is_html);
            $mail->Body = (string) $message['html'];
            if ($is_html && (string) ($message['text'] ?? '') !== '') {
                $mail->AltBody = (string) $message['text'];
            }

            foreach ((array) ($message['attachments'] ?? []) as $attachment) {
                if (is_array($attachment) && isset($attachment['content'])) {
                    $mail->addStringAttachment((string) $attachment['content'], (string) ($attachment['name'] ?? 'attachment'));
                } elseif (is_array($attachment) && isset($attachment['path']) && is_readable((string) $attachment['path'])) {
                    $mail->addAttachment((string) $attachment['path'], (string) ($attachment['name'] ?? ''));
                } elseif (is_string($attachment) && is_readable($attachment)) {
                    $mail->addAttachment($attachment);
                }
            }

            foreach ((array) ($message['headers'] ?? []) as $key => $value) {
                if (is_string($key)) {
                    $mail->addCustomHeader($key, (string) $value);
                }
            }

            // Envelope sender (Return-Path) = From, so bounces come back to the
            // sending identity rather than the web-server user.
            if (($settings['return_path'] ?? 'no') === 'yes' && $from_email !== '') {
                $mail->Sender = $from_email;
            }
        } catch (\PHPMailer\PHPMailer\Exception $e) {
            return new \WP_Error(
                'mail_build_failed',
                /* translators: %s: message-assembly error */
                sprintf(__('Failed to assemble email: %s', 'kelune-crm'), $e->getMessage())
            );
        }

        return $mail;
    }

    /**
     * Normalise a recipient value into [['email' => …, 'name' => …], …].
     *
     * Accepts a single email string, a "Name <email>" string, a list of either,
     * or a list of ['email' => …, 'name' => …] / [email, name] tuples.
     *
     * @param mixed $value
     * @return array<int, array{email: string, name: string}>
     */
    private function normalizeAddresses($value): array
    {
        if (is_string($value)) {
            $value = $value === '' ? [] : [$value];
        }
        if (!is_array($value)) {
            return [];
        }

        $out = [];
        foreach ($value as $entry) {
            $name = '';
            $email = '';
            if (is_string($entry)) {
                $email = trim($entry);
                if (preg_match('/^(.*?)<(.+?)>\s*$/', $entry, $m)) {
                    $name = trim(trim($m[1]), '"');
                    $email = trim($m[2]);
                }
            } elseif (is_array($entry)) {
                $email = trim((string) ($entry['email'] ?? $entry[0] ?? ''));
                $name = trim((string) ($entry['name'] ?? $entry[1] ?? ''));
            }
            if ($email !== '') {
                $out[] = ['email' => $email, 'name' => $name];
            }
        }

        return $out;
    }

    /**
     * Derive a plain-text alternative from an HTML body so every message carries
     * a text/plain part (better deliverability, fewer spam flags).
     */
    private function htmlToText(string $html): string
    {
        $text = preg_replace('/<(script|style)\b[^>]*>.*?<\/\1>/is', '', $html);
        $text = str_ireplace(['</p>', '<br>', '<br/>', '<br />'], "\n", (string) $text);

        return trim(wp_strip_all_tags((string) $text));
    }

    /**
     * Queue campaign emails for sending
     */
    public function queueCampaign(int $campaign_id): \WP_Error|int
    {
        $campaign = $this->campaignRepository->find($campaign_id);

        if (!$campaign) {
            return new \WP_Error('invalid_campaign', __('Campaign not found', 'kelune-crm'));
        }

        // Get recipient contact IDs
        $contact_ids = $this->getRecipientContactIds($campaign);

        if (empty($contact_ids)) {
            return new \WP_Error('no_recipients', __('No recipients found for this campaign', 'kelune-crm'));
        }

        // Resolved From line for the queue log, mirroring dispatch()'s cascade
        // (custom → provider → Global Email). In Global/Custom modes the provider
        // is null and the Global Email identity is used.
        $queue_provider = $this->resolveProvider($campaign->email_provider_id);
        $log_from_name = $this->firstNonEmpty(
            (string) $campaign->from_name,
            $queue_provider ? (string) $queue_provider->sender_name : '',
            $this->settingsService->getString('email_from_name')
        );
        $log_from_email = $this->firstNonEmpty(
            (string) $campaign->from_email,
            $queue_provider ? (string) $queue_provider->sender_email : '',
            $this->settingsService->getString('email_from_email')
        );
        $log_from = trim($log_from_name . ' <' . $log_from_email . '>');

        // Queue emails
        $queued = 0;
        foreach ($contact_ids as $contact_id) {
            $contact = $this->getContact((int) $contact_id);

            if (!$contact || empty($contact['email'])) {
                continue;
            }

            // Check if already queued
            $exists = $this->db->get_var(
                $this->db->prepare(
                    "SELECT id FROM {$this->campaignEmailsTable} WHERE campaign_id = %d AND contact_id = %d",
                    $campaign_id,
                    $contact_id
                )
            );

            if ($exists) {
                continue;
            }

            // Generate tracking token
            $tracking_token = $this->generateTrackingToken((int) $campaign_id, (int) $contact_id);

            $result = $this->db->insert(
                $this->campaignEmailsTable,
                [
                    'campaign_id' => $campaign_id,
                    'contact_id' => $contact_id,
                    'email' => $contact['email'],
                    'status' => 'queued',
                    'tracking_token' => $tracking_token,
                    'created_at' => current_time('mysql', true),
                ]
            );

            if ($result) {
                $queued++;

                // Log to unified email_logs table
                $this->emailLogService->logEmailQueued([
                    'email_type' => 'campaign',
                    'campaign_id' => $campaign_id,
                    'contact_id' => $contact_id,
                    'email_to' => $contact['email'],
                    'email_from' => $log_from,
                    'subject' => $campaign->subject,
                    'body_html' => $campaign->email_content,
                    'tracking_token' => $tracking_token,
                    'metadata' => json_encode([
                        'campaign_name' => $campaign->name,
                        'campaign_email_id' => $this->db->insert_id,
                    ]),
                ]);
            }
        }

        // Update campaign status
        if ($queued > 0) {
            $this->campaignRepository->update($campaign_id, [
                'status' => 'sending',
            ]);
        }

        return $queued;
    }

    /**
     * Send a single campaign email
     *
     * @param int $campaign_email_id
     * @return bool|\WP_Error
     */
    public function sendCampaignEmail($campaign_email_id)
    {
        $email = $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->campaignEmailsTable} WHERE id = %d",
                $campaign_email_id
            ),
            ARRAY_A
        );

        if (!$email) {
            return new \WP_Error('invalid_email', __('Campaign email not found', 'kelune-crm'));
        }

        $campaign = $this->campaignRepository->find($email['campaign_id']);
        $contact = $this->getContact($email['contact_id']);

        if (!$campaign || !$contact) {
            return new \WP_Error('invalid_data', __('Campaign or contact not found', 'kelune-crm'));
        }

        // Re-check consent at send time, not just when the queue row was built.
        // A contact can unsubscribe (or bounce) between being queued and being
        // sent, and the recipient query that gated the enqueue ran long ago —
        // this is the check that actually guarantees we honour it. Cancel the
        // row rather than delete it, so the campaign keeps an audit trail.
        if (!Contact::isSendableStatus($contact['status'] ?? null)) {
            $this->db->update(
                $this->campaignEmailsTable,
                [
                    'status' => 'cancelled',
                    'error_message' => sprintf(
                        /* translators: %s: contact status, e.g. unsubscribed */
                        __('Not sent: the contact is %s.', 'kelune-crm'),
                        (string) ($contact['status'] ?? '')
                    ),
                    'updated_at' => current_time('mysql', true),
                ],
                ['id' => $campaign_email_id]
            );

            $email_log = $this->emailLogService->getByTrackingToken($email['tracking_token']);
            if ($email_log) {
                $this->emailLogService->logEmailCancelled(
                    (int) $email_log->id,
                    (string) ($contact['status'] ?? '')
                );
            }

            return new \WP_Error(
                'contact_not_sendable',
                sprintf(
                    /* translators: 1: contact ID, 2: contact status */
                    __('Contact %1$d is not mailable (status: %2$s)', 'kelune-crm'),
                    (int) $email['contact_id'],
                    (string) ($contact['status'] ?? '')
                )
            );
        }

        // Append the global footer before personalizing so its merge tags —
        // {{business_name}}, {{unsubscribe_url}} — resolve in the same pass as
        // the body's.
        $content = $this->appendGlobalFooter((string) $campaign->email_content);

        // Personalize email content
        $subject = wp_strip_all_tags($this->personalize($campaign->subject, $contact));
        $content = $this->personalize($content, $contact);

        // Inbox preview text: hidden preheader at the top of the body so clients
        // show it after the subject instead of the first visible line.
        $preheader = wp_strip_all_tags($this->personalize((string) $campaign->preview_text, $contact));
        $content = $this->injectPreheader($content, $preheader);

        // Resolve the unsubscribe merge tag to the public tracking endpoint.
        // Done before injectTracking() so the link-tracker skips it (already a
        // campaigns/track URL) instead of wrapping it in a click redirect.
        $content = str_replace(
            '{{unsubscribe_url}}',
            esc_url($this->getUnsubscribeUrl($email['tracking_token'])),
            $content
        );

        // Inject tracking pixel and replace links
        $content = $this->injectTracking($content, $email['tracking_token'], (int) $campaign->id);

        // Resolve the sending connection. Only an explicitly chosen provider
        // ("Email Provider" mode) sends through its driver; "Global Email" and
        // "Custom" modes leave email_provider_id empty and go out via wp_mail
        // (see resolveProvider). The campaign's from_email/name are the custom
        // From override; when empty the wp_mail path uses the Global Email
        // identity from Settings.
        $provider = $this->resolveProvider($campaign->email_provider_id);
        $sent = $this->dispatch(
            $provider,
            $contact['email'],
            $subject,
            $content,
            (string) $campaign->from_name,
            (string) $campaign->from_email,
            (string) $campaign->reply_to
        );

        // Update email status. Treat only an explicit non-error success as sent;
        // a stray false/null from a misbehaving provider must not log as sent.
        if (!is_wp_error($sent) && $sent) {
            $this->db->update(
                $this->campaignEmailsTable,
                [
                    'status' => 'sent',
                    'sent_at' => current_time('mysql', true),
                    'updated_at' => current_time('mysql', true),
                ],
                ['id' => $campaign_email_id]
            );

            // Update email_logs status
            $email_log = $this->emailLogService->getByTrackingToken($email['tracking_token']);
            if ($email_log) {
                $provider_name = $provider ? $provider->provider_type : 'wp_mail';
                $this->emailLogService->logEmailSent((int) $email_log->id, $provider_name);
            }

            return true;
        } else {
            // Extract detailed error information
            $error_message = $this->getDetailedErrorMessage($sent);

            $this->db->update(
                $this->campaignEmailsTable,
                [
                    'status' => 'failed',
                    'error_message' => $error_message,
                    'updated_at' => current_time('mysql', true),
                ],
                ['id' => $campaign_email_id]
            );

            // Update email_logs status
            $email_log = $this->emailLogService->getByTrackingToken($email['tracking_token']);
            if ($email_log) {
                $this->emailLogService->logEmailFailed((int) $email_log->id, $error_message);
            }

            // Return original WP_Error with all details preserved
            return $sent;
        }
    }

    /**
     * Send test email
     *
     * @param int $campaign_id
     * @param string $test_email
     * @return bool|\WP_Error
     */
    public function sendTestEmail($campaign_id, $test_email)
    {
        $campaign = $this->campaignRepository->find($campaign_id);

        if (!$campaign) {
            return new \WP_Error('invalid_campaign', __('Campaign not found', 'kelune-crm'));
        }

        if (!is_email($test_email)) {
            return new \WP_Error('invalid_email', __('Invalid email address', 'kelune-crm'));
        }

        if ($this->isAddressSuppressed((string) $test_email)) {
            return new \WP_Error(
                'contact_not_sendable',
                __('That address belongs to a contact who is not accepting email.', 'kelune-crm')
            );
        }

        // Use dummy contact data for testing
        $dummy_contact = [
            'email' => $test_email,
            'first_name' => 'Test',
            'last_name' => 'User',
            'id' => 0,
        ];

        // Carry the global footer exactly like a real send: append before the
        // personalize pass so its business tags resolve alongside the body's.
        $subject = $this->personalize($campaign->subject, $dummy_contact);
        $content = $this->appendGlobalFooter((string) $campaign->email_content);
        $content = $this->personalize($content, $dummy_contact);
        $content = $this->injectPreheader(
            $content,
            wp_strip_all_tags($this->personalize((string) $campaign->preview_text, $dummy_contact))
        );

        // A test send has no tracking token, so point the footer's unsubscribe
        // link at the site home instead of shipping the tag raw.
        $content = str_replace('{{unsubscribe_url}}', esc_url(home_url('/')), $content);

        // Resolve sending connection the same way a real send does.
        $provider = $this->resolveProvider($campaign->email_provider_id);

        // Resolved From for the log line, mirroring dispatch()'s cascade:
        // custom override → provider sender → Global Email default.
        $log_from_email = $this->firstNonEmpty(
            (string) $campaign->from_email,
            $provider ? (string) $provider->sender_email : '',
            $this->settingsService->getString('email_from_email')
        );
        $log_from_name = $this->firstNonEmpty(
            (string) $campaign->from_name,
            $provider ? (string) $provider->sender_name : '',
            $this->settingsService->getString('email_from_name')
        );

        /* translators: %s: email subject line */
        $test_subject = sprintf(__('[TEST] %s', 'kelune-crm'), $subject);

        // Log test email to email_logs
        $log_id = $this->emailLogService->logEmailQueued([
            'email_type' => 'test',
            'campaign_id' => $campaign_id,
            'email_to' => $test_email,
            'email_from' => trim($log_from_name . ' <' . $log_from_email . '>'),
            'subject' => $test_subject,
            'body_html' => $content,
            'metadata' => json_encode([
                'campaign_name' => $campaign->name,
                'test_email' => true,
            ]),
        ]);

        $sent = $this->dispatch(
            $provider,
            $test_email,
            $test_subject,
            $content,
            (string) $campaign->from_name,
            (string) $campaign->from_email,
            (string) $campaign->reply_to
        );

        // Update log status based on send result
        if (is_wp_error($sent)) {
            $provider_name = $this->getProviderDisplayName($provider ? $provider->provider_type : 'wp_mail');
            $detailed_message = $this->getDetailedErrorMessage($sent, $provider_name);

            // Log as failed
            if ($log_id) {
                $this->emailLogService->logEmailFailed($log_id, $detailed_message);
            }

            return new \WP_Error(
                $sent->get_error_code(),
                $detailed_message,
                [
                    'provider' => $provider_name,
                    'original_message' => $sent->get_error_message(),
                    'error_code' => $sent->get_error_code(),
                    'error_data' => $sent->get_error_data(),
                ]
            );
        } else {
            // Log as sent
            if ($log_id) {
                $this->emailLogService->logEmailSent($log_id, $provider ? $provider->provider_type : 'wp_mail');
            }
        }

        return $sent;
    }

    /**
     * Process campaign send queue
     *
     * @param int $limit
     * @return array{sent: int, failed: int, has_more: bool}
     */
    public function processQueue($limit = 100): array
    {
        $emails = $this->db->get_results(
            $this->db->prepare(
                "SELECT id FROM {$this->campaignEmailsTable}
                WHERE status = 'queued'
                ORDER BY created_at ASC
                LIMIT %d",
                $limit
            ),
            ARRAY_A
        ) ?: [];

        $sent = 0;
        $failed = 0;

        $interval = (int) (1000000 / self::EMAILS_PER_SECOND);

        foreach ($emails as $email) {
            $started = microtime(true);

            // Claim the row before sending it. The batch above is a plain read,
            // so two overlapping cron runs (or a manual trigger racing cron)
            // select the same rows; without this the same contact receives the
            // campaign twice. The UPDATE is the synchronisation point: it names
            // the status it expects, so exactly one worker can flip a given row
            // out of 'queued', and the loser skips it.
            if (!$this->claimQueuedEmail((int) $email['id'])) {
                continue;
            }

            $result = $this->sendCampaignEmail($email['id']);

            if (is_wp_error($result)) {
                $failed++;
            } else {
                $sent++;
            }

            // Sleep only the remainder of the interval: a flat sleep would
            // stack on top of the send latency and quietly halve the real rate.
            // max(0) because microtime() is wall-clock: an NTP step backwards
            // would otherwise turn the remainder into a very long sleep.
            $elapsed = max(0, (int) ((microtime(true) - $started) * 1000000));

            if ($elapsed < $interval) {
                usleep($interval - $elapsed);
            }
        }

        return [
            'sent' => $sent,
            'failed' => $failed,
            // Whether more queued emails remain for the drain loop to pick up on
            // the next pass (so a large campaign flushes in one run rather than
            // 100 emails per cron minute).
            'has_more' => $this->hasQueuedEmails(),
        ];
    }

    /**
     * Whether any campaign email is still waiting to be sent.
     */
    public function hasQueuedEmails(): bool
    {
        $exists = $this->db->get_var(
            "SELECT 1 FROM {$this->campaignEmailsTable} WHERE status = 'queued' LIMIT 1"
        );

        return null !== $exists;
    }

    /**
     * Take ownership of a queued campaign email.
     *
     * @return bool True when this worker claimed the row, false when another
     *              already did (or the sweeper cancelled it in the meantime).
     */
    private function claimQueuedEmail(int $campaign_email_id): bool
    {
        $claimed = $this->db->update(
            $this->campaignEmailsTable,
            [
                'status' => 'sending',
                'updated_at' => current_time('mysql', true),
            ],
            [
                'id' => $campaign_email_id,
                'status' => 'queued',
            ]
        );

        return 1 === $claimed;
    }

    /**
     * Track email open
     *
     * @param string $tracking_token
     * @param string $user_agent
     * @param string $ip_address
     */
    public function trackOpen($tracking_token, $user_agent = '', $ip_address = ''): bool
    {
        $email = $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->campaignEmailsTable} WHERE tracking_token = %s",
                $tracking_token
            ),
            ARRAY_A
        );

        if (!$email) {
            return false;
        }

        $update_data = [
            'open_count' => $email['open_count'] + 1,
            'updated_at' => current_time('mysql', true),
        ];

        // Record first open. The engagement event + hook fire here too, once, so
        // the email-opened automation condition/trigger see a campaign open the
        // same way they see an automation-email open.
        if (empty($email['opened_at'])) {
            $update_data['opened_at'] = current_time('mysql', true);

            if (!empty($email['contact_id'])) {
                $this->emailLogService->recordEmailEngagement('email_opened', (int) $email['contact_id'], [
                    'campaign_id' => !empty($email['campaign_id']) ? (int) $email['campaign_id'] : null,
                    'email_id' => (int) $email['id'],
                ]);
            }
        }

        // Update user agent and IP on first open, deriving device/browser/os
        // so analytics can break opens down without an external dependency.
        if (empty($email['user_agent']) && !empty($user_agent)) {
            $update_data['user_agent'] = $user_agent;
            $parsed = $this->parseUserAgent($user_agent);
            $update_data['device_type'] = $parsed['device_type'];
            $update_data['browser'] = $parsed['browser'];
            $update_data['os'] = $parsed['os'];
        }

        if (empty($email['ip_address']) && !empty($ip_address)) {
            $update_data['ip_address'] = $ip_address;
        }

        $this->db->update(
            $this->campaignEmailsTable,
            $update_data,
            ['id' => $email['id']]
        );

        return true;
    }

    /**
     * Derive device type, browser and OS from a user-agent string.
     *
     * Lightweight substring matching — good enough for aggregate analytics
     * and avoids bundling a heavy UA-parsing library.
     *
     * @return array{device_type: string, browser: string, os: string}
     */
    private function parseUserAgent(string $user_agent): array
    {
        $ua = strtolower($user_agent);

        $device_type = 'desktop';
        if (preg_match('/tablet|ipad|playbook|silk/', $ua) || (strpos($ua, 'android') !== false && strpos($ua, 'mobile') === false)) {
            $device_type = 'tablet';
        } elseif (preg_match('/mobile|iphone|ipod|blackberry|opera mini|iemobile/', $ua)) {
            $device_type = 'mobile';
        }

        $browser = 'Other';
        $browser_map = [
            'edg' => 'Edge',
            'opr' => 'Opera',
            'opera' => 'Opera',
            'chrome' => 'Chrome',
            'safari' => 'Safari',
            'firefox' => 'Firefox',
            'msie' => 'Internet Explorer',
            'trident' => 'Internet Explorer',
        ];
        foreach ($browser_map as $needle => $label) {
            if (strpos($ua, $needle) !== false) {
                $browser = $label;
                break;
            }
        }

        $os = 'Other';
        $os_map = [
            'windows' => 'Windows',
            'iphone' => 'iOS',
            'ipad' => 'iOS',
            'mac os' => 'macOS',
            'android' => 'Android',
            'linux' => 'Linux',
        ];
        foreach ($os_map as $needle => $label) {
            if (strpos($ua, $needle) !== false) {
                $os = $label;
                break;
            }
        }

        return ['device_type' => $device_type, 'browser' => $browser, 'os' => $os];
    }

    /**
     * Track link click
     *
     * @param string $tracking_token
     * @param int $link_id
     */
    public function trackClick($tracking_token, $link_id): bool
    {
        $email = $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->campaignEmailsTable} WHERE tracking_token = %s",
                $tracking_token
            ),
            ARRAY_A
        );

        if (!$email) {
            return false;
        }

        $update_data = [
            'click_count' => $email['click_count'] + 1,
            'updated_at' => current_time('mysql', true),
        ];

        // Record first click. Engagement event + hook fire here, once.
        if (empty($email['clicked_at'])) {
            $update_data['clicked_at'] = current_time('mysql', true);

            if (!empty($email['contact_id'])) {
                $this->emailLogService->recordEmailEngagement('email_clicked', (int) $email['contact_id'], [
                    'campaign_id' => !empty($email['campaign_id']) ? (int) $email['campaign_id'] : null,
                    'email_id' => (int) $email['id'],
                    'link_url' => $this->resolveCampaignLinkUrl($link_id),
                ]);
            }
        }

        $this->db->update(
            $this->campaignEmailsTable,
            $update_data,
            ['id' => $email['id']]
        );

        // Update link stats
        $this->db->query(
            $this->db->prepare(
                "UPDATE {$this->campaignLinksTable}
                SET total_clicks = total_clicks + 1,
                    unique_clicks = (
                        SELECT COUNT(DISTINCT contact_id)
                        FROM {$this->campaignEmailsTable}
                        WHERE campaign_id = %d AND clicked_at IS NOT NULL
                    )
                WHERE id = %d",
                $email['campaign_id'],
                $link_id
            ) ?: ''
        );

        return true;
    }

    /**
     * Get recipient contact IDs based on campaign targeting
     *
     * @param \KeluneCRM\Models\Campaign $campaign
     * @return array<int, int|string>
     */
    private function getRecipientContactIds($campaign)
    {
        return $this->campaignRepository->getRecipientIds(
            $campaign->getTargetSegmentsArray(),
            $campaign->getTargetListsArray(),
            $campaign->getTargetTagsArray(),
            $campaign->getExcludeSegmentsArray(),
            $campaign->getExcludeListsArray(),
            $campaign->getExcludeTagsArray()
        );
    }

    /**
     * Whether an address belongs to a contact who may not receive marketing
     * email.
     *
     * Test and preview sends take a free-typed address rather than a contact,
     * so the send-time gate — which reads a contact row — cannot see them. An
     * admin typing an unsubscribed person's address into the test field would
     * otherwise deliver campaign content to someone who opted out. Addresses
     * that match no contact are not suppressed: sending yourself a preview at
     * an address the CRM has never heard of is the normal case.
     */
    public function isAddressSuppressed(string $email): bool
    {
        $status = $this->db->get_var(
            $this->db->prepare(
                "SELECT status FROM {$this->contactsTable} WHERE email = %s",
                $email
            )
        );

        if (null === $status) {
            return false;
        }

        return !Contact::isSendableStatus((string) $status);
    }

    /**
     * @param int $contact_id
     * @return array<string, mixed>|null
     */
    private function getContact($contact_id)
    {
        return $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->contactsTable} WHERE id = %d",
                $contact_id
            ),
            ARRAY_A
        );
    }

    /**
     * Personalize content with contact data
     *
     * @param string|null $content
     * @param array<string, mixed> $contact
     * @return string
     */
    private function personalize($content, $contact): string
    {
        return $this->mergeTagService->render($content, $contact);
    }

    /**
     * The site-wide footer content (the author's `<p>` markup, `margin:0` forced
     * inline), merge tags not yet resolved. No wrapper — callers place it: the
     * builder document supplies its own styled wrapper around the GLOBAL_FOOTER
     * marker, while the fragment path wraps it in buildGlobalFooterHtml().
     *
     * Returns '' when no footer is configured.
     */
    private function globalFooterContent(): string
    {
        $footer = trim($this->settingsService->getString('email_footer_html'));
        if ($footer === '') {
            return '';
        }

        // Force margin:0 on every paragraph inline — email clients ignore a
        // stylesheet block, so the reset has to live on each paragraph itself.
        return (string) preg_replace_callback(
            '/<p\b([^>]*)>/i',
            static function (array $m): string {
                if (preg_match('/\bstyle\s*=\s*(["\'])(.*?)\1/i', $m[1], $style)) {
                    return '<p' . str_replace(
                        $style[0],
                        'style="margin:0;' . $style[2] . '"',
                        $m[1]
                    ) . '>';
                }

                return '<p style="margin:0;"' . $m[1] . '>';
            },
            $footer
        );
    }

    /**
     * The site-wide footer wrapped in its own full-width block (font/colour), for
     * the fragment splice path. Merge tags not yet resolved. Returns '' when no
     * footer is configured.
     */
    private function buildGlobalFooterHtml(): string
    {
        $footer = $this->globalFooterContent();
        if ($footer === '') {
            return '';
        }

        // The inner footer block, full-width. Alignment is left to the footer
        // editor's own content (no align="center" here); width and outer padding
        // are decided per-body by spliceFooter().
        $html = '<table width="100%" cellpadding="0" cellspacing="0" role="presentation">'
            . '<tr><td style="font-family: Arial, sans-serif; '
            . 'font-size: 14px; line-height: 1.6; color: #888888;">'
            . $footer
            . '</td></tr></table>';

        /**
         * Filter the rendered global email footer.
         *
         * @param string $html Footer markup, merge tags not yet resolved.
         */
        return (string) apply_filters('kelune_crm_email_footer_html', $html);
    }

    /**
     * Splice footer markup into a body, sizing and placing it to match the email.
     *
     * A visual-builder body is a full HTML document whose centered "Main" column
     * (page padding) holds the content "Container". The footer drops inside Main,
     * just below the Container, constrained to the content width so it lines up
     * under the content and shares the page background + padding. Rich-text /
     * HTML / plain-text bodies are fragments: the footer is appended full-width.
     */
    private function spliceFooter(string $content, string $html): string
    {
        if ($html === '') {
            return $content;
        }

        // The Main column closes with `</td></tr></table></body>`; that </td> is
        // Main's own cell, so inserting before it puts the footer inside Main,
        // right after the Container table. Anchored to </body> so it matches only
        // the document's outermost close, never a nested block table.
        if (preg_match('/<\/td>\s*<\/tr>\s*<\/table>\s*<\/body>/i', $content, $m, PREG_OFFSET_CAPTURE)) {
            $width = preg_match('/max-width:\s*(\d+)px/i', $content, $w) ? (int) $w[1] : 600;
            // Only a top gap: Main's bottom page padding spaces the footer below.
            $footer = '<table width="' . $width . '" cellpadding="0" cellspacing="0" role="presentation" '
                . 'style="max-width: ' . $width . 'px; width: 100%;"><tr><td style="padding: 20px 0 0 0;">'
                . $html
                . '</td></tr></table>';

            $position = (int) $m[0][1];

            return substr($content, 0, $position) . $footer . substr($content, $position);
        }

        // Fragment body: full-width footer with a top and bottom gap.
        return $content
            . '<table width="100%" cellpadding="0" cellspacing="0" role="presentation">'
            . '<tr><td style="padding: 20px 0;">' . $html . '</td></tr></table>';
    }

    /**
     * Resolve the email footer for a campaign body. Three cases:
     *
     * - Builder document, Global footer: it carries GLOBAL_FOOTER_MARKER inside
     *   its own styled wrapper. Swap the marker for the site-wide footer content
     *   (tags unresolved — the campaign pipeline personalizes the whole body next).
     * - Builder document, Custom footer or footer disabled: the template owns the
     *   footer (already baked, or intentionally absent). Leave the body untouched.
     * - Fragment (rich-text / HTML / plain-text): no builder chrome, so append the
     *   global footer full-width, exactly as before.
     */
    /**
     * Whether $content is a builder-generated document (which owns its footer)
     * rather than a raw fragment (rich-text / HTML / plain-text) that needs the
     * global footer appended. Keys on the builder sentinel — which survives the
     * wp_kses_post applied on save — and falls back to the <!DOCTYPE> for any
     * pre-sanitized or legacy content that still carries it.
     */
    private function isBuilderDocument(string $content): bool
    {
        return strpos($content, EmailHtmlRenderer::EMAIL_DOC_MARKER) !== false
            || stripos($content, '<!doctype') !== false;
    }

    private function appendGlobalFooter(string $content): string
    {
        if (preg_match(self::GLOBAL_FOOTER_MARKER_PATTERN, $content, $m)) {
            $footer = EmailHtmlRenderer::colorizeAnchors($this->globalFooterContent(), $m[1]);
            return str_replace($m[0], $footer, $content);
        }

        if ($this->isBuilderDocument($content)) {
            return $content;
        }

        return $this->spliceFooter($content, $this->buildGlobalFooterHtml());
    }

    /**
     * Resolve the email footer for a non-campaign (automation) body, resolving the
     * footer's own merge tags for $contact — the automation merge-tag pass runs
     * over the step body before this point and does not cover the business /
     * unsubscribe tags, so they are resolved here.
     *
     * Mirrors appendGlobalFooter's three cases; the difference is that the footer
     * (marker replacement, or a baked custom footer inside a builder document) is
     * resolved here rather than by a later pipeline pass.
     *
     * @param array<string, mixed> $contact
     */
    public function appendGlobalFooterFor(string $content, array $contact, string $unsubscribe_url = ''): string
    {
        // An unresolved {{unsubscribe_url}} would ship as literal text, so with
        // no URL to point at, drop the tag rather than render it raw.
        $extra = ['{{unsubscribe_url}}' => $unsubscribe_url !== '' ? esc_url($unsubscribe_url) : ''];

        if (preg_match(self::GLOBAL_FOOTER_MARKER_PATTERN, $content, $m)) {
            $footer = $this->globalFooterContent();
            if ($footer !== '') {
                $footer = EmailHtmlRenderer::colorizeAnchors($footer, $m[1]);
                $footer = $this->mergeTagService->render($footer, $contact, $extra);
            }
            return str_replace($m[0], $footer, $content);
        }

        if ($this->isBuilderDocument($content)) {
            // Builder document with a baked custom footer (or none): resolve the
            // business/unsubscribe tags across the body so a custom footer's tags
            // are filled the same way the marker path fills the global footer.
            return $this->mergeTagService->render($content, $contact, $extra);
        }

        $html = $this->buildGlobalFooterHtml();
        if ($html === '') {
            return $content;
        }
        $html = $this->mergeTagService->render($html, $contact, $extra);

        return $this->spliceFooter($content, $html);
    }

    /**
     * The global footer as it appears in a dashboard preview: the same wrapped
     * markup real emails get, with the business-identity tags resolved from
     * Settings and the unsubscribe link pointed at the site home (a preview has
     * no per-recipient tracking token). Returns '' when no footer is configured.
     */
    public function renderFooterForPreview(): string
    {
        $html = $this->buildGlobalFooterHtml();
        if ($html === '') {
            return '';
        }

        return $this->mergeTagService->render($html, [], [
            '{{unsubscribe_url}}' => esc_url(home_url('/')),
        ]);
    }

    /**
     * The global footer CONTENT (unwrapped `<p>` markup) as it appears in a
     * dashboard preview: business tags resolved, unsubscribe → site home. Unlike
     * renderFooterForPreview() this has no font/colour wrapper, because a builder
     * document supplies its own (template-configured) wrapper around the footer;
     * the dashboard swaps the GLOBAL_FOOTER_MARKER for this. Returns '' when no
     * footer is configured.
     */
    public function renderFooterContentForPreview(): string
    {
        $content = $this->globalFooterContent();
        if ($content === '') {
            return '';
        }

        return $this->mergeTagService->render($content, [], [
            '{{unsubscribe_url}}' => esc_url(home_url('/')),
        ]);
    }

    /**
     * Inject a hidden preheader (inbox preview text) at the top of an email body.
     *
     * Most clients show the first visible text after the subject as the inbox
     * preview. A hidden block placed first overrides that with the author's
     * chosen text; the trailing zero-width spacers stop the client from bleeding
     * the body's real content into the preview after it. Inserted just after the
     * opening <body> tag when present, otherwise prepended. Shared by the
     * campaign send path and the automation send_email action so both resolve
     * preview text the same way.
     */
    public function injectPreheader(string $html, string $preheader): string
    {
        $preheader = trim($preheader);
        if ($preheader === '') {
            return $html;
        }

        $block = '<div style="display:none !important;visibility:hidden;mso-hide:all;'
            . 'font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">'
            . esc_html($preheader)
            . str_repeat('&zwnj;&nbsp;', 20)
            . '</div>';

        if (preg_match('/<body\b[^>]*>/i', $html, $matches, PREG_OFFSET_CAPTURE)) {
            $offset = (int) $matches[0][1] + strlen((string) $matches[0][0]);
            return substr($html, 0, $offset) . $block . substr($html, $offset);
        }

        return $block . $html;
    }

    /**
     * Send a test of an automation send_email step to a typed address, using the
     * step's live (possibly unsaved) config. No contact row is touched (the step
     * need not be persisted), but the send is written to email_logs as a test
     * (email_type='test') so it shows Type=Test in Email Logs, exactly like the
     * campaign wizard's Send Test.
     *
     * @param array<string, mixed> $config Sanitized send_email action_config.
     * @return bool|\WP_Error
     */
    public function sendStepTestEmail(array $config, string $test_email)
    {
        if (!is_email($test_email)) {
            return new \WP_Error('invalid_email', __('Invalid email address', 'kelune-crm'));
        }

        if ($this->isAddressSuppressed($test_email)) {
            return new \WP_Error(
                'contact_not_sendable',
                __('That address belongs to a contact who is not accepting email.', 'kelune-crm')
            );
        }

        // Dummy contact so merge tags resolve to something in the preview.
        $dummy_contact = [
            'email' => $test_email,
            'first_name' => 'Test',
            'last_name' => 'User',
            'id' => 0,
        ];

        $subject = wp_strip_all_tags($this->personalize((string) ($config['subject'] ?? ''), $dummy_contact));
        if ($subject === '') {
            $subject = __('Automated Email', 'kelune-crm');
        }

        $content = $this->personalize((string) ($config['body'] ?? ''), $dummy_contact);
        $content = $this->injectPreheader(
            $content,
            wp_strip_all_tags($this->personalize((string) ($config['preview_text'] ?? ''), $dummy_contact))
        );

        // Automation email carries the global footer; mirror the real step send.
        // No tracking token in a test, so point unsubscribe at the site home so
        // the link renders instead of the tag being dropped.
        $content = $this->appendGlobalFooterFor($content, $dummy_contact, home_url('/'));

        // Resolve the sending connection exactly like a real step send: only an
        // explicitly chosen provider sends through its driver; otherwise wp_mail
        // with the custom / Global Email From identity.
        $provider_id = !empty($config['email_provider_id']) ? (int) $config['email_provider_id'] : null;
        $provider = $this->resolveProvider($provider_id);

        /* translators: %s: email subject line */
        $test_subject = sprintf(__('[TEST] %s', 'kelune-crm'), $subject);

        // Resolved From for the log line, mirroring dispatch()'s cascade:
        // custom override → provider sender → Global Email default.
        $log_from_email = $this->firstNonEmpty(
            (string) ($config['from_email'] ?? ''),
            $provider ? (string) $provider->sender_email : '',
            $this->settingsService->getString('email_from_email')
        );
        $log_from_name = $this->firstNonEmpty(
            (string) ($config['from_name'] ?? ''),
            $provider ? (string) $provider->sender_name : '',
            $this->settingsService->getString('email_from_name')
        );

        // Log as a test send so it shows Type=Test in Email Logs, matching the
        // campaign wizard's Send Test (sendTestEmail()).
        $log_id = $this->emailLogService->logEmailQueued([
            'email_type' => 'test',
            'email_to' => $test_email,
            'email_from' => trim($log_from_name . ' <' . $log_from_email . '>'),
            'subject' => $test_subject,
            'body_html' => $content,
            'metadata' => json_encode([
                'source' => 'automation_step',
                'test_email' => true,
            ]),
        ]);

        $sent = $this->dispatch(
            $provider,
            $test_email,
            $test_subject,
            $content,
            (string) ($config['from_name'] ?? ''),
            (string) ($config['from_email'] ?? ''),
            (string) ($config['reply_to'] ?? '')
        );

        if (is_wp_error($sent)) {
            $provider_name = $this->getProviderDisplayName($provider ? $provider->provider_type : 'wp_mail');
            $detailed_message = $this->getDetailedErrorMessage($sent, $provider_name);

            if ($log_id) {
                $this->emailLogService->logEmailFailed($log_id, $detailed_message);
            }

            return new \WP_Error(
                $sent->get_error_code(),
                $detailed_message
            );
        }

        if ($log_id) {
            $this->emailLogService->logEmailSent($log_id, $provider ? $provider->provider_type : 'wp_mail');
        }

        return $sent;
    }

    /**
     * Public unsubscribe endpoint for an email's tracking token.
     */
    public function unsubscribeUrlFor(string $tracking_token): string
    {
        return $this->getUnsubscribeUrl($tracking_token);
    }

    /**
     * Inject tracking pixel and replace links.
     *
     * Both halves are gated independently by the track_email_opens /
     * track_email_clicks settings. Gating here (rather than at the call site)
     * keeps every campaign send on one honest path.
     *
     * @param string $content
     * @param string $tracking_token
     * @param int $campaign_id
     */
    private function injectTracking($content, $tracking_token, $campaign_id): string
    {
        // Inject tracking pixel
        if ($this->settingsService->isEnabled('track_email_opens')) {
            $tracking_pixel = $this->getTrackingPixelUrl($tracking_token);
            $content .= '<img src="' . esc_url($tracking_pixel) . '" width="1" height="1" alt="" />';
        }

        if (!$this->settingsService->isEnabled('track_email_clicks')) {
            return $content;
        }

        // Replace all links with tracking links
        $content = preg_replace_callback(
            '/<a\s+(?:[^>]*?\s+)?href="([^"]*)"/i',
            function ($matches) use ($tracking_token, $campaign_id): string {
                $original_url = $matches[1];

                // Skip if already a tracking link
                if (strpos($original_url, 'kelune-crm/v1/campaigns/track') !== false) {
                    return $matches[0];
                }

                // Get or create tracking link
                $link_id = $this->getOrCreateTrackingLink($campaign_id, $original_url);
                $tracking_url = $this->getTrackingLinkUrl($tracking_token, $link_id);

                return str_replace($original_url, $tracking_url, $matches[0]);
            },
            $content
        );

        return $content ?? '';
    }

    /**
     * Resolve a tracked link's real destination, for the click engagement event.
     */
    private function resolveCampaignLinkUrl(int $link_id): ?string
    {
        if ($link_id <= 0) {
            return null;
        }

        $url = $this->db->get_var(
            $this->db->prepare(
                "SELECT original_url FROM {$this->campaignLinksTable} WHERE id = %d",
                $link_id
            )
        );

        return $url !== null ? (string) $url : null;
    }

    /**
     * Get or create tracking link
     *
     * @param int $campaign_id
     * @param string $original_url
     */
    private function getOrCreateTrackingLink($campaign_id, string $original_url): int
    {
        $link = $this->db->get_row(
            $this->db->prepare(
                "SELECT * FROM {$this->campaignLinksTable}
                WHERE campaign_id = %d AND original_url = %s",
                $campaign_id,
                $original_url
            ),
            ARRAY_A
        );

        if ($link) {
            return (int) $link['id'];
        }

        $tracking_url = wp_generate_uuid4();

        $this->db->insert(
            $this->campaignLinksTable,
            [
                'campaign_id' => $campaign_id,
                'original_url' => $original_url,
                'tracking_url' => $tracking_url,
                'created_at' => current_time('mysql', true),
            ]
        );

        return (int) $this->db->insert_id;
    }

    /**
     * Generate tracking token
     */
    private function generateTrackingToken(int $campaign_id, int $contact_id): string
    {
        return hash('sha256', $campaign_id . '_' . $contact_id . '_' . time() . '_' . wp_rand());
    }

    /**
     * Get tracking pixel URL
     */
    private function getTrackingPixelUrl(string $tracking_token): string
    {
        return rest_url('kelune-crm/v1/campaigns/track/open/' . $tracking_token);
    }

    /**
     * Get tracking link URL
     */
    private function getTrackingLinkUrl(string $tracking_token, int $link_id): string
    {
        return rest_url('kelune-crm/v1/campaigns/track/click/' . $tracking_token . '/' . $link_id);
    }

    /**
     * Get unsubscribe URL. Points at the public tracking endpoint, which flips
     * the contact to unsubscribed and self-renders a confirmation page.
     */
    private function getUnsubscribeUrl(string $tracking_token): string
    {
        return rest_url('kelune-crm/v1/campaigns/track/unsubscribe/' . $tracking_token);
    }

    /**
     * Get detailed error message from WP_Error
     *
     * @param mixed $error The error object
     * @param string|null $provider_name Provider name (optional, will be detected)
     * @return string Formatted error message
     */
    private function getDetailedErrorMessage($error, $provider_name = null): string
    {
        if (!is_wp_error($error)) {
            return __('Unknown error occurred', 'kelune-crm');
        }

        // Get provider name from settings if not provided
        if (!$provider_name) {
            $settings = get_option('kelune_crm_settings', []);
            $provider_name = $this->getProviderDisplayName($settings['email_provider'] ?? 'wp_mail');
        }

        $error_code = $error->get_error_code();
        $error_message = $error->get_error_message();
        $error_data = $error->get_error_data();

        // Format: "[Provider] error_code: Message"
        $formatted = "[{$provider_name}] {$error_code}: {$error_message}";

        // Append additional data if available
        if ($error_data && is_array($error_data)) {
            $formatted .= ' | Data: ' . json_encode($error_data);
        }

        return $formatted;
    }

    /**
     * Get display name for email provider
     *
     * @param string $provider_key Provider key (smtp, sendgrid, etc.)
     * @return string Display name
     */
    private function getProviderDisplayName($provider_key): string
    {
        $names = [
            'wp_mail' => 'WordPress Mail',
            'smtp' => 'SMTP',
            'sendgrid' => 'SendGrid',
            'mailgun' => 'Mailgun',
            'ses' => 'Amazon SES',
        ];

        return $names[$provider_key] ?? __('Unknown', 'kelune-crm');
    }
}
