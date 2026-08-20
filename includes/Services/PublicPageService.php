<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

/**
 * Renders the plugin's standalone public pages (unsubscribe confirmation,
 * double opt-in confirmation).
 *
 * These are reached from an email, by a recipient who is not logged in and may
 * not know the site — so they are self-contained documents carrying the
 * business logo and name rather than theme templates.
 */
class PublicPageService
{
    private SettingsService $settingsService;

    public function __construct()
    {
        $this->settingsService = new SettingsService();
    }

    /**
     * Build a branded confirmation page.
     *
     * `form_action` renders the action as a POST button instead of a link, for
     * the steps that must not be triggerable by a link prefetcher.
     *
     * @param array{success?: bool, action_url?: string, action_label?: string, form_action?: string} $options
     */
    public function render(string $title, string $heading, string $message, array $options = []): string
    {
        $success = $options['success'] ?? true;
        $accent = $success ? '#52c41a' : '#ff4d4f';

        $logo = $this->settingsService->getString('business_logo');
        $businessName = $this->settingsService->getString('business_name');

        $branding = '';
        if ($logo !== '') {
            $branding = '<img class="logo" src="' . esc_url($logo) . '" alt="' . esc_attr($businessName) . '">';
        } elseif ($businessName !== '') {
            $branding = '<p class="business">' . esc_html($businessName) . '</p>';
        }

        $actionLabel = (string) ($options['action_label'] ?? __('Continue', 'kelune-crm'));

        $action = '';
        if (!empty($options['form_action'])) {
            $action = '<form method="post" action="' . esc_url((string) $options['form_action']) . '">'
                . '<button class="button" type="submit">' . esc_html($actionLabel) . '</button>'
                . '</form>';
        } elseif (!empty($options['action_url'])) {
            $action = '<a class="button" href="' . esc_url((string) $options['action_url']) . '">'
                . esc_html($actionLabel) . '</a>';
        }

        $address = $this->settingsService->getString('business_address');
        $footer = $address !== ''
            ? '<p class="address">' . nl2br(esc_html($address)) . '</p>'
            : '';

        return '<!DOCTYPE html>
<html ' . get_language_attributes() . '>
<head>
    <meta charset="' . esc_attr(get_bloginfo('charset')) . '">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>' . esc_html($title) . '</title>
    ' . $this->styleTag() . '
</head>
<body>
    <div class="container">
        ' . $branding . '
        <h1 style="color: ' . esc_attr($accent) . '">' . esc_html($heading) . '</h1>
        <p>' . esc_html($message) . '</p>
        ' . $action . '
        ' . $footer . '
    </div>
</body>
</html>';
    }

    /**
     * Register the public-page stylesheet and return its markup, emitted
     * through the WordPress styles pipeline (wp_register_style /
     * wp_enqueue_style) rather than a hand-written inline stylesheet or link.
     *
     * The one dynamic value (the accent colour, which differs for the success
     * and error variants) lives on the <h1> element's own style attribute, so
     * the stylesheet itself is fully static and cacheable.
     */
    private function styleTag(): string
    {
        $handle = 'kelune-crm-public-page';

        if (!wp_style_is($handle, 'registered')) {
            wp_register_style(
                $handle,
                KELUNE_CRM_PLUGIN_URL . 'assets/frontend/css/public-page.css',
                [],
                KELUNE_CRM_VERSION
            );
        }

        wp_enqueue_style($handle);

        ob_start();
        wp_print_styles($handle);

        return (string) ob_get_clean();
    }

    /**
     * Send a public page as the full response and stop.
     *
     * @param array{success?: bool, action_url?: string, action_label?: string, form_action?: string} $options
     */
    public function output(string $title, string $heading, string $message, array $options = []): void
    {
        if (!headers_sent()) {
            header('Content-Type: text/html; charset=utf-8');
            // These pages confirm a state change and must never be cached or
            // prefetched into looking like a fresh result.
            nocache_headers();
        }

        // Fully escaped in render(); echoing the assembled document verbatim.
        echo $this->render($title, $heading, $message, $options); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
        exit;
    }
}
