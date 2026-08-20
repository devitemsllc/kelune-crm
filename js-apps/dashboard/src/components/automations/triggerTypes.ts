import { __ } from '@wordpress/i18n';

export interface TriggerTypeMeta {
  value: string;
  label: string;
  /** Tag colour used wherever the trigger is shown as a chip. */
  color: string;
}

/**
 * The trigger types the backend accepts (Automation::validate) and actually
 * fires (AutomationTriggerService). Single source for the settings modal's
 * select, the list filter, the list column tag and the canvas trigger node —
 * a value missing here cannot be saved.
 */
export const TRIGGER_TYPES: TriggerTypeMeta[] = [
  {
    value: 'contact_created',
    label: __('Contact Created', 'kelune-crm'),
    color: 'blue',
  },
  {
    value: 'contact_updated',
    label: __('Contact Updated', 'kelune-crm'),
    color: 'blue',
  },
  {
    value: 'list_added',
    label: __('Added to List', 'kelune-crm'),
    color: 'cyan',
  },
  {
    value: 'list_removed',
    label: __('Removed from List', 'kelune-crm'),
    color: 'cyan',
  },
  {
    value: 'tag_added',
    label: __('Tag Added', 'kelune-crm'),
    color: 'purple',
  },
  {
    value: 'tag_removed',
    label: __('Tag Removed', 'kelune-crm'),
    color: 'purple',
  },
  {
    value: 'manual',
    label: __('Manual Enrollment', 'kelune-crm'),
    color: 'default',
  },
];

/** Select-ready options (value + label only). */
export const TRIGGER_OPTIONS = TRIGGER_TYPES.map(({ value, label }) => ({
  value,
  label,
}));

export const findTriggerType = (value?: string): TriggerTypeMeta | undefined =>
  value ? TRIGGER_TYPES.find((trigger) => trigger.value === value) : undefined;

/** Which trigger types carry an extra selection in trigger_config. */
export const TAG_TRIGGERS: ReadonlySet<string> = new Set([
  'tag_added',
  'tag_removed',
]);

export const LIST_TRIGGERS: ReadonlySet<string> = new Set([
  'list_added',
  'list_removed',
]);

/** The re-entry controls' shape on the forms that collect enrolment. */
export interface EnrollmentSettings {
  allow_reentry?: boolean;
  reentry_wait_value?: number | string;
  reentry_wait_unit?: string;
}

export const WAIT_UNITS = [
  { value: 'minutes', label: __('Minutes', 'kelune-crm') },
  { value: 'hours', label: __('Hours', 'kelune-crm') },
  { value: 'days', label: __('Days', 'kelune-crm') },
  { value: 'weeks', label: __('Weeks', 'kelune-crm') },
];

// Convert a re-entry wait amount + unit into days (backend stores days).
const toDays = (value: unknown, unit: string | undefined): number | null => {
  const amount = Number(value);
  if (!value || Number.isNaN(amount)) return null;
  switch (unit) {
    case 'minutes':
      return amount / 1440;
    case 'hours':
      return amount / 24;
    case 'weeks':
      return amount * 7;
    case 'days':
    default:
      return amount;
  }
};

/**
 * Assemble the record's entry_conditions from the enrolment controls.
 *
 * The re-entry policy is nested under `reentry` so it never collides with the
 * entry filter rules the backend reads from `conditions`; an existing filter
 * list is carried through untouched.
 */
export const buildEntryConditions = (
  settings: EnrollmentSettings | undefined,
  existing: Record<string, unknown> = {}
): Record<string, unknown> => ({
  reentry: {
    allow: settings?.allow_reentry || false,
    wait_value: settings?.reentry_wait_value || null,
    wait_unit: settings?.reentry_wait_unit || 'days',
    wait_days: toDays(
      settings?.reentry_wait_value,
      settings?.reentry_wait_unit
    ),
  },
  conditions: Array.isArray(existing.conditions) ? existing.conditions : [],
});
