<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

/**
 * Resolves the avatar URL for a contact.
 *
 * Callers get one `avatar_url` and do not care where it came from, so the
 * source can change without touching the dashboard. Precedence:
 *
 *  1. The contact's stored avatar_url column. First-party data the site owns,
 *     so NOT gated on use_gravatar_service — that setting governs disclosure to
 *     Gravatar, and serving an avatar the site holds discloses nothing.
 *  2. The contact's Gravatar, when the admin has opted in.
 *  3. Empty string — the dashboard renders initials.
 */
class AvatarService
{
    private GravatarService $gravatarService;

    public function __construct(?GravatarService $gravatarService = null)
    {
        $this->gravatarService = $gravatarService ?? new GravatarService();
    }

    /**
     * @param string|null $storedAvatarUrl The contact's avatar_url column.
     * @param string $email The contact's email, for the Gravatar fallback.
     * @return string A URL, or '' when the contact has no avatar.
     */
    public function forContact(?string $storedAvatarUrl, string $email): string
    {
        $stored = trim((string) $storedAvatarUrl);
        if ($stored !== '') {
            // Escaped on the way out: this lands in an <img src> and nothing
            // writes the column yet, so whatever eventually does (an upload, an
            // import) cannot make this the place a bad URL slips through.
            return esc_url_raw($stored);
        }

        return $this->gravatarService->urlFor($email) ?? '';
    }
}
