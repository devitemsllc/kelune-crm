<?php

declare(strict_types=1);

namespace KeluneCRM\Models;

class CustomField
{
    /** @var int|null */
    public $id;

    /** @var string|null */
    public $field_key;

    /** @var string|null */
    public $field_label;

    /** @var string|null */
    public $field_type;

    /** @var array<string, mixed> */
    public $field_options;

    /** @var string|null */
    public $field_default;
    /**
     * @var int
     */
    public $field_required;
    /**
     * @var int
     */
    public $field_order;

    /** @var string|null */
    public $created_at;

    /** @param array<string, mixed> $data */
    public function __construct($data = [])
    {
        $this->id = isset($data['id']) ? (int) $data['id'] : null;
        $this->field_key = $data['field_key'] ?? '';
        $this->field_label = $data['field_label'] ?? '';
        $this->field_type = $data['field_type'] ?? 'text';
        $this->field_options = $this->decodeJsonField($data['field_options'] ?? null);

        $this->field_default = $data['field_default'] ?? '';
        $this->field_required = (int) ($data['field_required'] ?? 0);
        $this->field_order = (int) ($data['field_order'] ?? 0);
        $this->created_at = $data['created_at'] ?? null;
    }

    /**
     * @param mixed $value
     * @return array<string, mixed>
     */
    private function decodeJsonField($value): array
    {
        if (is_null($value) || $value === '') {
            return [];
        }
        if (is_array($value)) {
            return $value;
        }
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'field_key' => $this->field_key,
            'field_label' => $this->field_label,
            'field_type' => $this->field_type,
            'field_options' => $this->field_options,
            'field_default' => $this->field_default,
            'field_required' => $this->field_required,
            'field_order' => $this->field_order,
            'created_at' => $this->created_at,
        ];
    }

    /** @return array<int, string> Error messages (empty if valid) */
    public function validate(): array
    {
        $errors = [];

        if (empty($this->field_label)) {
            $errors[] = __('Field label is required', 'kelune-crm');
        }

        if (empty($this->field_key)) {
            $errors[] = __('Field key is required', 'kelune-crm');
        }

        if (empty($this->field_type)) {
            $errors[] = __('Field type is required', 'kelune-crm');
        }

        $valid_types = ['text', 'textarea', 'number', 'email', 'url', 'phone', 'select', 'radio', 'checkbox', 'date', 'datetime'];
        if (!in_array($this->field_type, $valid_types)) {
            $errors[] = __('Invalid field type', 'kelune-crm');
        }

        if (in_array($this->field_type, ['select', 'radio', 'checkbox'])) {
            if (empty($this->field_options['choices']) || !is_array($this->field_options['choices'])) {
                /* translators: %s: field type (select, radio, or checkbox) */
                $errors[] = sprintf(__('Choices are required for %s field type', 'kelune-crm'), $this->field_type);
            }
        }

        return $errors;
    }

    /**
     * Normalise an arbitrary label into a valid field key.
     */
    public static function sanitizeKey(string $key): string
    {
        $key = strtolower($key);
        $key = preg_replace('/[^a-z0-9_]/', '', str_replace(' ', '_', $key));
        return $key ?? '';
    }
}
