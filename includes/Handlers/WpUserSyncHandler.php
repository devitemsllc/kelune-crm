<?php

declare(strict_types=1);

namespace KeluneCRM\Handlers;

use KeluneCRM\Models\Contact;
use KeluneCRM\Repositories\ContactRepository;
use KeluneCRM\Services\ContactSyncService;
use KeluneCRM\Services\SettingsService;

/**
 * Keeps WordPress users and CRM contacts in step.
 *
 * Two independent features live here, each with its own setting:
 *  - "User Signup Opt-in": create a contact when someone registers.
 *  - "Auto Sync User Data": push later profile edits onto the linked contact,
 *    and optionally delete the contact when the user is deleted.
 *
 * The sync is one-way (WordPress → CRM). A CRM edit is never pushed back onto
 * the user account: the CRM holds marketing data, WordPress holds the account.
 */
class WpUserSyncHandler
{
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
        // Late priority: let registration plugins finish writing their profile
        // fields before we map the user onto a contact.
        add_action('user_register', [$this, 'onUserRegister'], 99, 1);
        add_action('profile_update', [$this, 'onProfileUpdate'], 10, 2);
        // `delete_user` fires before the row is gone, so the user object is
        // still readable for the email fallback lookup.
        add_action('delete_user', [$this, 'onDeleteUser'], 10, 3);
    }

    /**
     * A user registered on the site.
     */
    public function onUserRegister(int $user_id): void
    {
        // On multisite the network admin creating a user is an administrative
        // action, not that person opting in to anything.
        if (is_multisite() && is_network_admin()) {
            return;
        }

        $user = get_user_by('ID', $user_id);
        if (!$user instanceof \WP_User) {
            return;
        }

        if (!$this->settingsService->isEnabled('signup_optin_enabled')) {
            // Opt-in is off, but if this address is already a contact we still
            // link the accounts — that costs nothing and is what makes profile
            // sync work for pre-existing contacts.
            $this->linkExistingContact($user);
            return;
        }

        $this->syncService->createOrUpdate(
            array_merge($this->syncService->mapWpUser($user), ['source' => 'wp_signup']),
            [
                'list_ids' => $this->settingsService->getIds('signup_optin_list_ids'),
                'tag_ids' => $this->settingsService->getIds('signup_optin_tag_ids'),
                'double_optin' => $this->settingsService->isEnabled('signup_optin_double_optin'),
            ]
        );
    }

    /**
     * A user profile was edited.
     */
    public function onProfileUpdate(int $user_id, \WP_User $old_user_data): void
    {
        if (is_multisite() && is_network_admin()) {
            return;
        }

        if (!$this->settingsService->isEnabled('sync_users_enabled')) {
            return;
        }

        $user = get_user_by('ID', $user_id);
        if (!$user instanceof \WP_User) {
            return;
        }

        $contact = $this->resolveContact($user_id, (string) $old_user_data->user_email);
        if ($contact === null) {
            return;
        }

        // WordPress owns the account address, so any divergence is resolved in
        // its favour — including a CRM-side edit the account never saw. Doing
        // this before the upsert is what stops the field sync below from
        // creating a second contact for the same person.
        if (strcasecmp((string) $contact->get('email'), (string) $user->user_email) !== 0) {
            if (!$this->applyEmailChange($contact, $user)) {
                return;
            }
        }

        $this->syncService->createOrUpdate($this->syncService->mapWpUser($user), []);
    }

    /**
     * A user is about to be deleted.
     *
     * @param int $reassign_id
     */
    public function onDeleteUser(int $user_id, $reassign_id, \WP_User $user): void
    {
        if (is_multisite() && is_network_admin()) {
            return;
        }

        if (!$this->settingsService->isEnabled('sync_delete_contact_on_user_delete')) {
            // The account is going away but the contact stays. Unlink it so the
            // stale user_id cannot later collide with a recycled WordPress id.
            $contact = $this->contactRepository->findByUserId($user_id);
            if ($contact !== null) {
                $this->contactRepository->update(new Contact([
                    'id' => $contact->getId(),
                    'user_id' => null,
                ]));
            }
            return;
        }

        $contact = $this->resolveContact($user_id, (string) $user->user_email);
        if ($contact === null) {
            return;
        }

        $contactId = (int) $contact->getId();
        if ($this->contactRepository->delete($contactId)) {
            do_action('kelune_crm_contact_deleted', $contactId);
        }
    }

    /**
     * Point an already-known contact at this user account.
     */
    private function linkExistingContact(\WP_User $user): void
    {
        $contact = $this->contactRepository->findByEmail((string) $user->user_email);

        if ($contact === null || (int) $contact->get('user_id') === (int) $user->ID) {
            return;
        }

        $this->contactRepository->update(new Contact([
            'id' => $contact->getId(),
            'user_id' => (int) $user->ID,
        ]));
    }

    /**
     * Find the contact for a user: by the account link first, then by the
     * address the account had before this edit.
     */
    private function resolveContact(int $user_id, string $previous_email): ?Contact
    {
        return $this->contactRepository->findByUserId($user_id)
            ?? $this->contactRepository->findByEmail($previous_email);
    }

    /**
     * Move a contact onto the user's new address.
     *
     * @return bool False when the caller should stop: another contact already
     *              owns the new address, so this one is unlinked instead of
     *              being merged into it.
     */
    private function applyEmailChange(Contact $contact, \WP_User $user): bool
    {
        $newEmail = (string) $user->user_email;
        $owner = $this->contactRepository->findByEmail($newEmail);

        if ($owner !== null && (int) $owner->getId() !== (int) $contact->getId()) {
            // `email` is unique, so we cannot rename into an existing row.
            // Hand the account link to the contact that owns the address and
            // leave the old contact intact — merging two contacts silently
            // would destroy history no one asked us to touch.
            $this->contactRepository->update(new Contact([
                'id' => $contact->getId(),
                'user_id' => null,
            ]));
            $this->contactRepository->update(new Contact([
                'id' => $owner->getId(),
                'user_id' => (int) $user->ID,
            ]));

            return false;
        }

        $this->contactRepository->update(new Contact([
            'id' => $contact->getId(),
            'email' => $newEmail,
            'user_id' => (int) $user->ID,
        ]));

        return true;
    }
}
