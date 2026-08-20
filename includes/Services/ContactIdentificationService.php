<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Repositories\ContactRepository;

class ContactIdentificationService
{
    private \KeluneCRM\Repositories\ContactRepository $contactRepository;
    private string $cookieName = 'kelune_crm_contact_id';
    private int $cookieDuration = 30 * DAY_IN_SECONDS; // 30 days

    public function __construct()
    {
        $this->contactRepository = new ContactRepository();
    }

    /**
     * Identify contact from request
     */
    public function identifyFromRequest(): ?int
    {
        // Try cookie first
        $contact_id = $this->identifyFromCookie();
        if ($contact_id) {
            return $contact_id;
        }

        // Try WordPress logged-in user
        $contact_id = $this->identifyFromWordPressUser();
        if ($contact_id) {
            return $contact_id;
        }

        // Public identifier link: authorised by the email/token in the query
        // string itself, not a nonce, so nonce verification does not apply here.
        // phpcs:disable WordPress.Security.NonceVerification.Recommended
        // Try email parameter
        if (!empty($_GET['email'])) {
            $email = sanitize_email(wp_unslash((string) $_GET['email']));
            $contact_id = $this->identifyFromEmail($email);
            if ($contact_id) {
                return $contact_id;
            }
        }

        // Try token parameter
        if (!empty($_GET['token'])) {
            $token = sanitize_text_field(wp_unslash((string) $_GET['token']));
            $contact_id = $this->identifyFromToken($token);
            if ($contact_id) {
                return $contact_id;
            }
        }
        // phpcs:enable WordPress.Security.NonceVerification.Recommended

        return null;
    }

    /**
     * Identify contact from cookie
     */
    public function identifyFromCookie(): ?int
    {
        if (isset($_COOKIE[$this->cookieName])) {
            $contact_id = (int) $_COOKIE[$this->cookieName];

            // Verify contact exists
            $contact = $this->contactRepository->find($contact_id);
            if ($contact) {
                return $contact_id;
            }
        }

        return null;
    }

    /**
     * Identify contact from WordPress logged-in user
     */
    public function identifyFromWordPressUser(): ?int
    {
        if (!is_user_logged_in()) {
            return null;
        }

        $user = wp_get_current_user();

        if (!$user->user_email) {
            return null;
        }

        $contact_id = $this->identifyFromEmail($user->user_email);

        return $contact_id;
    }

    /**
     * Identify contact from email
     *
     * @param string $email
     */
    public function identifyFromEmail($email): ?int
    {
        if (!is_email($email)) {
            return null;
        }

        $contact = $this->contactRepository->findByEmail($email);

        return $contact ? $contact->getId() : null;
    }

    /**
     * Identify contact from token
     * Token format: base64(contact_id:timestamp:hash)
     *
     * @param string $token
     */
    public function identifyFromToken($token): ?int
    {
        try {
            $decoded = base64_decode($token);
            $parts = explode(':', $decoded);

            if (count($parts) !== 3) {
                return null;
            }

            list($contact_id, $timestamp, $hash) = $parts;

            // Verify hash
            $expected_hash = hash_hmac('sha256', $contact_id . ':' . $timestamp, wp_salt());
            if (!hash_equals($expected_hash, $hash)) {
                return null;
            }

            // Check token not expired (valid for 7 days)
            if (time() - (int) $timestamp > 7 * DAY_IN_SECONDS) {
                return null;
            }

            // Verify contact exists
            $contact = $this->contactRepository->find((int) $contact_id);
            if ($contact) {
                return $contact->getId();
            }
        } catch (\Exception $e) {
            return null;
        }

        return null;
    }

    /**
     * Set contact cookie
     *
     * @param int $contact_id
     */
    public function setContactCookie($contact_id): void
    {
        $expires = time() + $this->cookieDuration;
        $path = (string) COOKIEPATH;
        $domain = (string) COOKIE_DOMAIN;

        setcookie(
            $this->cookieName,
            (string) $contact_id,
            $expires,
            $path,
            $domain,
            is_ssl(),
            true // HTTP only
        );
    }
}
