<?php

declare(strict_types=1);

namespace KeluneCRM\Models;

class AutomationStep
{
    /** @var int|null */
    public $id;

    /** @var int|null */
    public $automation_id;

    /** @var int|null */
    public $step_order;

    /** @var string|null */
    public $step_type;

    /** @var int|null */
    public $parent_step_id;

    /** @var string|null */
    public $branch_type;

    /** @var string|null */
    public $action_type;

    /** @var string|array<string, mixed>|null */
    public $action_config;

    /** @var string|null */
    public $condition_type;

    /** @var string|array<string, mixed>|null */
    public $condition_config;

    /** @var string|null */
    public $delay_type;

    /** @var int|string|null */
    public $delay_value;

    /** @var int|null */
    public $position_x;

    /** @var int|null */
    public $position_y;

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
        $this->automation_id = isset($this->automation_id) ? (int) $this->automation_id : null;
        $this->parent_step_id = isset($this->parent_step_id) ? (int) $this->parent_step_id : null;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'automation_id' => $this->automation_id,
            'step_order' => (int) $this->step_order,
            'step_type' => $this->step_type,
            'parent_step_id' => $this->parent_step_id,
            'branch_type' => $this->branch_type,
            'action_type' => $this->action_type,
            'action_config' => $this->getActionConfigArray(),
            'condition_type' => $this->condition_type,
            'condition_config' => $this->getConditionConfigArray(),
            'delay_type' => $this->delay_type,
            'delay_value' => $this->delay_value,
            'position_x' => (int) $this->position_x,
            'position_y' => (int) $this->position_y,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }

    /** @return array<string, mixed> */
    public function getActionConfigArray(): array
    {
        if (is_string($this->action_config)) {
            return json_decode($this->action_config, true) ?? [];
        }
        return $this->action_config ?? [];
    }

    /** @return array<string, mixed> */
    public function getConditionConfigArray(): array
    {
        if (is_string($this->condition_config)) {
            return json_decode($this->condition_config, true) ?? [];
        }
        return $this->condition_config ?? [];
    }

    public function isAction(): bool
    {
        return $this->step_type === 'action';
    }

    public function isCondition(): bool
    {
        return $this->step_type === 'condition';
    }

    public function isDelay(): bool
    {
        return $this->step_type === 'delay';
    }

    public function isTrigger(): bool
    {
        return $this->step_type === 'trigger';
    }

    /**
     * @return array<string, string>
     */
    public function validate(): array
    {
        $errors = [];

        if (empty($this->automation_id)) {
            $errors['automation_id'] = __('Automation ID is required', 'kelune-crm');
        }

        if (empty($this->step_type)) {
            $errors['step_type'] = __('Step type is required', 'kelune-crm');
        }

        $valid_step_types = ['trigger', 'action', 'condition', 'delay'];
        if (!in_array($this->step_type, $valid_step_types)) {
            $errors['step_type'] = __('Invalid step type', 'kelune-crm');
        }

        if ($this->isAction() && empty($this->action_type)) {
            $errors['action_type'] = __('Action type is required for action steps', 'kelune-crm');
        }

        if ($this->isCondition() && empty($this->condition_type)) {
            $errors['condition_type'] = __('Condition type is required for condition steps', 'kelune-crm');
        }

        if ($this->isDelay()) {
            if (empty($this->delay_type)) {
                $errors['delay_type'] = __('Delay type is required for delay steps', 'kelune-crm');
            }
            if (empty($this->delay_value)) {
                $errors['delay_value'] = __('Delay value is required for delay steps', 'kelune-crm');
            }
        }

        if (!empty($this->branch_type)) {
            $valid_branch_types = ['yes', 'no', 'true', 'false'];
            if (!in_array($this->branch_type, $valid_branch_types)) {
                $errors['branch_type'] = __('Invalid branch type', 'kelune-crm');
            }
        }

        return $errors;
    }
}
