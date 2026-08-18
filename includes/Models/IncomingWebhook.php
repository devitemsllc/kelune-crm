<?php

declare(strict_types=1);

namespace KeluneCRM\Models;

if (!defined('ABSPATH')) {
    exit;
}

class IncomingWebhook
{
    /** @var int|null */
    public $id;

    /** @var string|null */
    public $webhook_name;

    /** @var string|null */
    public $webhook_key;

    /** @var string|null */
    public $description;

    /** @var string|array<int|string>|null */
    public $default_lists;

    /** @var string|array<int|string>|null */
    public $default_tags;

    /** @var string|array<int|string>|null */
    public $allowed_actions;

    /** @var string|null */
    public $status;

    /** @var string|null */
    public $ip_whitelist;

    /** @var int|null */
    public $total_requests;

    /** @var string|null */
    public $last_used_at;

    /** @var string|null */
    public $created_at;

    /** @var string|null */
    public $updated_at;

    /** @param array<string, mixed> $data */
    public function __construct($data = [])
    {
        foreach ($data as $key => $value) {
            if (property_exists($this, $key)) {
                $this->$key = $value;
            }
        }

        $this->id = isset($this->id) ? (int) $this->id : null;

        if (is_string($this->allowed_actions)) {
            $this->allowed_actions = json_decode($this->allowed_actions, true) ?: [];
        }

        if (is_string($this->default_lists)) {
            $this->default_lists = json_decode($this->default_lists, true) ?: [];
            $this->default_lists = array_map('intval', $this->default_lists);
        }

        if (is_string($this->default_tags)) {
            $this->default_tags = json_decode($this->default_tags, true) ?: [];
            $this->default_tags = array_map('intval', $this->default_tags);
        }
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'webhook_name' => $this->webhook_name,
            'webhook_key' => $this->webhook_key,
            'description' => $this->description,
            'default_lists' => $this->default_lists,
            'default_tags' => $this->default_tags,
            'allowed_actions' => $this->allowed_actions,
            'status' => $this->status,
            'ip_whitelist' => $this->ip_whitelist,
            'total_requests' => (int) $this->total_requests,
            'last_used_at' => $this->last_used_at,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    /** @param mixed $action */
    public function isActionAllowed($action): bool
    {
        if (empty($this->allowed_actions)) {
            return false;
        }

        return in_array($action, (array) $this->allowed_actions);
    }

    public function isIpAllowed(string $ip_address): bool
    {
        if (empty($this->ip_whitelist)) {
            return true;
        }

        $allowed_ips = preg_split('/[\s,]+/', $this->ip_whitelist, -1, PREG_SPLIT_NO_EMPTY) ?: [];

        foreach ($allowed_ips as $allowed_ip) {
            $allowed_ip = trim($allowed_ip);

            if ($ip_address === $allowed_ip) {
                return true;
            }

            if (strpos($allowed_ip, '/') !== false) {
                if ($this->ipInCidr($ip_address, $allowed_ip)) {
                    return true;
                }
            }
        }

        return false;
    }

    private function ipInCidr(string $ip, string $cidr): bool
    {
        list($subnet, $mask) = explode('/', $cidr);

        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
            $ip_long = ip2long($ip);
            $subnet_long = ip2long($subnet);
            $mask_long = -1 << (32 - (int) $mask);
            return ($ip_long & $mask_long) === ($subnet_long & $mask_long);
        }

        return false;
    }

    public static function generateWebhookKey(): string
    {
        return 'kelunecrmwh_' . bin2hex(random_bytes(28));
    }

    /**
     * @return array<string, string>
     */
    public function validate(bool $skip_key_validation = false): array
    {
        $errors = [];

        if (empty($this->webhook_name)) {
            $errors['webhook_name'] = __('Webhook name is required', 'kelune-crm');
        }

        if (!$skip_key_validation && empty($this->webhook_key)) {
            $errors['webhook_key'] = __('Webhook key is required', 'kelune-crm');
        }

        if (empty($this->allowed_actions) || !is_array($this->allowed_actions)) {
            $errors['allowed_actions'] = __('At least one allowed action must be selected', 'kelune-crm');
        }

        return $errors;
    }
}
