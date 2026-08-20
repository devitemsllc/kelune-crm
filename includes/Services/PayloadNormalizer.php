<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Converts a webhook payload — flat or nested — into the internal nested shape.
 */
class PayloadNormalizer
{
    /**
     * Normalize webhook payload to internal format
     *
     * @param array<string, mixed> $payload Raw payload from webhook request
     * @return array<string, mixed> Normalized payload
     */
    public function normalize(array $payload): array
    {
        if (isset($payload['data']) && is_array($payload['data'])) {
            return $this->normalizeNestedFormat($payload);
        }

        return $this->normalizeFlatFormat($payload);
    }

    /**
     * Normalize nested format payload
     *
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function normalizeNestedFormat(array $payload): array
    {
        /** @var array<string, mixed> $data */
        $data = is_array($payload['data'] ?? null) ? $payload['data'] : [];

        // Extract custom_field__* keys the same way the flat format does, so a
        // nested payload can use the field keys shown in the Usage tab too.
        $data = $this->extractCustomFields($data);

        // Ensure lists and tags are arrays of integers
        if (isset($data['lists'])) {
            $data['lists'] = $this->ensureIntArray($data['lists']);
        }

        if (isset($data['lists_remove'])) {
            $data['lists_remove'] = $this->ensureIntArray($data['lists_remove']);
        }

        if (isset($data['tags'])) {
            $data['tags'] = $this->ensureIntArray($data['tags']);
        }

        if (isset($data['tags_remove'])) {
            $data['tags_remove'] = $this->ensureIntArray($data['tags_remove']);
        }

        return ['data' => $data];
    }

    /**
     * Normalize flat format payload
     *
     * Converts:
     * - custom_field_* keys to custom_fields object
     * - Comma-separated lists to arrays
     * - Comma-separated tags to arrays
     *
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function normalizeFlatFormat(array $payload): array
    {
        $data = $this->extractCustomFields($payload);

        if (isset($data['lists'])) {
            $data['lists'] = $this->parseCommaSeparated($data['lists'], 'int');
        }

        if (isset($data['lists_remove'])) {
            $data['lists_remove'] = $this->parseCommaSeparated($data['lists_remove'], 'int');
        }

        if (isset($data['tags'])) {
            $data['tags'] = $this->parseCommaSeparated($data['tags'], 'int');
        }

        if (isset($data['tags_remove'])) {
            $data['tags_remove'] = $this->parseCommaSeparated($data['tags_remove'], 'int');
        }

        return ['data' => $data];
    }

    /**
     * Pull custom_field__* keys out into a nested custom_fields map.
     *
     * Prefixed keys are removed from the top level and merged into any existing
     * custom_fields object, so both payload formats accept the
     * custom_field__<field_key> keys documented in the webhook Usage tab.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function extractCustomFields(array $data): array
    {
        $customFields = isset($data['custom_fields']) && is_array($data['custom_fields'])
            ? $data['custom_fields']
            : [];

        foreach ($data as $key => $value) {
            if (strpos($key, 'custom_field__') === 0) {
                $fieldKey = substr($key, strlen('custom_field__'));
                $customFields[$fieldKey] = $value;
                unset($data[$key]);
            }
        }

        if (!empty($customFields)) {
            $data['custom_fields'] = $customFields;
        }

        return $data;
    }

    /**
     * Parse comma-separated values to array
     *
     * @param mixed $value String or array
     * @param string $type 'int' or 'string'
     * @return array<int, int|string>
     */
    private function parseCommaSeparated($value, string $type = 'string'): array
    {
        if (is_array($value)) {
            if ($type === 'int') {
                return array_map('intval', $value);
            }
            return array_map('trim', $value);
        }

        if (is_string($value)) {
            $items = array_filter(array_map('trim', explode(',', $value)));

            if ($type === 'int') {
                return array_map('intval', $items);
            }

            return $items;
        }

        if ($type === 'int') {
            return [(int) $value];
        }

        return [(string) $value];
    }

    /**
     * Ensure value is an array of integers
     *
     * @param mixed $value
     * @return array<int, int|string>
     */
    private function ensureIntArray($value): array
    {
        if (is_array($value)) {
            return array_map('intval', $value);
        }

        if (is_string($value)) {
            if (strpos($value, ',') !== false) {
                return $this->parseCommaSeparated($value, 'int');
            }
            return [intval($value)];
        }

        return [intval($value)];
    }
}
