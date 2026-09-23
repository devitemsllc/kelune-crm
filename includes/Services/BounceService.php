<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Models\Contact;
use KeluneCRM\Repositories\CampaignRepository;
use KeluneCRM\Repositories\ContactRepository;
use KeluneCRM\Repositories\EmailLogRepository;
use KeluneCRM\Services\Bounce\BounceAttribution;
use KeluneCRM\Services\Bounce\BounceNormalizerInterface;

/**
 * Applies normalised delivery failures to contacts. The single writer of a
 * `bounced` or `complained` status from a feed.
 */
class BounceService
{
    public const DEFAULT_SOFT_BOUNCE_LIMIT = 5;

    /**
     * A weaker signal never overwrites a stronger one: an unsubscribe after a
     * spam report must not erase the report.
     *
     * @var array<string, int>
     */
    private const SUPPRESSION_RANK = [
        Contact::STATUS_UNSUBSCRIBED => 1,
        Contact::STATUS_BOUNCED => 2,
        Contact::STATUS_COMPLAINED => 3,
    ];

    /**
     * Status an unknown address is created with. Soft is absent: not evidence the address is dead.
     *
     * @var array<string, string>
     */
    private const UNKNOWN_ADDRESS_STATUS = [
        BounceNormalizerInterface::TYPE_HARD => Contact::STATUS_BOUNCED,
        BounceNormalizerInterface::TYPE_COMPLAINT => Contact::STATUS_COMPLAINED,
        BounceNormalizerInterface::TYPE_UNSUBSCRIBE => Contact::STATUS_UNSUBSCRIBED,
    ];

    private ContactRepository $contactRepository;
    private EmailLogRepository $emailLogRepository;
    private CampaignRepository $campaignRepository;
    private EmailLogService $emailLogService;

    public function __construct()
    {
        $this->contactRepository = new ContactRepository();
        $this->emailLogRepository = new EmailLogRepository();
        $this->campaignRepository = new CampaignRepository();
        $this->emailLogService = new EmailLogService();
    }

    /** Opt-in and any return to a mailable status clear old strikes. */
    public function register(): void
    {
        add_action('kelune_crm_optin_confirmed', [$this, 'onOptinConfirmed'], 10, 1);
        add_action('kelune_crm_contact_status_changed', [$this, 'onStatusChanged'], 10, 3);
    }

    public function onOptinConfirmed(int $contact_id): void
    {
        $this->contactRepository->resetSoftBounce($contact_id);
    }

    public function onStatusChanged(int $contact_id, string $old_status, string $new_status): void
    {
        if (Contact::isSendableStatus($new_status)) {
            $this->contactRepository->resetSoftBounce($contact_id);
        }
    }

    /**
     * @param array<int, array{email: string, type: string, reason: string, token: string, event_at: string, event_id: string}> $events
     * @return int Events that resolved to a contact and were acted on.
     */
    public function handleEvents(array $events, string $provider): int
    {
        $handled = 0;

        foreach ($events as $event) {
            if ($this->handleEvent($event, $provider)) {
                $handled++;
            }
        }

        return $handled;
    }

    /**
     * @param array{email?: string, type?: string, reason?: string, token?: string, event_at?: string, event_id?: string} $event
     */
    private function handleEvent(array $event, string $provider): bool
    {
        $email = sanitize_email((string) ($event['email'] ?? ''));
        $type = (string) ($event['type'] ?? '');
        $reason = sanitize_text_field((string) ($event['reason'] ?? ''));
        $token = sanitize_text_field((string) ($event['token'] ?? ''));
        $event_at = BounceAttribution::eventTime($event['event_at'] ?? null);

        if (!is_email($email) || '' === $type) {
            return false;
        }

        $contact = $this->contactRepository->findByEmail($email);
        $known_status = null !== $contact ? (string) $contact->get('status') : '';

        // Never twice for one failure: a tokenless redelivery would otherwise
        // walk the address fallback back onto the previous, delivered send.
        if (BounceNormalizerInterface::TYPE_HARD !== $type || Contact::STATUS_BOUNCED !== $known_status) {
            $this->attribute($type, $token, $email, $reason, $event_at, $provider);
        }

        if (null === $contact) {
            $contact = $this->maybeCreateSuppressedContact($email, $type, $reason);
        }

        if (null === $contact) {
            return false;
        }

        $contact_id = (int) $contact->getId();
        $status = (string) $contact->get('status');

        $data = [
            'provider' => $provider,
            'email' => $email,
            'reason' => $reason,
            'tracking_token' => $token,
        ];

        switch ($type) {
            case BounceNormalizerInterface::TYPE_HARD:
                return $this->suppress($contact_id, $status, Contact::STATUS_BOUNCED, 'email_bounced', $reason, $data);
            case BounceNormalizerInterface::TYPE_COMPLAINT:
                return $this->suppress($contact_id, $status, Contact::STATUS_COMPLAINED, 'email_complained', $reason, $data);
            case BounceNormalizerInterface::TYPE_UNSUBSCRIBE:
                return $this->suppress($contact_id, $status, Contact::STATUS_UNSUBSCRIBED, null, $reason, $data);
            case BounceNormalizerInterface::TYPE_SOFT:
                if (!$this->claimEvent($provider, (string) ($event['event_id'] ?? ''))) {
                    return false;
                }

                return $this->recordSoftBounce($contact_id, $status, $reason, $data);
            default:
                return false;
        }
    }

    /**
     * Best-effort: a tokenless event still suppresses the contact, it just cannot
     * say which send failed. Soft marks nothing — the message may still deliver.
     */
    private function attribute(
        string $type,
        string $token,
        string $email,
        string $reason,
        string $event_at,
        string $provider
    ): void {
        if (BounceNormalizerInterface::TYPE_COMPLAINT === $type) {
            $this->emailLogRepository->markComplained($token, $email, $event_at, $provider);

            return;
        }

        if (BounceNormalizerInterface::TYPE_HARD !== $type) {
            return;
        }

        $log = $this->emailLogRepository->markBounced($token, $email, $reason, $event_at, $provider);

        if (null !== $log) {
            if ((int) $log->campaign_id > 0) {
                $this->campaignRepository->markEmailBounced((string) $log->tracking_token, $reason);
            }

            return;
        }

        // No markable log row; the queue row may still be, given a token.
        $this->campaignRepository->markEmailBounced($token, $reason);
    }

    /**
     * Suppress once: a retried notification finds the status set and writes nothing.
     *
     * @param string|null          $event_type Timeline event, null for none.
     * @param array<string, mixed> $data
     */
    private function suppress(
        int $contact_id,
        string $current_status,
        string $target_status,
        ?string $event_type,
        string $reason,
        array $data
    ): bool {
        if ($current_status === $target_status) {
            return false;
        }

        $current_rank = self::SUPPRESSION_RANK[$current_status] ?? 0;

        if ($current_rank >= (self::SUPPRESSION_RANK[$target_status] ?? 0)) {
            return false;
        }

        $this->contactRepository->recordBounceReason($contact_id, $reason);

        // Claimed against the status just read, so two deliveries cannot both record it.
        if (!$this->contactRepository->updateStatus($contact_id, $target_status, $current_status)) {
            return false;
        }

        // Any opt-in link outstanding at this point predates the failure, so it
        // cannot stand as consent; a fresh cycle has to mint its own token.
        $this->contactRepository->clearOptinToken($contact_id);

        if ('email_bounced' === $event_type || 'email_complained' === $event_type) {
            $this->emailLogService->recordEmailEngagement($event_type, $contact_id, $data);
        }

        return true;
    }

    /** @param array<string, mixed> $data */
    private function recordSoftBounce(int $contact_id, string $current_status, string $reason, array $data): bool
    {
        if (!Contact::isSendableStatus($current_status) && Contact::STATUS_PENDING !== $current_status) {
            return false;
        }

        $count = $this->contactRepository->incrementSoftBounce($contact_id);
        $this->contactRepository->recordBounceReason($contact_id, $reason);

        $data['soft_bounce_count'] = $count;

        $this->emailLogService->recordEmailEngagement('email_soft_bounced', $contact_id, $data);

        /**
         * Fires each time a temporary delivery failure is counted.
         *
         * @param int                  $contact_id Contact.
         * @param int                  $count      Strikes accumulated so far.
         * @param array<string, mixed> $data       provider / email / reason / tracking_token.
         */
        do_action('kelune_crm_soft_bounce_recorded', $contact_id, $count, $data);

        if ($count >= $this->softBounceLimit()) {
            $this->suppress(
                $contact_id,
                $current_status,
                Contact::STATUS_BOUNCED,
                'email_bounced',
                $reason,
                $data
            );
        }

        return true;
    }

    /**
     * A strike is the one outcome that accumulates, so a redelivered report must
     * count once. A report with no id cannot be claimed and is counted.
     */
    private function claimEvent(string $provider, string $event_id): bool
    {
        if ('' === $event_id) {
            return true;
        }

        $key = 'kelune_crm_bounce_evt_' . md5($provider . '|' . $event_id);

        if (false !== get_transient($key)) {
            return false;
        }

        set_transient($key, 1, DAY_IN_SECONDS);

        return true;
    }

    private function softBounceLimit(): int
    {
        /**
         * Filters how many soft bounces an address absorbs before suppression.
         *
         * @param int $limit Strike limit.
         */
        $limit = (int) apply_filters('kelune_crm_soft_bounce_limit', self::DEFAULT_SOFT_BOUNCE_LIMIT);

        return max(1, $limit);
    }

    /** Unknown addresses are discarded unless the filter opts in: a leaked URL key must not grow the table. */
    private function maybeCreateSuppressedContact(string $email, string $type, string $reason): ?Contact
    {
        $status = self::UNKNOWN_ADDRESS_STATUS[$type] ?? '';

        if ('' === $status) {
            return null;
        }

        /**
         * Filters whether a bounce for an unknown address creates a contact.
         *
         * @param bool   $store Whether to store the unknown address.
         * @param string $email The bounced address.
         */
        if (!apply_filters('kelune_crm_store_bounced_unknown_email', false, $email)) {
            return null;
        }

        $contact = new Contact([
            'email' => $email,
            'status' => $status,
            'source' => 'bounce',
            'last_bounce_at' => current_time('mysql', true),
            'bounce_reason' => mb_substr($reason, 0, 255),
        ]);

        $id = $this->contactRepository->save($contact);

        if (!$id) {
            return null;
        }

        $contact->setId((int) $id);

        // No `kelune_crm_contact_created`: an address born suppressed must not enter automations.
        return $contact;
    }
}
