<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Services\SettingsService;

class SettingsController extends BaseController
{
    protected string $restBase = 'settings';

    /**
     * How each setting key is sanitized on the way in. The key set mirrors
     * SettingsService::defaults() — a key absent here is silently dropped, so
     * the two must be added to together.
     *
     * @var array<string, string>
     */
    private const FIELD_TYPES = [
        // Business identity
        'business_name' => 'text',
        'business_logo' => 'url',
        'business_address' => 'textarea',

        // WP user data sync
        'sync_users_enabled' => 'bool',
        'sync_delete_contact_on_user_delete' => 'bool',

        // User signup opt-in
        'signup_optin_enabled' => 'bool',
        'signup_optin_list_ids' => 'ids',
        'signup_optin_tag_ids' => 'ids',
        'signup_optin_double_optin' => 'bool',

        // Comment form subscription
        'comment_optin_enabled' => 'bool',
        'comment_optin_label' => 'text',
        'comment_optin_auto_checked' => 'bool',
        'comment_optin_hide_if_subscribed' => 'bool',
        'comment_optin_list_ids' => 'ids',
        'comment_optin_tag_ids' => 'ids',
        'comment_optin_double_optin' => 'bool',

        // Global email
        'email_from_name' => 'text',
        'email_from_email' => 'email',
        'email_reply_to_name' => 'text',
        'email_reply_to_email' => 'email',
        'email_footer_html' => 'html',
        'email_unsubscribe_redirect' => 'url',
        'optin_email_subject' => 'text',
        'optin_email_body' => 'html',
        'optin_confirm_redirect' => 'url',

        // Compliance
        'track_email_opens' => 'bool',
        'track_email_clicks' => 'bool',
        'use_gravatar_service' => 'bool',

        // Setup wizard progress.
        'setup_wizard_step' => 'int',
        'setup_wizard_finished' => 'bool',
    ];

    private SettingsService $settingsService;

    public function __construct()
    {
        $this->settingsService = new SettingsService();
    }

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

        register_rest_route($namespace, '/' . $this->restBase, [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'getSettings'],
                'permission_callback' => [$this, 'checkPermission'],
            ],
            [
                'methods' => \WP_REST_Server::EDITABLE,
                'callback' => [$this, 'updateSettings'],
                'permission_callback' => [$this, 'checkPermission'],
            ],
        ]);
    }

    public function getSettings(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        return $this->successResponse($this->settingsService->all());
    }

    public function updateSettings(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $sanitized_settings = $this->sanitizeSettingsInput($request->get_params());

        // Merge over existing settings. The settings page is split into several
        // sections (General, Global Email, Double Opt-in, …) that all POST to
        // this single option. Overwriting wholesale would wipe the sections not
        // present in this request, so we merge the sanitized values in.
        $stored = get_option(SettingsService::OPTION_NAME, []);
        if (!is_array($stored)) {
            $stored = [];
        }
        $merged = array_merge($stored, $sanitized_settings);

        // Validate the MERGED result, not just this request's fields, so a
        // section that omits a key is still checked against its stored value.
        $validation_result = $this->validateSettings($merged);
        if (is_wp_error($validation_result)) {
            return $validation_result;
        }

        update_option(SettingsService::OPTION_NAME, $merged);
        SettingsService::flushCache();

        /**
         * Fires after the settings option is written.
         *
         * @param array<string, mixed> $merged Full stored settings.
         * @param array<string, mixed> $sanitized_settings Only the keys this request changed.
         */
        do_action('kelune_crm_settings_saved', $merged, $sanitized_settings);

        return $this->successResponse($this->settingsService->all());
    }

    /**
     * Sanitize settings input against the declared field types. Unknown keys
     * are dropped rather than stored.
     *
     * @param array<string, mixed> $settings Raw settings from request
     * @return array<string, mixed> Sanitized settings
     */
    protected function sanitizeSettingsInput(array $settings): array
    {
        $sanitized = [];

        foreach (self::FIELD_TYPES as $key => $type) {
            if (!array_key_exists($key, $settings)) {
                continue;
            }

            $value = $settings[$key];

            switch ($type) {
                case 'bool':
                    // A JSON `false` arrives as bool, but a form/query value can
                    // arrive as the string "false" — which is truthy when cast.
                    $sanitized[$key] = rest_sanitize_boolean(is_scalar($value) ? (string) $value : '');
                    break;

                case 'int':
                    $sanitized[$key] = max(0, (int) (is_scalar($value) ? $value : 0));
                    break;

                case 'text':
                    $sanitized[$key] = sanitize_text_field((string) $value);
                    break;

                case 'textarea':
                    $sanitized[$key] = sanitize_textarea_field((string) $value);
                    break;

                case 'email':
                    $sanitized[$key] = sanitize_email((string) $value);
                    break;

                case 'url':
                    $sanitized[$key] = esc_url_raw(trim((string) $value));
                    break;

                case 'html':
                    $sanitized[$key] = wp_kses_post((string) $value);
                    break;

                case 'ids':
                    $sanitized[$key] = is_array($value)
                        ? array_values(array_unique(array_filter(array_map('absint', $value))))
                        : [];
                    break;
            }
        }

        return $sanitized;
    }

    /**
     * Validate the merged settings.
     *
     * @param array<string, mixed> $settings
     * @return bool|\WP_Error True if valid, WP_Error if validation fails
     */
    protected function validateSettings(array $settings): bool|\WP_Error
    {
        $errors = [];

        if (!empty($settings['email_from_email']) && !is_email((string) $settings['email_from_email'])) {
            $errors[] = __('From Email is not a valid email address.', 'kelune-crm');
        }
        if (!empty($settings['email_reply_to_email']) && !is_email((string) $settings['email_reply_to_email'])) {
            $errors[] = __('Reply-To Email is not a valid email address.', 'kelune-crm');
        }

        // The footer is the only thing guaranteed to reach every campaign, so
        // the unsubscribe link has to live there to stay CAN-SPAM compliant.
        if (
            array_key_exists('email_footer_html', $settings)
            && !str_contains((string) $settings['email_footer_html'], '{{unsubscribe_url}}')
        ) {
            $errors[] = __('The email footer must contain the {{unsubscribe_url}} merge tag so recipients can opt out.', 'kelune-crm');
        }

        // Without a confirmation link the opt-in email is a dead end.
        if (
            array_key_exists('optin_email_body', $settings)
            && !str_contains((string) $settings['optin_email_body'], '{{confirmation_url}}')
        ) {
            $errors[] = __('The confirmation email must contain the {{confirmation_url}} merge tag.', 'kelune-crm');
        }

        if ($errors !== []) {
            return $this->errorResponse(
                implode(' ', $errors),
                'validation_failed',
                400
            );
        }

        return true;
    }
}
