<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Services\EmailLogService;
use WP_REST_Controller;
use WP_REST_Request;
use WP_REST_Server;

/**
 * Email open and click tracking endpoints.
 */
class TrackingController extends WP_REST_Controller
{
    protected $namespace = 'kelune-crm/v1';
    protected $rest_base = 'track';

    private \KeluneCRM\Services\EmailLogService $emailLogService;

    public function __construct()
    {
        $this->emailLogService = new EmailLogService();
    }

    public function registerRoutes(?string $namespace = null): void
    {
        if ($namespace) {
            $this->namespace = $namespace;
        }

        register_rest_route($this->namespace, '/' . $this->rest_base . '/open/(?P<token>[a-zA-Z0-9_]+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [$this, 'trackOpen'],
                'permission_callback' => [$this, 'allowPublicAccess'],
                'args' => [
                    'token' => [
                        'description' => __('Email tracking token', 'kelune-crm'),
                        'type' => 'string',
                        'required' => true,
                        'validate_callback' => function ($param): bool {
                            return !empty($param) && strlen($param) >= 60;
                        },
                    ],
                ],
            ],
        ]);

        register_rest_route($this->namespace, '/' . $this->rest_base . '/click/(?P<token>[a-zA-Z0-9_]+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [$this, 'trackClick'],
                'permission_callback' => [$this, 'allowPublicAccess'],
                'args' => [
                    'token' => [
                        'description' => __('Email tracking token', 'kelune-crm'),
                        'type' => 'string',
                        'required' => true,
                        'validate_callback' => function ($param): bool {
                            return !empty($param) && strlen($param) >= 60;
                        },
                    ],
                    'url' => [
                        'description' => __('Original URL to redirect to', 'kelune-crm'),
                        'type' => 'string',
                        'required' => true,
                        'validate_callback' => function ($param): bool {
                            return is_string($param) && $param !== '' && (bool) filter_var($param, FILTER_VALIDATE_URL);
                        },
                    ],
                    'sig' => [
                        'description' => __('Signature proving this site issued the destination URL', 'kelune-crm'),
                        'type' => 'string',
                        'required' => true,
                        'validate_callback' => function ($param): bool {
                            return is_string($param) && $param !== '';
                        },
                    ],
                ],
            ],
        ]);
    }

    /**
     * Permission gate for the public open/click trackers. Access is open, but
     * the open route validates a >=60-char token and the click route verifies
     * an HMAC signature (see trackClick) before acting.
     */
    public function allowPublicAccess(WP_REST_Request $request): bool
    {
        return true;
    }

    /**
     * Track an email open and return a 1x1 transparent pixel image.
     */
    public function trackOpen(WP_REST_Request $request): void
    {
        $token = $request->get_param('token');

        $email_log = $this->emailLogService->getByTrackingToken($token);

        if ($email_log) {
            $this->emailLogService->logEmailOpened((int) $email_log->id);
        }

        $this->sendTrackingPixel();
        exit;
    }

    /**
     * Log an email click and redirect to the original URL.
     */
    public function trackClick(WP_REST_Request $request): void
    {
        $token = (string) $request->get_param('token');
        $url = (string) $request->get_param('url');
        $signature = (string) $request->get_param('sig');

        // This endpoint is public and takes its destination from the query
        // string, so it must never forward to a URL it did not issue: an
        // unsigned redirect here is a phishing jump off the site's own trusted
        // domain. Every tracked link is signed when the email is built, so
        // anything that fails verification is not ours.
        if (!$this->emailLogService->verifyClickUrl($token, $url, $signature)) {
            wp_die(
                esc_html__('This link is invalid or has been tampered with.', 'kelune-crm'),
                esc_html__('Invalid Link', 'kelune-crm'),
                ['response' => 400]
            );
        }

        // Belt and braces: even a signed destination is normalised, and only
        // web protocols are ever followed (never javascript:, data:, …).
        $safe_url = esc_url_raw($url, ['http', 'https']);

        if ($safe_url === '') {
            wp_die(
                esc_html__('This link points somewhere that cannot be opened.', 'kelune-crm'),
                esc_html__('Invalid Link', 'kelune-crm'),
                ['response' => 400]
            );
        }

        $email_log = $this->emailLogService->getByTrackingToken($token);

        if ($email_log) {
            $user_agent = $request->get_header('user_agent') ?? '';
            $ip_address = $this->getClientIp();

            $this->emailLogService->logEmailClicked((int) $email_log->id, [
                'url' => $safe_url,
                'ip' => $ip_address,
                'user_agent' => sanitize_text_field((string) $user_agent),
            ]);
        }

        // Redirect to the original URL. Deliberately wp_redirect and not
        // wp_safe_redirect: tracked links legitimately point off-site, and the
        // signature above — not a host allowlist — is what authorises this.
        // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect -- see comment above; off-site destination is the feature.
        wp_redirect($safe_url);
        exit;
    }

    /**
     * Send a 1x1 transparent pixel image.
     */
    private function sendTrackingPixel(): void
    {
        header('Content-Type: image/gif');
        header('Content-Length: 43');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');

        // Raw binary GIF body from a hardcoded constant — no escaping function
        // applies to a binary response; esc_html() would corrupt the GIF.
        echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }

    /**
     * Get the client IP address.
     */
    private function getClientIp(): string
    {
        $ip_keys = [
            'HTTP_CLIENT_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_FORWARDED',
            'HTTP_X_CLUSTER_CLIENT_IP',
            'HTTP_FORWARDED_FOR',
            'HTTP_FORWARDED',
            'REMOTE_ADDR',
        ];

        foreach ($ip_keys as $key) {
            if (isset($_SERVER[$key]) && !empty($_SERVER[$key])) {
                $ip = sanitize_text_field(wp_unslash($_SERVER[$key]));

                // A forwarded header can carry a client, proxy1, proxy2 chain;
                // the left-most entry is the originating client.
                if (strpos($ip, ',') !== false) {
                    $ip = trim(explode(',', $ip)[0]);
                }

                if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                    return $ip;
                }
            }
        }

        return sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'] ?? ''));
    }
}
