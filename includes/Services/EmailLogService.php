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
        // Whether this is the FIRST open decides whether an engagement event
        // fires: the open pixel loads on every view, but a contact "opened this
        // email" is a one-time fact — re-recording it on every reload would spam
        // the events table and re-fire the email-opened automation trigger.
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
     * The single place both halves of the system learn about engagement:
     *  - a row in the events table, which `ConditionEvaluator` reads for the
     *    email_opened / email_clicked automation CONDITIONS, and
     *  - the `kelune_crm_email_opened` / `kelune_crm_email_clicked` hooks,
     *    which the Pro add-on's advanced trigger service enrols contacts on.
     *
     * Called from both send paths (campaign tracking and automation/transactional
     * tracking) so an open is an open regardless of which mailer produced it.
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
        return 'kelunecrmlt_' . bin2hex(random_bytes(30)); // 60 hex + 12 char prefix = 72 total
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
     * The destination travels in the query string, so without this the redirect
     * endpoint would forward anywhere an attacker asked it to — a phishing jump
     * off our own trusted domain. We build every tracked link ourselves, so we
     * can sign it and refuse anything that does not verify.
     *
     * Keyed with wp_salt(), which is per-site and never leaves the server.
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
     * Both halves are gated independently by the track_email_opens /
     * track_email_clicks settings. Gating here (rather than at the call site)
     * keeps every automation send on one honest path.
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
     * Resend a failed email
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

        // Consent is re-checked here rather than only at dispatch, because the
        // original log is a snapshot: the contact may have unsubscribed since it
        // was written, and resending replays that old body to them. Refusing up
        // front also means the queued row this writes can never become a send to
        // someone who opted out once the TODO below is implemented.
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

        // TODO: Trigger actual email sending here
        // This would integrate with EmailService to actually send the email

        return $new_log_id;
    }

    /**
     * Whether a logged email's contact may still receive marketing email.
     *
     * A log with no contact_id is a one-off (a test or preview to a typed
     * address); there is no contact to consult, so it is left to its caller.
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
