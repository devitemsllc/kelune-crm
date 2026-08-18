<?php

declare(strict_types=1);

namespace KeluneCRM\Models;

class EmailTemplate
{
    /** @var int|null */
    public $id;

    /** @var string|null */
    public $name;

    /** @var string|null */
    public $description;

    /** @var string|null */
    public $thumbnail_url;

    /** @var string|null */
    public $template_type;

    /** @var string|null */
    public $html_content;

    /** @var string|array<string, mixed>|null */
    public $json_structure;

    /** @var int|bool|null */
    public $is_favorite;

    /** @var int|null */
    public $usage_count;

    /** @var string|null */
    public $last_used_at;

    /** @var int|null */
    public $created_by;

    /** @var string|null */
    public $created_at;

    /** @var string|null */
    public $updated_at;

    /** @param array<string, mixed> $data */
    public function __construct($data = [])
    {
        if (!empty($data)) {
            $this->fill($data);
        }
    }

    /** @param array<string, mixed> $data */
    private function fill($data): void
    {
        $this->id = isset($data['id']) ? (int) $data['id'] : null;
        $this->name = $data['name'] ?? '';
        $this->description = $data['description'] ?? '';
        $this->thumbnail_url = $data['thumbnail_url'] ?? '';
        $this->template_type = $data['template_type'] ?? 'custom';
        $this->html_content = $data['html_content'] ?? '';

        // JSON decode json_structure if it's a string. Legacy rows may be
        // double-encoded (a JSON string of a JSON string); decode once more so
        // they still resolve to the object shape the builder expects.
        if (isset($data['json_structure'])) {
            $decoded = is_string($data['json_structure'])
                ? json_decode($data['json_structure'], true)
                : $data['json_structure'];

            if (is_string($decoded)) {
                $decoded = json_decode($decoded, true);
            }

            $this->json_structure = $decoded;
        } else {
            $this->json_structure = null;
        }

        $this->is_favorite = isset($data['is_favorite']) ? (bool) $data['is_favorite'] : false;
        $this->usage_count = $data['usage_count'] ?? 0;
        $this->last_used_at = $data['last_used_at'] ?? null;
        $this->created_by = isset($data['created_by']) ? (int) $data['created_by'] : null;
        $this->created_at = $data['created_at'] ?? null;
        $this->updated_at = $data['updated_at'] ?? null;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'thumbnail_url' => $this->thumbnail_url,
            'template_type' => $this->template_type,
            'html_content' => $this->html_content,
            'json_structure' => $this->json_structure,
            'is_favorite' => $this->is_favorite,
            'usage_count' => (int) $this->usage_count,
            'last_used_at' => $this->last_used_at,
            'created_by' => $this->created_by,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    public function isPredefined(): bool
    {
        return $this->template_type === 'predefined';
    }
}
