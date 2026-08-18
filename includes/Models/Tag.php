<?php

declare(strict_types=1);

namespace KeluneCRM\Models;

class Tag
{
    /** @var int|null */
    public $id;

    /** @var string|null */
    public $name;

    /** @var string|null */
    public $slug;

    /** @var string|null */
    public $description;

    /** @var string|null */
    public $color;

    /** @var int|null */
    public $contact_count;

    /** @var string|null */
    public $created_at;

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
        $this->slug = $data['slug'] ?? '';
        $this->description = $data['description'] ?? '';
        $this->color = $data['color'] ?? '#000000';
        $this->contact_count = isset($data['contact_count']) ? (int) $data['contact_count'] : 0;
        $this->created_at = $data['created_at'] ?? null;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'slug' => $this->slug,
            'description' => $this->description,
            'color' => $this->color,
            'contact_count' => (int) $this->contact_count,
            'created_at' => $this->created_at,
        ];
    }
}
