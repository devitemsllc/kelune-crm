<?php

declare(strict_types=1);

namespace KeluneCRM\Models;

/**
 * A single email sending connection (SMTP / SES / Mailgun / SendGrid) bound to a
 * specific sender address. Credentials are stored as JSON and exposed to the
 * provider drivers through {@see toProviderConfig()} using the flat keys those
 * drivers already expect.
 */
class EmailProvider
{
    /** @var int|null */
    public $id;

    /** @var string */
    public $name;

    /** @var string */
    public $provider_type;

    /** @var string */
    public $sender_name;

    /** @var string */
    public $sender_email;

    /** @var string */
    public $reply_to;

    /** @var string */
    public $region;

    /** @var array<string, mixed> */
    public $credentials;

    /** @var array<string, mixed> */
    public $settings;

    /** @var array<int, string> */
    public $verified_senders;

    /** @var bool */
    public $is_default;

    /** @var string */
    public $status;

    /** @var int|null */
    public $created_by;

    /** @var string|null */
    public $created_at;

    /** @var string|null */
    public $updated_at;

    /**
     * Credential keys that must never be sent to the browser in plaintext.
     *
     * @var array<int, string>
     */
    public const SECRET_CREDENTIAL_KEYS = [
        'smtp_password',
        'ses_secret_access_key',
        'mailgun_api_key',
        'sendgrid_api_key',
    ];

    /** @param array<string, mixed> $data */
    public function __construct($data = [])
    {
        $this->id = isset($data['id']) ? (int) $data['id'] : null;
        $this->name = (string) ($data['name'] ?? '');
        $this->provider_type = (string) ($data['provider_type'] ?? '');
        $this->sender_name = (string) ($data['sender_name'] ?? '');
        $this->sender_email = (string) ($data['sender_email'] ?? '');
        $this->reply_to = (string) ($data['reply_to'] ?? '');
        $this->region = (string) ($data['region'] ?? '');
        $this->credentials = $this->decodeAssoc($data['credentials'] ?? null);
        $this->settings = $this->decodeAssoc($data['settings'] ?? null);
        $this->verified_senders = $this->decodeList($data['verified_senders'] ?? null);
        $this->is_default = (bool) ($data['is_default'] ?? false);
        $this->status = (string) ($data['status'] ?? 'active');
        $this->created_by = isset($data['created_by']) ? (int) $data['created_by'] : null;
        $this->created_at = $data['created_at'] ?? null;
        $this->updated_at = $data['updated_at'] ?? null;
    }

    /**
     * Decode a JSON object column into an associative array.
     *
     * @param mixed $value
     * @return array<string, mixed>
     */
    private function decodeAssoc($value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (is_string($value) && $value !== '') {
            $decoded = json_decode($value, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }

        return [];
    }

    /**
     * Decode a JSON array column into a list of strings.
     *
     * @param mixed $value
     * @return array<int, string>
     */
    private function decodeList($value): array
    {
        if (is_string($value) && $value !== '') {
            $value = json_decode($value, true);
        }

        if (!is_array($value)) {
            return [];
        }

        return array_values(array_map('strval', $value));
    }

    /**
     * Sender emails an admin registered manually, in the settings JSON — kept
     * out of the auto-enumerated verified_senders so re-enumeration keeps them.
     *
     * @return array<int, string>
     */
    public function manualSenders(): array
    {
        $list = $this->settings['manual_senders'] ?? [];

        return is_array($list) ? array_values(array_map('strval', $list)) : [];
    }

    /**
     * Every address this connection may send as, most-authoritative first: its
     * bound sender_email, the provider-enumerated verified senders, and the
     * admin's manual additions. Entries may be full addresses or bare domains.
     *
     * @return array<int, string>
     */
    public function allowedSenders(): array
    {
        $senders = array_merge(
            $this->sender_email !== '' ? [$this->sender_email] : [],
            $this->verified_senders,
            $this->manualSenders()
        );

        return array_values(array_unique(array_map(
            static fn (string $s): string => strtolower(trim($s)),
            $senders
        )));
    }

    /**
     * Whether this connection may send as the given From address. Matching is by
     * EXACT email — a verified DOMAIN only gates which addresses an admin may
     * register manually, it is never a routing wildcard.
     */
    public function ownsSender(string $email): bool
    {
        $email = strtolower(trim($email));
        if ($email === '') {
            return false;
        }

        foreach ($this->allowedSenders() as $entry) {
            if ($entry !== '' && strpos($entry, '@') !== false && $entry === $email) {
                return true;
            }
        }

        return false;
    }

    /**
     * Public-facing representation. Credentials are masked so secrets never reach
     * the browser; the client sends a sentinel back for unchanged secrets.
     *
     * @param string $secret_mask Sentinel used to mask stored secret values.
     * @return array<string, mixed>
     */
    public function toArray(string $secret_mask = ''): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'provider_type' => $this->provider_type,
            'sender_name' => $this->sender_name,
            'sender_email' => $this->sender_email,
            'reply_to' => $this->reply_to,
            'region' => $this->region,
            'credentials' => $secret_mask !== '' ? $this->maskCredentials($secret_mask) : $this->credentials,
            'settings' => $this->settings,
            'verified_senders' => $this->verified_senders,
            'manual_senders' => $this->manualSenders(),
            'allowed_senders' => $this->allowedSenders(),
            'is_default' => $this->is_default,
            'status' => $this->status,
            'created_by' => $this->created_by,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    /**
     * Return credentials with any non-empty secret replaced by the sentinel.
     *
     * @param string $secret_mask
     * @return array<string, mixed>
     */
    private function maskCredentials(string $secret_mask): array
    {
        $masked = $this->credentials;

        foreach (self::SECRET_CREDENTIAL_KEYS as $key) {
            if (!empty($masked[$key])) {
                $masked[$key] = $secret_mask;
            }
        }

        return $masked;
    }

    /**
     * Build the flat config array the provider drivers consume. This bridges the
     * per-connection record to the existing driver keys (e.g. `ses_access_key_id`)
     * without each driver needing to know about the providers table.
     *
     * @return array<string, mixed>
     */
    public function toProviderConfig(): array
    {
        switch ($this->provider_type) {
            case 'smtp':
                return [
                    'smtp_host' => $this->credentials['smtp_host'] ?? '',
                    'smtp_port' => $this->credentials['smtp_port'] ?? 587,
                    'smtp_username' => (string) ($this->credentials['smtp_username'] ?? ''),
                    'smtp_password' => (string) ($this->credentials['smtp_password'] ?? ''),
                    'smtp_encryption' => $this->credentials['smtp_encryption'] ?? 'tls',
                    'smtp_auto_tls' => $this->settings['smtp_auto_tls'] ?? 'yes',
                ];
            case 'ses':
                return [
                    'ses_access_key_id' => (string) ($this->credentials['ses_access_key_id'] ?? ''),
                    'ses_secret_access_key' => (string) ($this->credentials['ses_secret_access_key'] ?? ''),
                    'ses_region' => $this->region !== '' ? $this->region : 'us-east-1',
                ];
            case 'mailgun':
                return [
                    'mailgun_api_key' => (string) ($this->credentials['mailgun_api_key'] ?? ''),
                    'mailgun_domain' => (string) ($this->credentials['mailgun_domain'] ?? ''),
                    'mailgun_region' => $this->region !== '' ? $this->region : 'us',
                ];
            case 'sendgrid':
                return [
                    'sendgrid_api_key' => (string) ($this->credentials['sendgrid_api_key'] ?? ''),
                    'sendgrid_from_email' => $this->sender_email,
                    'sendgrid_from_name' => $this->sender_name,
                ];
            default:
                return [];
        }
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }
}
