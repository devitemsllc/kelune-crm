<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

/**
 * Derives Gravatar URLs for contacts.
 *
 * Loading a Gravatar tells a third party (Automattic) that someone is looking
 * at this contact, so the use_gravatar_service setting is enforced here,
 * at the point the URL is derived, rather than in the browser: when the setting
 * is off no URL is produced, so nothing is ever sent to the dashboard for it to
 * request. Callers get null and fall back to locally-rendered initials.
 */
class GravatarService
{
    private const BASE_URL = 'https://www.gravatar.com/avatar/';

    private SettingsService $settingsService;

    public function __construct(?SettingsService $settingsService = null)
    {
        $this->settingsService = $settingsService ?? new SettingsService();
    }

    public function isEnabled(): bool
    {
        return $this->settingsService->isEnabled('use_gravatar_service');
    }

    /**
     * The Gravatar URL for an email, or null when disabled or the email is
     * unusable.
     *
     * `d=404` makes Gravatar answer with 404 rather than a generated image when
     * the address has no account, which is what lets the dashboard fall back to
     * initials instead of showing a stranger's placeholder.
     *
     * @param string $email Raw contact email.
     * @param int $size Requested pixel size (Gravatar allows 1-2048).
     */
    public function urlFor(string $email, int $size = 80): ?string
    {
        if (!$this->isEnabled()) {
            return null;
        }

        $normalized = strtolower(trim($email));
        if ($normalized === '' || !is_email($normalized)) {
            return null;
        }

        // Gravatar accepts a SHA-256 hash of the normalized address; it is the
        // documented successor to the legacy MD5 form.
        $hash = hash('sha256', $normalized);
        $size = max(1, min(2048, $size));

        return add_query_arg(
            [
                's' => $size,
                'd' => '404',
            ],
            self::BASE_URL . $hash
        );
    }
}
