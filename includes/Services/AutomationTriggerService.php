<?php

declare(strict_types=1);

namespace KeluneCRM\Services;

use KeluneCRM\Repositories\AutomationRepository;
use KeluneCRM\Repositories\ContactRepository;
use KeluneCRM\Support\ContactFields;

/**
 * Registers WordPress hooks for the basic (Free) automation triggers:
 * contact created/updated, tag added/removed, list added/removed.
 *
 * The advanced triggers (email_opened / email_clicked) live in the Pro add-on's
 * AdvancedAutomationTriggerService, which extends this class. $contactRepo and
 * processAutomations() are protected so the Pro subclass can reuse them.
 */
class AutomationTriggerService
{
    private AutomationRepository $automationRepo;
    protected ContactRepository $contactRepo;

    public function __construct()
    {
        $this->automationRepo = new AutomationRepository();
        $this->contactRepo = new ContactRepository();
    }

    /**
     * Register all automation triggers
     */
    public function register(): void
    {
        add_action('kelune_crm_contact_created', [$this, 'onContactCreated'], 10, 2);
        add_action('kelune_crm_contact_updated', [$this, 'onContactUpdated'], 10, 2);

        add_action('kelune_crm_tags_added', [$this, 'onTagsAdded'], 10, 2);
        add_action('kelune_crm_tags_removed', [$this, 'onTagsRemoved'], 10, 2);

        add_action('kelune_crm_lists_added', [$this, 'onListsAdded'], 10, 2);
        add_action('kelune_crm_lists_removed', [$this, 'onListsRemoved'], 10, 2);

        // Advanced triggers (email opened/clicked) are registered by the Pro
        // add-on's AdvancedAutomationTriggerService.
    }

    /**
     * Contact created trigger
     *
     * @param int $contact_id
     * @param array<string, mixed> $contact_data
     */
    public function onContactCreated($contact_id, $contact_data = []): void
    {
        $this->processAutomations('contact_created', $contact_id, [
            'contact_data' => $contact_data,
        ]);
    }

    /**
     * Contact updated trigger
     *
     * @param int $contact_id
     * @param array<string, mixed> $contact_data
     */
    public function onContactUpdated($contact_id, $contact_data = []): void
    {
        $this->processAutomations('contact_updated', $contact_id, [
            'contact_data' => $contact_data,
        ]);
    }

    /**
     * Tags added trigger
     *
     * @param int $contact_id
     * @param array<int, int|string> $tag_ids
     */
    public function onTagsAdded($contact_id, $tag_ids): void
    {
        foreach ($tag_ids as $tag_id) {
            $this->processAutomations('tag_added', $contact_id, [
                'tag_id' => $tag_id,
                'tag_ids' => $tag_ids,
            ]);
        }
    }

    /**
     * Tags removed trigger
     *
     * @param int $contact_id
     * @param array<int, int|string> $tag_ids
     */
    public function onTagsRemoved($contact_id, $tag_ids): void
    {
        foreach ($tag_ids as $tag_id) {
            $this->processAutomations('tag_removed', $contact_id, [
                'tag_id' => $tag_id,
                'tag_ids' => $tag_ids,
            ]);
        }
    }

    /**
     * Lists added trigger
     *
     * @param int $contact_id
     * @param array<int, int|string> $list_ids
     */
    public function onListsAdded($contact_id, $list_ids): void
    {
        foreach ($list_ids as $list_id) {
            $this->processAutomations('list_added', $contact_id, [
                'list_id' => $list_id,
                'list_ids' => $list_ids,
            ]);
        }
    }

    /**
     * Lists removed trigger
     *
     * @param int $contact_id
     * @param array<int, int|string> $list_ids
     */
    public function onListsRemoved($contact_id, $list_ids): void
    {
        foreach ($list_ids as $list_id) {
            $this->processAutomations('list_removed', $contact_id, [
                'list_id' => $list_id,
                'list_ids' => $list_ids,
            ]);
        }
    }

    /**
     * Process automations for a trigger type
     *
     * @param int $contact_id
     * @param array<string, mixed> $context
     */
    protected function processAutomations(string $trigger_type, $contact_id, array $context = []): void
    {
        $automations = $this->automationRepo->getByTriggerType($trigger_type);

        if (empty($automations)) {
            return;
        }

        foreach ($automations as $automation) {
            // Honour the trigger's own config first (e.g. "Tag Added: VIP" must
            // only fire for the VIP tag, not every tag). An unconfigured trigger
            // matches any event of its type.
            if (!$this->triggerConfigMatches($automation, $trigger_type, $context)) {
                continue;
            }

            if (!$this->checkEntryConditions($automation, $contact_id)) {
                continue;
            }

            $enrolled = $this->automationRepo->enrollContact(
                (int) $automation->id,
                $contact_id,
                $context
            );

            if ($enrolled) {
                do_action('kelune_crm_automation_contact_enrolled', $automation->id, $contact_id, $context);
            }
        }
    }

    /**
     * Whether the automation's trigger_config matches the fired event.
     *
     * Triggers can be scoped to a specific entity via trigger_config (tag_id,
     * list_id, segment_id, campaign_id); when set, enrolment fires only for the
     * matching id in the event context. An unconfigured (empty/0) trigger
     * matches any event of its type.
     *
     * @param \KeluneCRM\Models\Automation $automation
     * @param array<string, mixed> $context
     */
    private function triggerConfigMatches($automation, string $trigger_type, array $context): bool
    {
        $config = $automation->getTriggerConfigArray();

        $checks = [
            'tag_added' => ['tag_id', 'tag_id'],
            'tag_removed' => ['tag_id', 'tag_id'],
            'list_added' => ['list_id', 'list_id'],
            'list_removed' => ['list_id', 'list_id'],
        ];

        if (!isset($checks[$trigger_type])) {
            return true; // Trigger type carries no id to match on.
        }

        [$config_key, $context_key] = $checks[$trigger_type];
        $wanted = $config[$config_key] ?? null;

        // Not scoped to a specific id -> match every event of this type.
        if ($wanted === null || $wanted === '' || (int) $wanted === 0) {
            return true;
        }

        return (int) $wanted === (int) ($context[$context_key] ?? 0);
    }

    /**
     * Check entry conditions for automation
     *
     * @param \KeluneCRM\Models\Automation $automation
     * @param int $contact_id
     */
    private function checkEntryConditions($automation, $contact_id): bool
    {
        // Only the entry filter rules gate enrolment here; the re-entry policy
        // lives under its own key and is enforced later, in enrollContact().
        $filter_conditions = $automation->getEntryFilterConditions();

        if (empty($filter_conditions)) {
            return true;
        }

        $contact = $this->contactRepo->find($contact_id);

        if (!$contact) {
            return false;
        }

        // All conditions must pass.
        foreach ($filter_conditions as $condition) {
            $field = $condition['field'] ?? '';
            $operator = $condition['operator'] ?? 'equals';
            $value = $condition['value'] ?? '';

            $field_value = $this->getFieldValue($contact, $field);

            if (!$this->evaluateCondition($field_value, $operator, $value)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get field value from contact
     *
     * @param \KeluneCRM\Models\Contact $contact
     * @param string $field
     * @return mixed
     */
    private function getFieldValue($contact, $field)
    {
        if (ContactFields::isStandard($field)) {
            return $contact->get(ContactFields::resolve($field), '');
        }

        // Custom fields
        $custom_fields = json_decode($contact->get('custom_fields', '{}'), true) ?: [];
        $value = $custom_fields[$field] ?? '';

        // Checkbox fields are stored as a list; the operators below compare
        // strings, so hand them the joined form rather than an array.
        return is_array($value) ? implode(', ', $value) : $value;
    }

    /**
     * Evaluate a condition
     *
     * @param mixed $field_value
     * @param string $operator
     * @param mixed $compare_value
     */
    private function evaluateCondition($field_value, $operator, $compare_value): bool
    {
        switch ($operator) {
            case 'equals':
                return strcasecmp((string) $field_value, (string) $compare_value) === 0;

            case 'not_equals':
                return strcasecmp((string) $field_value, (string) $compare_value) !== 0;

            case 'contains':
                return stripos((string) $field_value, (string) $compare_value) !== false;

            case 'not_contains':
                return stripos((string) $field_value, (string) $compare_value) === false;

            case 'greater_than':
                return (float) $field_value > (float) $compare_value;

            case 'less_than':
                return (float) $field_value < (float) $compare_value;

            case 'is_empty':
                return empty($field_value);

            case 'is_not_empty':
                return !empty($field_value);

            default:
                return false;
        }
    }

}
