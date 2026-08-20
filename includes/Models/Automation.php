<?php

declare(strict_types=1);

namespace KeluneCRM\Models;

class Automation
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
    public $trigger_type;

    /** @var string|array<string, mixed>|null */
    public $trigger_config;

    /** @var string|array<string, mixed>|null */
    public $entry_conditions;

    /** @var string|array<string, mixed>|null */
    public $settings;

    /** @var string|array<string, mixed>|null */
    public $stats;

    /** @var int|null */
    public $total_enrolled;

    /** @var int|null */
    public $active_contacts;

    /** @var int|null */
    public $completed_contacts;

    /** @var float|null */
    public $conversion_rate;

    /** @var int|null */
    public $created_by;

    /** @var string|null */
    public $created_at;

    /** @var string|null */
    public $updated_at;

    /** @var string|null */
    public $last_triggered_at;

    /** @param array<string, mixed> $data */
    public function __construct($data = [])
    {
        foreach ($data as $key => $value) {
            if (property_exists($this, $key)) {
                $this->$key = $value;
            }
        }

        $this->id = isset($this->id) ? (int) $this->id : null;
        $this->created_by = isset($this->created_by) ? (int) $this->created_by : null;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'status' => $this->status,
            'trigger_type' => $this->trigger_type,
            'trigger_config' => $this->getTriggerConfigArray(),
            'entry_conditions' => $this->getEntryConditionsArray(),
            'settings' => $this->getSettingsArray(),
            'stats' => $this->getStatsArray(),
            'total_enrolled' => (int) $this->total_enrolled,
            'active_contacts' => (int) $this->active_contacts,
            'completed_contacts' => (int) $this->completed_contacts,
            'conversion_rate' => $this->calculateConversionRate(),
            'created_by' => $this->created_by,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'last_triggered_at' => $this->last_triggered_at,
        ];
    }

    /** @return array<string, mixed> */
    public function getTriggerConfigArray(): array
    {
        if (is_string($this->trigger_config)) {
            return json_decode($this->trigger_config, true) ?? [];
        }
        return $this->trigger_config ?? [];
    }

    /** @return array<string, mixed> */
    public function getEntryConditionsArray(): array
    {
        if (is_string($this->entry_conditions)) {
            return json_decode($this->entry_conditions, true) ?? [];
        }
        return $this->entry_conditions ?? [];
    }

    /**
     * Re-entry configuration, normalized.
     *
     * `entry_conditions` holds two independent concerns under distinct keys:
     * `reentry` (whether/when a contact may be enrolled again) and `conditions`
     * (the entry filter rules). This reads only the former, defaulting to
     * "run once per contact" when unset.
     *
     * @return array{allow: bool, wait_days: float}
     */
    public function getReentryConfig(): array
    {
        $conditions = $this->getEntryConditionsArray();
        $reentry = isset($conditions['reentry']) && is_array($conditions['reentry'])
            ? $conditions['reentry']
            : [];

        return [
            'allow' => !empty($reentry['allow']),
            'wait_days' => isset($reentry['wait_days']) ? max(0.0, (float) $reentry['wait_days']) : 0.0,
        ];
    }

    /**
     * Entry filter rules (field/operator/value), normalized to a list.
     *
     * These live under the `conditions` key, kept separate from the `reentry`
     * policy so the two concerns never overwrite one another in the column.
     *
     * @return array<int, array<string, mixed>>
     */
    public function getEntryFilterConditions(): array
    {
        $rules = $this->getEntryConditionsArray()['conditions'] ?? null;

        if (!is_array($rules)) {
            return [];
        }

        $list = [];
        foreach ($rules as $rule) {
            if (is_array($rule)) {
                $list[] = $rule;
            }
        }

        return $list;
    }

    /** @return array<string, mixed> */
    public function getSettingsArray(): array
    {
        if (is_string($this->settings)) {
            return json_decode($this->settings, true) ?? [];
        }
        return $this->settings ?? [];
    }

    /** @return array<string, mixed> */
    public function getStatsArray(): array
    {
        if (is_string($this->stats)) {
            return json_decode($this->stats, true) ?? [];
        }
        return $this->stats ?? [];
    }

    /**
     * Completion (conversion) rate derived live from the maintained enrolment
     * counters, so it never reflects a stale stored value.
     */
    public function calculateConversionRate(): float
    {
        $enrolled = (int) $this->total_enrolled;
        $completed = (int) $this->completed_contacts;

        if ($enrolled <= 0) {
            return 0.0;
        }

        return round(($completed / $enrolled) * 100, 2);
    }

    public function isDraft(): bool
    {
        return $this->status === 'draft';
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }

    public function isPaused(): bool
    {
        return $this->status === 'paused';
    }

    public function canEnroll(): bool
    {
        return $this->isActive();
    }

    /**
     * @return array<string, string>
     */
    public function validate(): array
    {
        $errors = [];

        if (empty($this->name)) {
            $errors['name'] = __('Automation name is required', 'kelune-crm');
        }

        if (empty($this->trigger_type)) {
            $errors['trigger_type'] = __('Trigger type is required', 'kelune-crm');
        }

        $valid_statuses = ['draft', 'active', 'paused'];
        if (!in_array($this->status, $valid_statuses)) {
            $errors['status'] = __('Invalid status', 'kelune-crm');
        }

        // The triggers the plugin actually fires (AutomationTriggerService).
        // Filterable so the Pro add-on can register additional trigger types
        // once it implements the firing side for them.
        $valid_triggers = apply_filters('kelune_crm_valid_trigger_types', [
            'contact_created',
            'contact_updated',
            'tag_added',
            'tag_removed',
            'list_added',
            'list_removed',
            'manual',
        ]);
        if (!in_array($this->trigger_type, $valid_triggers, true)) {
            $errors['trigger_type'] = __('Invalid trigger type', 'kelune-crm');
        }

        return $errors;
    }
}
