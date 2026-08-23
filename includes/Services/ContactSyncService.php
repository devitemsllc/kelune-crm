<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Models\Contact;
use KeluneCRM\Repositories\ContactRepository;
use KeluneCRM\Support\CountryCode;

/**
 * Creates and updates contacts on behalf of the automatic entry points
 * (WordPress user registration, the comment form, user profile sync).
 *
 * Every one of those paths needs the same thing: upsert by email, never clear
 * a field that already has a value, attach the configured lists/tags, and fire
 * the same hooks the REST controller fires so automations behave identically
 * no matter where the contact came from.
 */
class ContactSyncService
{
    /**
     * Contact columns this service is allowed to write. Anything else in an
     * incoming array is ignored rather than passed through to the query.
     *
     * @var array<int, string>
     */
    private const WRITABLE_FIELDS = [
        'email', 'first_name', 'last_name', 'company', 'phone',
        'address_line1', 'address_line2', 'city', 'state', 'country',
        'postal_code', 'timezone', 'user_id', 'source', 'ip_address',
    ];

    private ContactRepository $contactRepository;

    public function __construct()
    {
        $this->contactRepository = new ContactRepository();
    }

    /**
     * Map a WordPress user onto contact fields.
     *
     * Empty values are dropped: a WP profile with no first name must not wipe a
     * first name the CRM already knows.
     *
     * @return array<string, mixed>
     */
    public function mapWpUser(\WP_User $user): array
    {
        $data = [
            'user_id' => (int) $user->ID,
            'email' => (string) $user->user_email,
            'first_name' => (string) $user->first_name,
            'last_name' => (string) $user->last_name,
        ];

        // Fall back to the display name when the profile has no real name, so
        // {{first_name}} in an email is not blank.
        if ($data['first_name'] === '' && $data['last_name'] === '' && $user->display_name !== '') {
            $parts = explode(' ', trim((string) $user->display_name), 2);
            $data['first_name'] = $parts[0];
            $data['last_name'] = $parts[1] ?? '';
        }

        /**
         * Filter the contact fields mapped from a WordPress user.
         *
         * @param array<string, mixed> $data
         * @param \WP_User $user
         */
        $data = apply_filters('kelune_crm_wp_user_contact_data', $data, $user);

        return array_filter($data, static fn ($value): bool => $value !== '' && $value !== null);
    }

    /**
     * Upsert a contact by email and apply the configured lists/tags.
     *
     * @param array<string, mixed> $data Contact fields. `email` is required.
     * @param array{list_ids?: array<int, int>, tag_ids?: array<int, int>, double_optin?: bool, source?: string} $options
     */
    public function createOrUpdate(array $data, array $options = []): ?Contact
    {
        $email = sanitize_email((string) ($data['email'] ?? ''));
        if ($email === '' || !is_email($email)) {
            return null;
        }
        $data['email'] = $email;

        $data = $this->sanitizeFields($data);
        $existing = $this->contactRepository->findByEmail($email);
        $doubleOptin = !empty($options['double_optin']);

        $contact = $existing !== null
            ? $this->updateExisting($existing, $data)
            : $this->createNew($data, $options, $doubleOptin);

        if ($contact === null) {
            return null;
        }

        $contactId = (int) $contact->getId();
        $this->attachTargets($contactId, $options);

        // Only a contact that is actually pending gets a confirmation email —
        // an already-confirmed subscriber who comments again is not downgraded
        // and is not asked to confirm a second time.
        if ($doubleOptin && $contact->get('status') === 'pending') {
            (new DoubleOptinService())->sendConfirmationEmail($contact);
        }

        return $contact;
    }

    /**
     * @param array<string, mixed> $data
     * @param array{list_ids?: array<int, int>, tag_ids?: array<int, int>, double_optin?: bool, source?: string} $options
     */
    private function createNew(array $data, array $options, bool $doubleOptin): ?Contact
    {
        $data['status'] = $doubleOptin ? 'pending' : 'active';
        $data['source'] = $data['source'] ?? sanitize_key((string) ($options['source'] ?? ''));

        if ($doubleOptin) {
            $data['optin_token'] = DoubleOptinService::generateToken();
        }

        $contact = new Contact($data);
        $id = $this->contactRepository->save($contact);

        if (!$id) {
            return null;
        }

        $contact->setId($id);

        do_action('kelune_crm_contact_created', (int) $id, $contact->toArray());

        return $contact;
    }

    /**
     * Merge new data into an existing contact without ever clearing a value.
     *
     * @param array<string, mixed> $data
     */
    private function updateExisting(Contact $existing, array $data): Contact
    {
        $changes = [];

        foreach ($data as $field => $value) {
            // Email is the lookup key and status is owned by the opt-in /
            // unsubscribe flow, so neither is overwritten here.
            if (in_array($field, ['email', 'status'], true)) {
                continue;
            }
            if ($value === '' || $value === null) {
                continue;
            }
            if ((string) $existing->get($field) === (string) $value) {
                continue;
            }
            $changes[$field] = $value;
        }

        if ($changes === []) {
            return $existing;
        }

        $updated = new Contact(array_merge(['id' => $existing->getId()], $changes));

        if (!$this->contactRepository->update($updated)) {
            return $existing;
        }

        $fresh = $this->contactRepository->find((int) $existing->getId());
        if ($fresh === null) {
            return $existing;
        }

        do_action('kelune_crm_contact_updated', (int) $fresh->getId(), $fresh->toArray());

        return $fresh;
    }

    /**
     * Attach the configured lists and tags, firing the same hooks the REST API
     * fires so list/tag automation triggers run for these contacts too.
     *
     * @param array{list_ids?: array<int, int>, tag_ids?: array<int, int>, double_optin?: bool, source?: string} $options
     */
    private function attachTargets(int $contactId, array $options): void
    {
        $listIds = array_values(array_filter(array_map('absint', $options['list_ids'] ?? [])));
        $tagIds = array_values(array_filter(array_map('absint', $options['tag_ids'] ?? [])));

        // addLists/addTags fire kelune_crm_lists_added / _tags_added
        // themselves for genuinely-new memberships, so no do_action here — that
        // would double-fire the automation triggers.
        if ($listIds !== []) {
            $this->contactRepository->addLists($contactId, $listIds);
        }

        if ($tagIds !== []) {
            $this->contactRepository->addTags($contactId, $tagIds);
        }
    }

    /**
     * Reduce an incoming array to writable, sanitized contact fields.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function sanitizeFields(array $data): array
    {
        $clean = [];

        foreach ($data as $field => $value) {
            if (!in_array($field, self::WRITABLE_FIELDS, true)) {
                continue;
            }

            $clean[$field] = match ($field) {
                'email' => sanitize_email((string) $value),
                'user_id' => absint($value),
                'source' => sanitize_key((string) $value),
                'country' => CountryCode::normalize($value),
                default => sanitize_text_field((string) $value),
            };
        }

        return $clean;
    }
}
