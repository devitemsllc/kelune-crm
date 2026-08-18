<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

/**
 * Single source of truth for the plugin option `kelune_crm_settings`.
 *
 * Every setting the plugin honours is declared once in defaults() — the
 * Activator seeds from it, the REST controller sanitizes against it, and
 * consumers read through the typed accessors here. A key that is not in
 * defaults() is a key nothing reads.
 */
class SettingsService
{
    public const OPTION_NAME = 'kelune_crm_settings';

    /**
     * Cached merged settings for the current request. Reset via flushCache()
     * after a write so a same-request read sees the new values.
     *
     * @var array<string, mixed>|null
     */
    private static ?array $cache = null;

    /**
     * The default email footer. Carries the business identity and the
     * unsubscribe link required by anti-spam law (CAN-SPAM / GDPR), so the
     * out-of-the-box footer is already compliant.
     */
    public static function defaultEmailFooter(): string
    {
        return '<p>{{business_name}}<br>{{business_address}}</p>'
            . '<p>' . esc_html__('Not interested anymore?', 'kelune-crm')
            . ' <a href="{{unsubscribe_url}}">' . esc_html__('Unsubscribe', 'kelune-crm') . '</a></p>';
    }

    /**
     * The default double opt-in confirmation email body.
     */
    public static function defaultOptinEmailBody(): string
    {
        return '<p>' . esc_html__('Hi {{first_name}},', 'kelune-crm') . '</p>'
            . '<p>' . esc_html__('Please confirm that you want to receive emails from us by clicking the link below.', 'kelune-crm') . '</p>'
            . '<p><a href="{{confirmation_url}}">' . esc_html__('Confirm my subscription', 'kelune-crm') . '</a></p>'
            . '<p>' . esc_html__('If you did not request this, you can safely ignore this email.', 'kelune-crm') . '</p>'
            . '<p>{{business_name}}</p>';
    }

    /**
     * Every setting key the plugin honours, with its default value.
     *
     * @return array<string, mixed>
     */
    public static function defaults(): array
    {
        return [
            // Business identity. Used on public pages (unsubscribe, opt-in
            // confirmation) and via merge tags in the email footer.
            'business_name' => get_bloginfo('name'),
            'business_logo' => '',
            'business_address' => '',

            // Auto sync WP user data into contact data.
            'sync_users_enabled' => false,
            'sync_delete_contact_on_user_delete' => false,

            // Create a contact when a user registers in WordPress.
            'signup_optin_enabled' => false,
            'signup_optin_list_ids' => [],
            'signup_optin_tag_ids' => [],
            'signup_optin_double_optin' => false,

            // Subscribe checkbox on the WordPress comment form.
            'comment_optin_enabled' => false,
            'comment_optin_label' => __('Subscribe to our newsletter', 'kelune-crm'),
            'comment_optin_auto_checked' => false,
            'comment_optin_hide_if_subscribed' => true,
            'comment_optin_list_ids' => [],
            'comment_optin_tag_ids' => [],
            'comment_optin_double_optin' => true,

            // Global email defaults. A provider connection's own sender wins
            // over these; see EmailService::dispatch().
            'email_from_name' => get_bloginfo('name'),
            'email_from_email' => (string) get_option('admin_email'),
            'email_reply_to_name' => '',
            'email_reply_to_email' => '',
            'email_footer_html' => self::defaultEmailFooter(),
            'email_unsubscribe_redirect' => '',
            'optin_email_subject' => __('Please confirm your subscription', 'kelune-crm'),
            'optin_email_body' => self::defaultOptinEmailBody(),
            'optin_confirm_redirect' => '',

            // Compliance. Each of these governs data collection or third-party
            // sharing, so each is honoured at the point of collection rather
            // than merely recorded here.
            //
            // Tracking off means the pixel/link rewrite is never injected, so
            // no open/click data is gathered at all — existing rows stay.
            'track_email_opens' => true,
            'track_email_clicks' => true,
            // Off by default: fetching a Gravatar discloses a hash of the
            // contact's email to a third party (Automattic), so it is opt-in.
            'use_gravatar_service' => false,

            // First-run setup wizard progress. `setup_wizard_step` is the
            // 0-based step the user is on; `setup_wizard_finished` flips true
            // once the wizard is completed or skipped so it never shows again.
            'setup_wizard_step' => 0,
            'setup_wizard_finished' => false,
        ];
    }

    /**
     * All settings, stored values merged over the defaults.
     *
     * @return array<string, mixed>
     */
    public function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        $stored = get_option(self::OPTION_NAME, []);
        if (!is_array($stored)) {
            $stored = [];
        }

        // Only known keys survive: a stale key left over from an older install
        // must not shadow a default or leak into the REST response.
        $defaults = self::defaults();
        self::$cache = array_merge($defaults, array_intersect_key($stored, $defaults));

        return self::$cache;
    }

    public static function flushCache(): void
    {
        self::$cache = null;
    }

    public function get(string $key, mixed $default = null): mixed
    {
        $settings = $this->all();

        return $settings[$key] ?? $default;
    }

    public function getString(string $key): string
    {
        $value = $this->get($key, '');

        return is_scalar($value) ? (string) $value : '';
    }

    public function isEnabled(string $key): bool
    {
        return (bool) $this->get($key, false);
    }

    /**
     * @return array<int, int>
     */
    public function getIds(string $key): array
    {
        $value = $this->get($key, []);
        if (!is_array($value)) {
            return [];
        }

        return array_values(array_filter(array_map('absint', $value)));
    }
}
