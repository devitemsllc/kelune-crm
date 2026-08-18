<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Models\Contact;
use KeluneCRM\Repositories\ContactRepository;

/**
 * Double opt-in confirmation flow.
 *
 * A contact created through an automatic entry point with double opt-in on is
 * stored as `pending` and holds a single-use `optin_token`. It receives no
 * campaign email (see CampaignRepository::getRecipientIds) until it follows the
 * confirmation link, which flips it to `active`, marks the address verified and
 * burns the token.
 */
class DoubleOptinService
{
    /** Token prefix, matching the plugin's other public tokens (kelunecrmsl_, kelunecrmlt_, kelunecrmwh_). */
    public const TOKEN_PREFIX = 'kelunecrmdo_';

    private ContactRepository $contactRepository;
    private SettingsService $settingsService;

    public function __construct()
    {
        $this->contactRepository = new ContactRepository();
        $this->settingsService = new SettingsService();
    }

    /**
     * Mint a confirmation token. CSPRNG-backed: the token is the only thing
     * standing between a stranger and confirming someone else's address.
     */
    public static function generateToken(): string
    {
        return self::TOKEN_PREFIX . bin2hex(random_bytes(24));
    }

    public function getConfirmationUrl(string $token): string
    {
        return rest_url('kelune-crm/v1/optin/confirm/' . $token);
    }

    /**
     * Send (or resend) the confirmation email for a pending contact.
     *
     * @return bool|\WP_Error
     */
    public function sendConfirmationEmail(Contact $contact)
    {
        $email = (string) $contact->get('email');
        if ($email === '' || !is_email($email)) {
            return new \WP_Error('invalid_contact', __('Contact has no valid email address.', 'kelune-crm'));
        }

        $token = (string) $contact->get('optin_token');

        // A contact can be pending without a token — e.g. it was set pending
        // before this flow existed, or the token was already burned. Mint one
        // rather than sending a dead link.
        if ($token === '') {
            $token = self::generateToken();
            $this->contactRepository->update(new Contact([
                'id' => $contact->getId(),
                'optin_token' => $token,
            ]));
            $contact->set('optin_token', $token);
        }

        $mergeTags = new MergeTagService();
        $contactData = $contact->toArray();
        $extra = ['{{confirmation_url}}' => esc_url($this->getConfirmationUrl($token))];

        $subject = wp_strip_all_tags($mergeTags->render(
            $this->settingsService->getString('optin_email_subject'),
            $contactData,
            $extra
        ));

        $body = (new EmailHtmlRenderer())->renderHtml(
            $mergeTags->render($this->settingsService->getString('optin_email_body'), $contactData, $extra)
        );

        /**
         * Fires before a double opt-in confirmation email is sent.
         *
         * @param int $contact_id
         * @param string $token
         */
        do_action('kelune_crm_optin_confirmation_sending', (int) $contact->getId(), $token);

        return (new EmailService())->sendTransactional($email, $subject, $body);
    }

    /**
     * Confirm a subscription from its token.
     *
     * @return Contact|\WP_Error The confirmed contact, or an error when the
     *                           token is unknown or already used.
     */
    public function confirm(string $token)
    {
        $contact = $this->contactRepository->findByOptinToken($token);

        if ($token === '' || $contact === null) {
            return new \WP_Error(
                'invalid_token',
                __('This confirmation link is invalid or has already been used.', 'kelune-crm'),
                ['status' => 404]
            );
        }

        $contactId = (int) $contact->getId();

        // Burning the token here makes the link single-use: a replayed request
        // (or a mail scanner following it twice) finds nothing to confirm.
        $this->contactRepository->update(new Contact([
            'id' => $contactId,
            'status' => 'active',
            'email_verified' => 1,
            'optin_token' => '',
        ]));

        $confirmed = $this->contactRepository->find($contactId);
        if ($confirmed === null) {
            return new \WP_Error('invalid_token', __('Contact not found.', 'kelune-crm'), ['status' => 404]);
        }

        do_action('kelune_crm_contact_updated', $contactId, $confirmed->toArray());

        /**
         * Fires once a contact confirms their subscription.
         *
         * @param int $contact_id
         * @param array<string, mixed> $contact
         */
        do_action('kelune_crm_optin_confirmed', $contactId, $confirmed->toArray());

        return $confirmed;
    }
}
