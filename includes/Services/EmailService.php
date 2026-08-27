<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Models\Campaign;
use KeluneCRM\Models\Contact;
use KeluneCRM\Models\EmailProvider;
use KeluneCRM\Repositories\CampaignRepository;
use KeluneCRM\Repositories\EmailProviderRepository;
use KeluneCRM\Services\Providers\ProviderFactory;

class EmailService
{
    /**
     * Placeholder a builder document carries in place of the global footer,
     * capturing the template's footer link colour: `<!--kelune-crm:global-footer:COLOR-->`.
     * Swapped for real footer content at send. MUST match the TS twin in
     * utils/emailHtml.ts (globalFooterMarker).
     */
    public const GLOBAL_FOOTER_MARKER_PATTERN = '/<!--kelune-crm:global-footer:(.*?)-->/';

    /**
     * Target outbound send rate, in emails per second.
     *
     * Every provider throttles, and a throttle response arrives as a send
     * failure — which the queue treats as final, never a retry. An unpaced burst
     * therefore drops recipients silently. 10/s keeps margin under the lowest
     * common quota (SES defaults to 14/s).
     */
    private const EMAILS_PER_SECOND = 10;

    /** @var \wpdb */
    private $db;
    private string $campaignsTable;
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
        $this->campaignsTable = $prefix . 'campaigns';
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
     * Only an EXPLICITLY chosen, active provider is used ("Email Provider"
     * mode); otherwise returns null and the send goes through wp_mail (the
     * "Global Email" / "Custom" path). Does NOT fall back to the default
     * provider — that is applied by whatever handles wp_mail, and resolving it
     * here would make "Global Email" mean something different from the rest of
     * the site.
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
     * Sender resolves most-specific-first: the caller's custom From, then the
     * provider's bound sender, then Settings → Global Email — a provider's
     * verified sender must win over a global default it might reject.
     *
     * With an explicit provider the message is assembled once as a PHPMailer
     * instance and the driver only transports it; without one it goes through
     * wp_mail.
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
     * connection. Shared by "Email Provider" sends and by SiteMailerService, so
     * every provider send is built and routed the same way: assembled once as a
     * PHPMailer instance, `phpmailer_init` fired so third-party integrations
     * still see the mailer, then handed to the driver.
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

        // Let phpmailer_init integrations (logging, DKIM, custom headers) act on
        // the message, matching core wp_mail. The driver runs after and wins.
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
            return new \WP_Error('invalid_campaign', __('Campaign not found', 'kelune-crm'), ['status' => 404]);
        }

        // Get recipient contact IDs
        $contact_ids = $this->getRecipientContactIds($campaign);

        /**
         * Filter the contacts this queue pass considers.
         *
         * Queueing is additive — the per-contact dedupe below skips anyone the
         * campaign already holds a row for — so a listener may narrow a pass to
         * part of the audience and queue the rest on a later pass.
         *
         * @param array<int, int|string> $contact_ids
         * @param Campaign               $campaign
         */
        $contact_ids = (array) apply_filters('kelune_crm_campaign_recipient_ids', $contact_ids, $campaign);

        // Targets that resolve to nobody mailable: the caller can fix this, so it
        // is a bad request rather than a server fault.
        if (empty($contact_ids)) {
            return new \WP_Error(
                'no_recipients',
                __('This campaign\'s recipients include no mailable contacts.', 'kelune-crm'),
                ['status' => 400]
            );
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

        /**
         * Filter the A/B variant each contact in this pass is queued under, as a
         * `contact_id => variant_id` map. Resolved once for the whole pass rather
         * than per row, so a listener splits the audience in a single decision.
         *
         * @param array<int, int>        $assignments
         * @param Campaign               $campaign
         * @param array<int, int|string> $contact_ids
         */
        $variant_assignments = (array) apply_filters(
            'kelune_crm_campaign_variant_assignments',
            [],
            $campaign,
            $contact_ids
        );

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

            $variant_id = (int) ($variant_assignments[(int) $contact_id] ?? 0);

            $result = $this->db->insert(
                $this->campaignEmailsTable,
                [
                    'campaign_id' => $campaign_id,
                    'contact_id' => $contact_id,
                    'email' => $contact['email'],
                    'ab_variant_id' => $variant_id > 0 ? $variant_id : null,
                    'status' => 'queued',
                    'tracking_token' => $tracking_token,
                    'created_at' => current_time('mysql', true),
                ]
            );

            if ($result) {
                $queued++;

                $campaign_email_id = (int) $this->db->insert_id;

                // The log records what this row will actually be sent, so it goes
                // through the same part resolution the send does.
                $parts = $this->campaignEmailParts($campaign, [
                    'id' => $campaign_email_id,
                    'campaign_id' => (int) $campaign_id,
                    'contact_id' => (int) $contact_id,
                    'ab_variant_id' => $variant_id > 0 ? $variant_id : null,
                    'email' => $contact['email'],
                    'tracking_token' => $tracking_token,
                    'status' => 'queued',
                ]);

                $row_from = trim(
                    $this->firstNonEmpty($parts['from_name'], $log_from_name)
                    . ' <' . $log_from_email . '>'
                );

                // Log to unified email_logs table
                $this->emailLogService->logEmailQueued([
                    'email_type' => 'campaign',
                    'campaign_id' => $campaign_id,
                    'contact_id' => $contact_id,
                    'email_to' => $contact['email'],
                    'email_from' => $row_from,
                    'subject' => $parts['subject'],
                    'body_html' => $parts['content'],
                    'tracking_token' => $tracking_token,
                    'metadata' => json_encode([
                        'campaign_name' => $campaign->name,
                        'campaign_email_id' => $campaign_email_id,
                    ]),
                ]);
            }
        }

        // Status is not touched here: queueing is what an already-active campaign
        // does, and "sending" is read from the queue rather than stored.
        return $queued;
    }

    /**
     * The subject, body and From name one queue row will be sent with.
     *
     * The campaign's own values, unless a listener overrides them for this row.
     * Both the queue-time log entry and the send read through here, so the logged
     * copy and the delivered copy can never disagree.
     *
     * @param array<string, mixed> $email_row Queue row (campaign_emails).
     * @return array{subject: string, content: string, from_name: string}
     */
    private function campaignEmailParts(Campaign $campaign, array $email_row): array
    {
        $parts = [
            'subject' => (string) $campaign->subject,
            'content' => (string) $campaign->email_content,
            'from_name' => (string) $campaign->from_name,
        ];

        /**
         * Filter the parts of a campaign email for a single queue row.
         *
         * Applied before merge tags, the global footer, the preheader and open/
         * click tracking, so overridden copy still gets all of them.
         *
         * @param array{subject: string, content: string, from_name: string} $parts
         * @param Campaign                                                   $campaign
         * @param array<string, mixed>                                       $email_row
         */
        // Merged over the defaults so a listener returning only the parts it
        // overrides still yields all three.
        $filtered = array_merge(
            $parts,
            (array) apply_filters('kelune_crm_campaign_email_parts', $parts, $campaign, $email_row)
        );

        return [
            'subject' => (string) $filtered['subject'],
            'content' => (string) $filtered['content'],
            'from_name' => (string) $filtered['from_name'],
        ];
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

        // Re-check consent at send time: a contact can unsubscribe between being
        // queued and sent, so this is the check that actually honours it. Cancel
        // the row rather than delete it, to keep an audit trail.
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
                    /* translators: %1$d: contact ID, %2$s: contact status */
                    __('Contact %1$d is not mailable (status: %2$s)', 'kelune-crm'),
                    (int) $email['contact_id'],
                    (string) ($contact['status'] ?? '')
                )
            );
        }

        $parts = $this->campaignEmailParts($campaign, $email);

        // Append the global footer before personalizing so its merge tags —
        // {{business_name}}, {{unsubscribe_url}} — resolve in the same pass as
        // the body's.
        $content = $this->appendGlobalFooter($parts['content']);

        // Personalize email content
        $subject = wp_strip_all_tags($this->personalize($parts['subject'], $contact));
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

        // Only an explicitly chosen provider sends through its driver; "Global
        // Email" and "Custom" leave email_provider_id empty and go via wp_mail.
        // The campaign's from_email/name are the custom From override.
        $provider = $this->resolveProvider($campaign->email_provider_id);
        $sent = $this->dispatch(
            $provider,
            $contact['email'],
            $subject,
            $content,
            $parts['from_name'],
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
        // Joined to the campaign so pausing actually stops a send in flight: a
        // held campaign's rows stay 'queued' and are skipped until it is active
        // again, which is what makes pause resumable rather than cosmetic.
        $emails = $this->db->get_results(
            $this->db->prepare(
                "SELECT ce.id FROM {$this->campaignEmailsTable} ce
                INNER JOIN {$this->campaignsTable} c ON c.id = ce.campaign_id
                WHERE ce.status = 'queued' AND c.status = %s
                ORDER BY ce.created_at ASC
                LIMIT %d",
                Campaign::STATUS_ACTIVE,
                $limit
            ),
            ARRAY_A
        ) ?: [];

        $sent = 0;
        $failed = 0;

        $interval = (int) (1000000 / self::EMAILS_PER_SECOND);

        foreach ($emails as $email) {
            $started = microtime(true);

            // Claim the row first: the batch above is a plain read, so
            // overlapping runs select the same rows. The UPDATE names the status
            // it expects, so exactly one worker flips a row out of 'queued'.
            if (!$this->claimQueuedEmail((int) $email['id'])) {
                continue;
            }

            $result = $this->sendCampaignEmail($email['id']);

            if (is_wp_error($result)) {
                $failed++;
            } else {
                $sent++;
            }

            // Sleep only the remainder, or send latency stacks on top and halves
            // the real rate. max(0) guards an NTP step backwards on wall-clock.
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
     * Whether any campaign email is still waiting to be sent. Rows belonging to a
     * paused campaign do not count — nothing will send them, so treating them as
     * pending work would spin the drain loop.
     */
    public function hasQueuedEmails(): bool
    {
        $exists = $this->db->get_var(
            $this->db->prepare(
                "SELECT 1 FROM {$this->campaignEmailsTable} ce
                INNER JOIN {$this->campaignsTable} c ON c.id = ce.campaign_id
                WHERE ce.status = 'queued' AND c.status = %s
                LIMIT 1",
                Campaign::STATUS_ACTIVE
            )
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

        $now = current_time('mysql', true);
        $email_id = (int) $email['id'];

        // Claim the first open in the statement itself: opens arrive in bursts
        // (an inbox image proxy prefetching, then the recipient), so exactly one
        // caller must win this row or the engagement event fires twice.
        $first_open = 1 === (int) $this->db->query(
            $this->db->prepare(
                "UPDATE {$this->campaignEmailsTable}
                SET opened_at = %s, updated_at = %s
                WHERE id = %d AND opened_at IS NULL",
                $now,
                $now,
                $email_id
            ) ?: ''
        );

        // Counted by the database. Reading the value into PHP and writing it
        // back loses every open but one whenever two arrive together.
        $this->db->query(
            $this->db->prepare(
                "UPDATE {$this->campaignEmailsTable}
                SET open_count = open_count + 1, updated_at = %s
                WHERE id = %d",
                $now,
                $email_id
            ) ?: ''
        );

        // The engagement event + hook fire once, so the email-opened automation
        // condition/trigger see a campaign open the same way they see an
        // automation-email open.
        if ($first_open && !empty($email['contact_id'])) {
            $this->emailLogService->recordEmailEngagement('email_opened', (int) $email['contact_id'], [
                'campaign_id' => !empty($email['campaign_id']) ? (int) $email['campaign_id'] : null,
                'email_id' => $email_id,
            ]);
        }

        // Update user agent and IP on first open, deriving device/browser/os
        // so analytics can break opens down without an external dependency.
        $update_data = [];

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

        if ($update_data !== []) {
            $this->db->update(
                $this->campaignEmailsTable,
                $update_data,
                ['id' => $email_id]
            );
        }

        return true;
    }

    /**
     * Derive device type, browser and OS from a user-agent string.
     *
     * Lightweight substring matching: enough for aggregate analytics without
     * a UA-parsing library.
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

        $now = current_time('mysql', true);
        $email_id = (int) $email['id'];

        // Claim the first click in the statement itself, so concurrent clicks
        // cannot both count as the first one.
        $first_click = 1 === (int) $this->db->query(
            $this->db->prepare(
                "UPDATE {$this->campaignEmailsTable}
                SET clicked_at = %s, updated_at = %s
                WHERE id = %d AND clicked_at IS NULL",
                $now,
                $now,
                $email_id
            ) ?: ''
        );

        // Counted by the database, for the same reason opens are.
        $this->db->query(
            $this->db->prepare(
                "UPDATE {$this->campaignEmailsTable}
                SET click_count = click_count + 1, updated_at = %s
                WHERE id = %d",
                $now,
                $email_id
            ) ?: ''
        );

        // Record first click. Engagement event + hook fire here, once.
        if ($first_click && !empty($email['contact_id'])) {
            $this->emailLogService->recordEmailEngagement('email_clicked', (int) $email['contact_id'], [
                'campaign_id' => !empty($email['campaign_id']) ? (int) $email['campaign_id'] : null,
                'email_id' => $email_id,
                'link_url' => $this->resolveCampaignLinkUrl($link_id),
            ]);
        }

        // Update link stats. Clicks are counted per link, not per recipient:
        // nothing records which contact followed which link, so a per-link
        // unique figure has no source to come from.
        $this->db->query(
            $this->db->prepare(
                "UPDATE {$this->campaignLinksTable}
                SET total_clicks = total_clicks + 1
                WHERE id = %d",
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
     * Test and preview sends take a free-typed address, which the send-time
     * gate (it reads a contact row) cannot see — without this an admin could
     * mail campaign content to someone who opted out. Addresses matching no
     * contact are not suppressed; previewing to an unknown address is normal.
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
     * Site-wide footer content (author's `<p>` markup, `margin:0` forced
     * inline), merge tags unresolved and no wrapper — callers place it. Returns
     * '' when no footer is configured.
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
     * A builder body is a document whose centered "Main" column holds the
     * content "Container"; the footer drops inside Main just below it, width-
     * constrained so it lines up and shares the page background. Fragments
     * (rich-text / HTML / plain-text) get the footer appended full-width.
     */
    private function spliceFooter(string $content, string $html): string
    {
        if ($html === '') {
            return $content;
        }

        // Main closes with `</td></tr></table></body>`; inserting before that
        // </td> puts the footer inside Main. Anchored to </body> so it matches
        // only the outermost close, never a nested block table.
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
     * Whether $content is a builder document (owns its footer) rather than a
     * fragment that needs the global footer appended. Keys on the builder
     * sentinel, which survives the wp_kses_post applied on save; the <!DOCTYPE>
     * fallback covers pre-sanitized content.
     */
    private function isBuilderDocument(string $content): bool
    {
        return strpos($content, EmailHtmlRenderer::EMAIL_DOC_MARKER) !== false
            || stripos($content, '<!doctype') !== false;
    }

    /**
     * Resolve the footer for a campaign body: swap GLOBAL_FOOTER_MARKER for the
     * site-wide footer (tags stay unresolved — the campaign pipeline
     * personalizes the whole body next), leave a builder document that bakes
     * its own footer untouched, and append full-width to a fragment.
     */
    private function appendGlobalFooter(string $content): string
    {
        $content = EmailHtmlRenderer::stripStyleArtifact($content);

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
     * Footer for a non-campaign (automation) body. Mirrors appendGlobalFooter,
     * but resolves the footer's own merge tags for $contact here — the
     * automation merge-tag pass covers the step body only, not the business /
     * unsubscribe tags.
     *
     * @param array<string, mixed> $contact
     */
    public function appendGlobalFooterFor(string $content, array $contact, string $unsubscribe_url = ''): string
    {
        // An unresolved {{unsubscribe_url}} would ship as literal text, so with
        // no URL to point at, drop the tag rather than render it raw.
        $extra = ['{{unsubscribe_url}}' => $unsubscribe_url !== '' ? esc_url($unsubscribe_url) : ''];

        $content = EmailHtmlRenderer::stripStyleArtifact($content);

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
     * Global footer as a dashboard preview shows it: the wrapped markup real
     * emails get, business tags resolved, unsubscribe pointed at the site home
     * (a preview has no tracking token). Returns '' when none is configured.
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
     * Global footer CONTENT (unwrapped `<p>` markup) for a dashboard preview.
     * No font/colour wrapper, unlike renderFooterForPreview() — a builder
     * document supplies its own around the marker it swaps for this. Returns ''
     * when no footer is configured.
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
     * Clients show the first visible text after the subject as the inbox
     * preview; a hidden block placed first overrides that, and the trailing
     * zero-width spacers stop real body content bleeding in after it. Inserted
     * after the opening <body> when present, otherwise prepended.
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
     * Send a test of an automation send_email step to a typed address using the
     * step's live (possibly unsaved) config. Touches no contact row, but logs to
     * email_logs with email_type='test' so it reads Type=Test in Email Logs.
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
     * Both halves gate independently on track_email_opens / track_email_clicks.
     * Gating here rather than at the call site keeps every send on one path.
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
