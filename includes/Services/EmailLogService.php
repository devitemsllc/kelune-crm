<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Models\Contact;
use KeluneCRM\Models\EmailLog;
use KeluneCRM\Repositories\ContactRepository;
use KeluneCRM\Repositories\EmailLogRepository;

/**
 * Business logic for email logging and tracking.
 */
class EmailLogService
{
    private \KeluneCRM\Repositories\EmailLogRepository $repository;
    private \KeluneCRM\Services\SettingsService $settingsService;

    public function __construct()
    {
        $this->repository = new EmailLogRepository();
        $this->settingsService = new SettingsService();
    }

    /**
     * Log email as queued
     *
     * @param array<string, mixed> $data Email data
     * @return int|false Log ID on success, false on failure
     */
    public function logEmailQueued($data)
    {
        $defaults = [
            'status' => 'queued',
            'queued_at' => current_time('mysql', true),
        ];

        // Generate tracking token if not provided
        if (empty($data['tracking_token'])) {
            $data['tracking_token'] = $this->generateTrackingToken();
        }

        // Ensure metadata is JSON string
        if (isset($data['metadata']) && is_array($data['metadata'])) {
            $data['metadata'] = json_encode($data['metadata']);
        }

        $data = array_merge($defaults, $data);

        return $this->repository->create($data);
    }

    /**
     * Log email as sent
     *
     * @param int $log_id
     * @param string $provider Provider name (smtp, sendgrid, etc.)
     * @return bool
     */
    public function logEmailSent($log_id, $provider = 'wp_mail'): bool
    {
        return $this->repository->updateStatus($log_id, 'sent', [
            'provider' => $provider,
            'sent_at' => current_time('mysql', true),
        ]);
    }

    /**
     * Log email as failed
     *
     * @param int $log_id
     * @param string $error_message
     * @return bool
     */
    public function logEmailFailed($log_id, $error_message): bool
    {
        return $this->repository->updateStatus($log_id, 'failed', [
            'error_message' => $error_message,
        ]);
    }

    /**
     * Log email as cancelled — queued, then withheld at send time because the
     * contact is no longer mailable (unsubscribed, bounced, …).
     *
     * @param int $log_id
     * @param string $contact_status The status that blocked the send.
     * @return bool
     */
    public function logEmailCancelled($log_id, string $contact_status = ''): bool
    {
        return $this->repository->updateStatus($log_id, 'cancelled', [
            'error_message' => sprintf(
                /* translators: %s: contact status, e.g. unsubscribed */
                __('Not sent: the contact is %s.', 'kelune-crm'),
                $contact_status
            ),
        ]);
    }

    /**
     * Log email as opened
     *
     * @param int $log_id
     * @return bool
     */
    public function logEmailOpened($log_id): bool
    {
        // Only the FIRST open fires an engagement event: the pixel loads on
        // every view, but "opened this email" is a one-time fact — re-recording
        // it would spam the events table and re-fire the automation trigger.
        $email_log = $this->repository->find((int) $log_id);
        $is_first_open = $email_log && empty($email_log->opened_at);

        $result = $this->repository->incrementOpenCount($log_id);

        if ($result && $is_first_open && !empty($email_log->contact_id)) {
            $this->recordEmailEngagement('email_opened', (int) $email_log->contact_id, [
                'campaign_id' => $email_log->campaign_id ? (int) $email_log->campaign_id : null,
                'automation_id' => $email_log->automation_id ? (int) $email_log->automation_id : null,
                'email_id' => (int) $log_id,
            ]);
        }

        return $result;
    }

    /**
     * Log email click
     *
     * @param int $log_id
     * @param array<string, mixed> $click_data Click information (url, ip, user_agent, etc.)
     * @return bool
     */
    public function logEmailClicked($log_id, $click_data = []): bool
    {
        $email_log = $this->repository->find((int) $log_id);
        $is_first_click = $email_log && empty($email_log->clicked_at);

        $result = $this->repository->incrementClickCount($log_id);

        // Optionally store click data in metadata
        if ($result && !empty($click_data) && $email_log) {
            $metadata = $email_log->getMetadata();
            $metadata['clicks'] = $metadata['clicks'] ?? [];
            $metadata['clicks'][] = array_merge($click_data, [
                'clicked_at' => current_time('mysql', true),
            ]);

            $this->repository->update($log_id, [
                'metadata' => json_encode($metadata),
            ]);
        }

        if ($result && $is_first_click && !empty($email_log->contact_id)) {
            $this->recordEmailEngagement('email_clicked', (int) $email_log->contact_id, [
                'campaign_id' => $email_log->campaign_id ? (int) $email_log->campaign_id : null,
                'automation_id' => $email_log->automation_id ? (int) $email_log->automation_id : null,
                'email_id' => (int) $log_id,
                'link_url' => isset($click_data['url']) ? (string) $click_data['url'] : null,
            ]);
        }

        return $result;
    }

    /**
     * Record an email engagement (open/click) as a contact event AND announce it.
     *
     * The single place both halves learn about engagement: a row in the events
     * table (read by `ConditionEvaluator` for the email_opened / email_clicked
     * conditions) and the `kelune_crm_email_opened` / `_clicked` hooks (which
     * Pro enrols contacts on). Called from both send paths, so an open is an
     * open whichever mailer produced it.
     *
     * @param 'email_opened'|'email_clicked' $event_type
     * @param array<string, mixed>           $data campaign_id / automation_id / email_id / link_url
     */
    public function recordEmailEngagement(string $event_type, int $contact_id, array $data = []): void
    {
        if ($contact_id <= 0) {
            return;
        }

        global $wpdb;
        $table = $wpdb->prefix . 'kelune_crm_events';

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API.
        $wpdb->insert($table, [
            'contact_id' => $contact_id,
            'event_type' => $event_type,
            'event_category' => 'email',
            'event_data' => wp_json_encode($data),
            'created_at' => current_time('mysql', true),
        ]);

        /**
         * Fires when a contact opens or clicks an email.
         *
         * @param int                  $contact_id The contact.
         * @param array<string, mixed> $data       campaign_id / automation_id / email_id / link_url.
         */
        do_action('kelune_crm_' . $event_type, $contact_id, $data);
    }

    /**
     * Generate unique tracking token
     *
     * @return string 64-character unique token
     */
    public function generateTrackingToken(): string
    {
        return 'kelunecrmlt_' . bin2hex(random_bytes(30)); // 12 char prefix + 60 hex = 72 total
    }

    /**
     * Get open tracking pixel URL
     *
     * @param string $token Tracking token
     * @return string
     */
    public function getOpenTrackingPixelUrl(string $token): string
    {
        return rest_url('kelune-crm/v1/track/open/' . $token);
    }

    /**
     * Signature proving a click-tracking destination was authored by this site.
     *
     * The destination travels in the query string, so without a signature the
     * redirect endpoint would forward anywhere an attacker asked — a phishing
     * jump off a trusted domain. Every tracked link is built here, so it can be
     * signed and anything unverified refused. Keyed with wp_salt().
     */
    public function signClickUrl(string $token, string $url): string
    {
        return hash_hmac('sha256', $token . '|' . $url, wp_salt('auth'));
    }

    /**
     * Whether a click-tracking destination carries a signature we issued.
     */
    public function verifyClickUrl(string $token, string $url, string $signature): bool
    {
        if ($signature === '') {
            return false;
        }

        // hash_equals: constant-time, so a wrong signature cannot be recovered
        // byte-by-byte from response timing.
        return hash_equals($this->signClickUrl($token, $url), $signature);
    }

    /**
     * Get click tracking URL
     *
     * @param string $token Tracking token
     * @param string $url Original URL to redirect to
     * @return string
     */
    public function getClickTrackingUrl(string $token, $url): string
    {
        $url = (string) $url;

        // add_query_arg URL-encodes the values itself — encoding here as well
        // would double-escape the destination.
        return add_query_arg(
            [
                'url' => $url,
                'sig' => $this->signClickUrl($token, $url),
            ],
            rest_url('kelune-crm/v1/track/click/' . $token)
        );
    }

    /**
     * Insert tracking pixel into email HTML
     *
     * @param string $html Email HTML content
     * @param string $token Tracking token
     * @return string HTML with tracking pixel
     */
    public function insertTrackingPixel(string $html, $token): string
    {
        $pixel_url = $this->getOpenTrackingPixelUrl($token);
        $pixel_html = '<img src="' . esc_url($pixel_url) . '" width="1" height="1" alt="" style="display:none;" />';

        // Try to insert before closing </body> tag
        if (stripos($html, '</body>') !== false) {
            return str_ireplace('</body>', $pixel_html . '</body>', $html);
        }

        // Otherwise, append to end
        return $html . $pixel_html;
    }

    /**
     * Wrap links in email HTML with click tracking
     *
     * @param string $html Email HTML content
     * @param string $token Tracking token
     * @return string HTML with tracked links
     */
    public function wrapLinksWithTracking($html, $token): string
    {
        // Match all <a> tags with href attributes
        $pattern = '/<a\s+([^>]*href=["\']([^"\']+)["\'][^>]*)>/i';

        $html = preg_replace_callback($pattern, function ($matches) use ($token): string {
            $original_tag = $matches[0];
            $original_url = $matches[2];

            // Skip if URL is already a tracking URL or is an anchor (#)
            if (strpos($original_url, '/track/click/') !== false || strpos($original_url, '#') === 0) {
                return $original_tag;
            }

            // Skip mailto: and tel: links
            if (preg_match('/^(mailto|tel):/i', $original_url)) {
                return $original_tag;
            }

            // Generate tracking URL
            $tracking_url = $this->getClickTrackingUrl($token, $original_url);

            // Replace original URL with tracking URL
            return str_replace($original_url, $tracking_url, $original_tag);
        }, $html);

        return $html ?? '';
    }

    /**
     * Add tracking to email HTML (pixel + links).
     *
     * Both halves gate independently on track_email_opens / track_email_clicks.
     * Gating here rather than at the call site keeps every send on one path.
     *
     * @param string $html Email HTML content
     * @param string $token Tracking token
     * @return string HTML with tracking
     */
    public function addTrackingToHtml($html, $token): string
    {
        // First wrap links
        if ($this->settingsService->isEnabled('track_email_clicks')) {
            $html = $this->wrapLinksWithTracking($html, $token);
        }

        // Then insert pixel
        if ($this->settingsService->isEnabled('track_email_opens')) {
            $html = $this->insertTrackingPixel($html, $token);
        }

        return $html;
    }

    /**
     * Resend a logged email: copy it to a fresh log row and dispatch it through
     * the same provider path every other send uses.
     *
     * @param int $log_id Email log ID
     * @return int|\WP_Error New log ID on success, WP_Error on failure
     */
    public function resendEmail($log_id)
    {
        $original_log = $this->repository->find($log_id);

        if (!$original_log) {
            return new \WP_Error(
                'not_found',
                __('Original email log not found', 'kelune-crm'),
                ['status' => 404]
            );
        }

        // Re-check consent here, not just at dispatch: the original log is a
        // snapshot and the contact may have unsubscribed since, so a resend
        // would replay that body to them.
        if (!$this->isContactSendable($original_log->contact_id)) {
            return new \WP_Error(
                'contact_not_sendable',
                __('That contact is not accepting email.', 'kelune-crm'),
                ['status' => 400]
            );
        }

        // Create a new email log entry
        $new_data = [
            'email_type' => $original_log->email_type,
            'campaign_id' => $original_log->campaign_id,
            'automation_id' => $original_log->automation_id,
            'contact_id' => $original_log->contact_id,
            'email_to' => $original_log->email_to,
            'email_from' => $original_log->email_from,
            'subject' => $original_log->subject,
            'body_html' => $original_log->body_html,
            'body_text' => $original_log->body_text,
            'status' => 'queued',
            'provider' => null, // Will be set when sent
            'metadata' => json_encode(array_merge(
                $original_log->getMetadata(),
                ['resent_from' => $log_id]
            )),
        ];

        $new_log_id = $this->logEmailQueued($new_data);

        if (!$new_log_id) {
            return new \WP_Error(
                'resend_failed',
                __('Failed to queue the email for resending', 'kelune-crm'),
                ['status' => 500]
            );
        }

        $new_log = $this->repository->find((int) $new_log_id);
        $body_html = (string) $original_log->body_html;
        $body_text = (string) $original_log->body_text;

        // Re-point the body's tracking URLs at the new row. Never for a campaign
        // body: that token also addresses its campaign_emails row, which is
        // UNIQUE per (campaign, contact), so a swap resolves to nothing.
        $old_token = (string) $original_log->tracking_token;
        $new_token = $new_log ? (string) $new_log->tracking_token : '';
        if (!$original_log->campaign_id && $old_token !== '' && $new_token !== '') {
            $body_html = str_replace($old_token, $new_token, $body_html);
            $body_text = str_replace($old_token, $new_token, $body_text);

            // Persist what actually goes out, so the log matches the message.
            $this->repository->update((int) $new_log_id, [
                'body_html' => $body_html,
                'body_text' => $body_text,
            ]);
        }

        [$from_name, $from_email] = $this->splitFromHeader((string) $original_log->email_from);

        // Built here, not held as a property: EmailService constructs an
        // EmailLogService of its own and would recurse. No provider_id — the log
        // stores a provider name, not a connection id, so the logged sender
        // re-selects the connection through wp_mail routing.
        $sent = (new EmailService())->sendTransactional(
            (string) $original_log->email_to,
            (string) $original_log->subject,
            $body_html,
            [
                'from_name' => $from_name,
                'from_email' => $from_email,
                'text' => $body_text,
            ]
        );

        if (is_wp_error($sent) || !$sent) {
            $error_message = is_wp_error($sent)
                ? $sent->get_error_message()
                : __('Failed to send email', 'kelune-crm');

            $this->logEmailFailed($new_log_id, $error_message);

            return new \WP_Error('resend_failed', $error_message, ['status' => 500]);
        }

        $this->logEmailSent($new_log_id);

        return $new_log_id;
    }

    /**
     * Split a stored `Name <address>` sender into its two parts. An unparseable
     * value yields both empty, so the send falls back to the configured sender
     * rather than emitting a malformed From.
     *
     * @return array{0: string, 1: string} [name, email]
     */
    private function splitFromHeader(string $from): array
    {
        $from = trim($from);

        if ($from === '') {
            return ['', ''];
        }

        if (preg_match('/^(.*?)\s*<([^>]+)>$/', $from, $matches)) {
            return [trim($matches[1], " \t\"'"), sanitize_email($matches[2])];
        }

        return ['', sanitize_email($from)];
    }

    /**
     * Whether a logged email's contact may still receive marketing email.
     *
     * A log with no contact_id is a one-off (test/preview to a typed address);
     * no contact to consult, so it is left to the caller.
     *
     * @param mixed $contact_id
     */
    private function isContactSendable($contact_id): bool
    {
        if (empty($contact_id)) {
            return true;
        }

        $contact = (new ContactRepository())->find((int) $contact_id);

        if (!$contact) {
            return true;
        }

        return Contact::isSendableStatus($contact->get('status'));
    }

    /**
     * Get email log by tracking token
     *
     * @param string $token
     * @return EmailLog|null
     */
    public function getByTrackingToken($token): ?EmailLog
    {
        return $this->repository->getByTrackingToken($token);
    }

}
