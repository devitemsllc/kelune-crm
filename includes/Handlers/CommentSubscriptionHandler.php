<?php

declare(strict_types=1);

namespace KeluneCRM\Handlers;

use KeluneCRM\Repositories\ContactRepository;
use KeluneCRM\Services\ContactSyncService;
use KeluneCRM\Services\SettingsService;

/**
 * Adds an opt-in checkbox to the WordPress comment form and turns a ticked box
 * into a contact.
 *
 * Only reaches themes that render the form through `comment_form()`; a theme
 * with hand-rolled comment markup will not show the checkbox.
 */
class CommentSubscriptionHandler
{
    /** Name of the checkbox field in the comment form. */
    private const FIELD_NAME = 'kelune_crm_comment_optin';

    private ContactRepository $contactRepository;
    private ContactSyncService $syncService;
    private SettingsService $settingsService;

    public function __construct()
    {
        $this->contactRepository = new ContactRepository();
        $this->syncService = new ContactSyncService();
        $this->settingsService = new SettingsService();
    }

    public function register(): void
    {
        // Prepended to the submit field so the checkbox sits directly above the
        // Post Comment button, next to WordPress's own cookie consent box.
        add_filter('comment_form_submit_field', [$this, 'renderCheckbox'], 10, 1);
        add_action('comment_post', [$this, 'onCommentPost'], 99, 3);
    }

    /**
     * Render the opt-in checkbox above the comment submit button.
     */
    public function renderCheckbox(string $submit_field): string
    {
        if (!$this->settingsService->isEnabled('comment_optin_enabled')) {
            return $submit_field;
        }

        if ($this->settingsService->isEnabled('comment_optin_hide_if_subscribed') && $this->isCurrentUserSubscribed()) {
            return $submit_field;
        }

        $label = $this->settingsService->getString('comment_optin_label');
        if ($label === '') {
            $label = __('Subscribe to our newsletter', 'kelune-crm');
        }

        $checkbox = sprintf(
            '<p class="comment-form-kelune-crm-optin comment-form-cookies-consent">'
                . '<input id="%1$s" name="%1$s" type="checkbox" value="yes"%2$s>'
                . ' <label for="%1$s">%3$s</label>'
                . '</p>',
            esc_attr(self::FIELD_NAME),
            $this->settingsService->isEnabled('comment_optin_auto_checked') ? ' checked="checked"' : '',
            esc_html($label)
        );

        return $checkbox . $submit_field;
    }

    /**
     * A comment was submitted.
     *
     * @param int $comment_id
     * @param int|string $comment_approved 1, 0 or 'spam'
     * @param array<string, mixed> $comment_data
     */
    public function onCommentPost($comment_id, $comment_approved, $comment_data): void
    {
        if ($comment_approved === 'spam') {
            return;
        }

        // Checked against the setting as well as the posted field: a cached
        // page can keep serving the checkbox after the feature is turned off,
        // and that must not keep creating contacts.
        if (!$this->settingsService->isEnabled('comment_optin_enabled')) {
            return;
        }

        // Reading a field of the comment form, whose own submission WordPress
        // has already validated by the time comment_post fires, so no separate
        // nonce applies here.
        // phpcs:disable WordPress.Security.NonceVerification.Missing
        $checked = isset($_POST[self::FIELD_NAME])
            && sanitize_text_field(wp_unslash((string) $_POST[self::FIELD_NAME])) === 'yes';
        // phpcs:enable WordPress.Security.NonceVerification.Missing

        if (!$checked) {
            return;
        }

        $email = sanitize_email((string) ($comment_data['comment_author_email'] ?? ''));
        if ($email === '' || !is_email($email)) {
            return;
        }

        $name = sanitize_text_field((string) ($comment_data['comment_author'] ?? ''));
        $parts = $name !== '' ? explode(' ', $name, 2) : [];

        $data = array_filter([
            'email' => $email,
            'first_name' => $parts[0] ?? '',
            'last_name' => $parts[1] ?? '',
            'ip_address' => sanitize_text_field((string) ($comment_data['comment_author_IP'] ?? '')),
            'source' => 'comment_form',
        ]);

        $userId = absint($comment_data['user_id'] ?? 0);
        if ($userId > 0) {
            $data['user_id'] = $userId;
        }

        $this->syncService->createOrUpdate($data, [
            'list_ids' => $this->settingsService->getIds('comment_optin_list_ids'),
            'tag_ids' => $this->settingsService->getIds('comment_optin_tag_ids'),
            'double_optin' => $this->settingsService->isEnabled('comment_optin_double_optin'),
        ]);
    }

    /**
     * Whether the logged-in visitor is already an active contact.
     *
     * Only answerable for logged-in users — an anonymous visitor's address is
     * unknown until they submit, so they always see the checkbox.
     */
    private function isCurrentUserSubscribed(): bool
    {
        $userId = get_current_user_id();
        if ($userId === 0) {
            return false;
        }

        $contact = $this->contactRepository->findByUserId($userId);

        if ($contact === null) {
            $user = wp_get_current_user();
            $contact = $this->contactRepository->findByEmail((string) $user->user_email);
        }

        return $contact !== null && $contact->get('status') === 'active';
    }
}
