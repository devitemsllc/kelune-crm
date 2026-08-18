<?php

declare(strict_types=1);

namespace KeluneCRM\Models;

class Contact
{
    /** Mailable. The only status campaigns are queued for. */
    public const STATUS_ACTIVE = 'active';

    /** Awaiting double opt-in confirmation. */
    public const STATUS_PENDING = 'pending';

    /** Opted out — set by the unsubscribe link, or by hand on the contact. */
    public const STATUS_UNSUBSCRIBED = 'unsubscribed';

    /**
     * Mail to this address bounced. Normally set by bounce handling, but
     * assignable by hand so an admin can suppress an address they know is dead.
     */
    public const STATUS_BOUNCED = 'bounced';

    /**
     * Every status a contact may hold, and every one a user may assign by hand.
     * The single source of truth: the REST layer validates against it, and the
     * dashboard mirrors it in components/contacts/contactStatus.ts.
     *
     * @var list<string>
     */
    public const STATUSES = [
        self::STATUS_ACTIVE,
        self::STATUS_PENDING,
        self::STATUS_UNSUBSCRIBED,
        self::STATUS_BOUNCED,
    ];

    /**
     * Statuses that may receive marketing email (campaigns, automation email).
     *
     * Deliberately an allowlist, not a denylist of blocked statuses: a status
     * added later is non-mailable until it is named here, so the gate fails
     * closed. Transactional mail — the double opt-in confirmation a `pending`
     * contact must receive — does not pass through this gate at all.
     *
     * @var list<string>
     */
    public const SENDABLE_STATUSES = [
        self::STATUS_ACTIVE,
    ];

    public static function isValidStatus(mixed $status): bool
    {
        return is_string($status) && in_array($status, self::STATUSES, true);
    }

    /**
     * Whether marketing email may be sent to a contact holding this status.
     * Every marketing send path must consult this — see EmailService and
     * Processors\ActionProcessor.
     */
    public static function isSendableStatus(mixed $status): bool
    {
        /**
         * Filters the contact statuses that may receive marketing email.
         *
         * @param list<string> $statuses Allowlist of mailable contact statuses.
         */
        $sendable = apply_filters('kelune_crm_email_sendable_statuses', self::SENDABLE_STATUSES);

        return is_string($status) && in_array($status, (array) $sendable, true);
    }

    private ?int $id = null;

    /** @var array<string, mixed> */
    private array $data;

    /** @param array<string, mixed> $data */
    public function __construct(array $data = [])
    {
        $this->data = $data;
        if (isset($data['id'])) {
            $this->id = (int) $data['id'];
            $this->data['id'] = $this->id;
        }
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function setId(int $id): void
    {
        $this->id = $id;
        $this->data['id'] = $id;
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->data[$key] ?? $default;
    }

    public function set(string $key, mixed $value): void
    {
        $this->data[$key] = $value;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return $this->data;
    }

    public function __get(string $name): mixed
    {
        return $this->get($name);
    }

    public function __set(string $name, mixed $value)
    {
        $this->set($name, $value);
    }
}
