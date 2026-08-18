<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

/**
 * Resolves the `{{tag}}` placeholders shared by every outgoing email.
 *
 * Contact values are escaped on the way in: they end up inside HTML email
 * bodies, so a name containing markup must render as text, not become live
 * HTML. Business values come from settings and are escaped the same way.
 */
class MergeTagService
{
    private SettingsService $settingsService;

    public function __construct()
    {
        $this->settingsService = new SettingsService();
    }

    /**
     * Contact-scoped tags.
     *
     * @param array<string, mixed> $contact
     * @return array<string, string>
     */
    public function contactTags(array $contact): array
    {
        $first_name = esc_html((string) ($contact['first_name'] ?? ''));
        $last_name = esc_html((string) ($contact['last_name'] ?? ''));

        return [
            '{{first_name}}' => $first_name,
            '{{last_name}}' => $last_name,
            '{{email}}' => esc_html((string) ($contact['email'] ?? '')),
            '{{full_name}}' => trim($first_name . ' ' . $last_name),
        ];
    }

    /**
     * Business-identity tags, available in every email regardless of recipient.
     *
     * @return array<string, string>
     */
    public function businessTags(): array
    {
        return [
            '{{business_name}}' => esc_html($this->settingsService->getString('business_name')),
            '{{business_address}}' => nl2br(esc_html($this->settingsService->getString('business_address'))),
        ];
    }

    /**
     * Replace every known tag in $content.
     *
     * @param array<string, mixed> $contact
     * @param array<string, string> $extra Additional tags, e.g. {{unsubscribe_url}}.
     */
    public function render(?string $content, array $contact = [], array $extra = []): string
    {
        $tags = array_merge($this->contactTags($contact), $this->businessTags(), $extra);

        /**
         * Filter the merge tags applied to an outgoing email.
         *
         * @param array<string, string> $tags
         * @param array<string, mixed> $contact
         */
        $tags = apply_filters('kelune_crm_merge_tags', $tags, $contact);

        return str_replace(array_keys($tags), array_values($tags), (string) $content);
    }
}
