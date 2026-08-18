<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Models\Contact;
use KeluneCRM\Repositories\ContactRepository;
use KeluneCRM\Services\EmailService;
use KeluneCRM\Services\PublicPageService;
use KeluneCRM\Services\SettingsService;

class CampaignTrackingController extends BaseController
{
    protected string $restBase = 'campaigns/track';
    private \KeluneCRM\Services\EmailService $emailService;

    public function __construct()
    {
        $this->emailService = new EmailService();
    }

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

        register_rest_route($namespace, '/' . $this->restBase . '/open/(?P<token>[a-zA-Z0-9]+)', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'trackOpen'],
            // Public tracker: authorized by the per-send token looked up in-handler.
            'permission_callback' => [$this, 'allowPublicAccess'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/click/(?P<token>[a-zA-Z0-9]+)/(?P<link_id>\d+)', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'trackClick'],
            // Public tracker: authorized by the per-send token looked up in-handler.
            'permission_callback' => [$this, 'allowPublicAccess'],
        ]);

        // Track unsubscribe. Underscores are allowed because this route serves
        // two token shapes: a campaign_emails token (bare sha256 hex) and an
        // email_logs token from an automation send (`kelunecrmlt_` + hex).
        register_rest_route($namespace, '/' . $this->restBase . '/unsubscribe/(?P<token>[a-zA-Z0-9_]+)', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'trackUnsubscribe'],
            // Public tracker: authorized by the per-send token looked up in-handler.
            'permission_callback' => [$this, 'allowPublicAccess'],
        ]);
    }

    /**
     * Track an email open and return a 1x1 transparent pixel.
     */
    public function trackOpen(\WP_REST_Request $request): void
    {
        $token = $request->get_param('token');

        $user_agent = isset($_SERVER['HTTP_USER_AGENT']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])) : '';
        $ip_address = $this->getClientIP();

        $this->emailService->trackOpen($token, $user_agent, $ip_address);

        header('Content-Type: image/gif');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');

        $pixel = base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');

        // Raw binary GIF body from a hardcoded constant — no output-escaping
        // function applies to a binary response; esc_html() would corrupt it.
        echo $pixel; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        exit;
    }

    /**
     * Track link click and redirect
     */
    public function trackClick(\WP_REST_Request $request): void
    {
        $token = sanitize_text_field((string) $request->get_param('token'));
        $link_id = absint($request->get_param('link_id'));

        $this->emailService->trackClick($token, $link_id);

        global $wpdb;
        $table = $wpdb->prefix . 'kelune_crm_campaign_links';

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API, fresh read required.
        $link = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT original_url FROM %i WHERE id = %d',
                $table,
                $link_id
            )
        );

        if ($link && !empty($link->original_url)) {
            // Protocol-restrict the destination before redirecting, matching
            // TrackingController::trackClick. Even though campaign_links only
            // ever holds admin-authored URLs, normalising to http/https here
            // closes any `javascript:`/`data:` scheme that a malformed row
            // could otherwise smuggle into the Location header.
            $destination = esc_url_raw((string) $link->original_url, ['http', 'https']);

            if ($destination !== '') {
                // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect -- Tracked link legitimately points off-site; the esc_url_raw protocol allow-list above is what authorises it, not a host allowlist.
                wp_redirect($destination);
                exit;
            }
        }

        // If link not found (or its URL is unsafe), redirect to home
        wp_safe_redirect(home_url());
        exit;
    }

    /**
     * Track unsubscribe
     */
    public function trackUnsubscribe(\WP_REST_Request $request): void
    {
        $token = sanitize_text_field((string) $request->get_param('token'));

        global $wpdb;
        $table = $wpdb->prefix . 'kelune_crm_campaign_emails';

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API, fresh read required.
        $email = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT * FROM %i WHERE tracking_token = %s',
                $table,
                $token
            ),
            ARRAY_A
        );

        if ($email) {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API.
            $wpdb->update(
                $table,
                [
                    'unsubscribed_at' => current_time('mysql', true),
                    // Explicit UTC: the column is ON UPDATE CURRENT_TIMESTAMP
                    // (DB-session-local); keep it UTC like every other moment.
                    'updated_at' => current_time('mysql', true),
                ],
                ['id' => $email['id']]
            );

            $this->unsubscribeContact((int) $email['contact_id']);
            return;
        }

        // Not a campaign send: automation email carries the same footer, but its
        // token belongs to an email_logs row, so fall back to that lookup rather
        // than telling a real recipient their unsubscribe link is invalid.
        $logs_table = $wpdb->prefix . 'kelune_crm_email_logs';

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- Custom plugin table; no WP API, fresh read required.
        $log = $wpdb->get_row(
            $wpdb->prepare(
                'SELECT id, contact_id FROM %i WHERE tracking_token = %s',
                $logs_table,
                $token
            ),
            ARRAY_A
        );

        if ($log && !empty($log['contact_id'])) {
            $this->unsubscribeContact((int) $log['contact_id']);
            return;
        }

        $this->renderUnsubscribePage(false);
    }

    /**
     * Flip a contact to unsubscribed and render the confirmation page.
     *
     * Goes through the repository rather than a direct write: it announces
     * kelune_crm_contact_status_changed, which is what cancels this contact's
     * other queued email and automation work.
     */
    private function unsubscribeContact(int $contact_id): void
    {
        (new ContactRepository())->updateStatus(
            $contact_id,
            Contact::STATUS_UNSUBSCRIBED
        );

        $this->renderUnsubscribePage(true);
    }

    /**
     * Get client IP address
     */
    private function getClientIP(): string
    {
        $ip = '';

        if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
            $ip = sanitize_text_field(wp_unslash($_SERVER['HTTP_CLIENT_IP']));
        } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $ip = sanitize_text_field(wp_unslash($_SERVER['HTTP_X_FORWARDED_FOR']));
        } else {
            $ip = sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'] ?? ''));
        }

        return $ip;
    }

    /**
     * Render unsubscribe confirmation page.
     *
     * When a redirect URL is configured under Global Email Settings the
     * recipient is sent there instead, so a site can land them on its own
     * "sorry to see you go" page.
     */
    private function renderUnsubscribePage(bool $success): void
    {
        if ($success) {
            // Re-validate at the point of use with an explicit protocol
            // allow-list, matching every other redirect in the plugin: even
            // though the setting is admin-configured and esc_url_raw'd on save,
            // this closes any non-web scheme before it reaches the Location
            // header.
            $redirect = esc_url_raw(
                (new SettingsService())->getString('email_unsubscribe_redirect'),
                ['http', 'https']
            );
            if ($redirect !== '') {
                // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect -- Admin-configured destination that may legitimately point off-site (e.g. a hosted "sorry to see you go" page).
                wp_redirect($redirect);
                exit;
            }
        }

        $page = new PublicPageService();

        if ($success) {
            $page->output(
                __('Unsubscribed', 'kelune-crm'),
                __('You have been unsubscribed', 'kelune-crm'),
                __('You will no longer receive marketing emails from us.', 'kelune-crm'),
                [
                    'success' => true,
                    'action_url' => home_url(),
                    'action_label' => __('Return to home', 'kelune-crm'),
                ]
            );
        }

        $page->output(
            __('Unsubscribe', 'kelune-crm'),
            __('We could not process your request', 'kelune-crm'),
            __('This unsubscribe link is invalid or has expired. Please try again or contact us.', 'kelune-crm'),
            [
                'success' => false,
                'action_url' => home_url(),
                'action_label' => __('Return to home', 'kelune-crm'),
            ]
        );
    }
}
