<?php

declare(strict_types=1);

namespace KeluneCRM\Models;

class ContactList
{
    /** @var int|null */
    public $id;

    /** @var string|null */
    public $name;

    /** @var string|null */
    public $description;

    /** @var string|null */
    public $status;

    /** @var string|null */
    public $type;

    /** @var string|array<string, mixed>|null */
    public $conditions;

    /** @var int|null */
    public $contact_count;

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
        $this->status = $data['status'] ?? 'active';
        $this->type = $data['type'] ?? 'manual';

        if (isset($data['conditions'])) {
            $this->conditions = is_string($data['conditions'])
                ? json_decode($data['conditions'], true)
                : $data['conditions'];
        } else {
            $this->conditions = null;
        }

        $this->contact_count = isset($data['contact_count']) ? (int) $data['contact_count'] : 0;
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
            'status' => $this->status,
            'type' => $this->type,
            'conditions' => $this->conditions,
            'contact_count' => (int) $this->contact_count,
            'created_by' => $this->created_by,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}
