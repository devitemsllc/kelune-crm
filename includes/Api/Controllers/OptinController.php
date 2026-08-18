<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Services\DoubleOptinService;
use KeluneCRM\Services\PublicPageService;
use KeluneCRM\Services\SettingsService;

/**
 * Public double opt-in confirmation endpoint.
 *
 * Deliberately two steps. The GET only renders a page with a confirm button;
 * the subscription is not activated until the POST. Mail scanners and link
 * prefetchers follow links in emails, and a one-shot GET would let them
 * confirm on the recipient's behalf — which is exactly the intent double
 * opt-in exists to prove.
 */
class OptinController extends BaseController
{
    protected string $restBase = 'optin';

    private DoubleOptinService $optinService;
    private PublicPageService $pageService;

    public function __construct()
    {
        $this->optinService = new DoubleOptinService();
        $this->pageService = new PublicPageService();
    }

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

        register_rest_route($namespace, '/' . $this->restBase . '/confirm/(?P<token>[A-Za-z0-9_]+)', [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'showConfirmPage'],
                // Public by design: the recipient is not logged in. The
                // unguessable token is the authorization (validated in-handler).
                'permission_callback' => [$this, 'allowPublicAccess'],
                'args' => $this->tokenArg(),
            ],
            [
                'methods' => \WP_REST_Server::CREATABLE,
                'callback' => [$this, 'confirm'],
                'permission_callback' => [$this, 'allowPublicAccess'],
                'args' => $this->tokenArg(),
            ],
        ]);
    }

    /**
     * @return array<string, array<string, mixed>>
     */
    private function tokenArg(): array
    {
        return [
            'token' => [
                'type' => 'string',
                'required' => true,
                'sanitize_callback' => static fn ($value): string => sanitize_text_field((string) $value),
            ],
        ];
    }

    /**
     * Step 1: ask the recipient to confirm.
     */
    public function showConfirmPage(\WP_REST_Request $request): void
    {
        $token = (string) $request->get_param('token');

        $this->pageService->output(
            __('Confirm your subscription', 'kelune-crm'),
            __('One last step', 'kelune-crm'),
            __('Please confirm that you would like to receive emails from us.', 'kelune-crm'),
            [
                'success' => true,
                'form_action' => $this->optinService->getConfirmationUrl($token),
                'action_label' => __('Confirm my subscription', 'kelune-crm'),
            ]
        );
    }

    /**
     * Step 2: the recipient clicked confirm.
     */
    public function confirm(\WP_REST_Request $request): void
    {
        $token = (string) $request->get_param('token');
        $result = $this->optinService->confirm($token);

        if (is_wp_error($result)) {
            $this->pageService->output(
                __('Confirmation failed', 'kelune-crm'),
                __('We could not confirm this subscription', 'kelune-crm'),
                $result->get_error_message(),
                ['success' => false]
            );
            return;
        }

        // Re-validate at the point of use with an explicit protocol allow-list,
        // matching every other redirect in the plugin: even though the setting
        // is admin-configured and esc_url_raw'd on save, this closes any
        // non-web scheme before it reaches the Location header.
        $redirect = esc_url_raw(
            (new SettingsService())->getString('optin_confirm_redirect'),
            ['http', 'https']
        );
        if ($redirect !== '') {
            // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect -- Admin-configured destination that may legitimately point off-site (e.g. a hosted welcome page).
            wp_redirect($redirect);
            exit;
        }

        $this->pageService->output(
            __('Subscription confirmed', 'kelune-crm'),
            __('You are subscribed', 'kelune-crm'),
            __('Thank you for confirming. You will now receive our emails.', 'kelune-crm'),
            [
                'success' => true,
                'action_url' => home_url(),
                'action_label' => __('Back to the website', 'kelune-crm'),
            ]
        );
    }
}
