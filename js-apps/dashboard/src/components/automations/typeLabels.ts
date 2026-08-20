import { __ } from '@wordpress/i18n';
import { findActionType } from './actionTypeOptions';
import { findTriggerType } from './triggerTypes';

/** Title-case a snake_case / space-separated value: "add_to_list" → "Add To List". */
const formatType = (value?: string): string =>
  (value ?? '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

// The status switch doubles as its own status readout, so every status names
// itself rather than collapsing to on/off. Each label names its own status key,
// so the switch, the filter menu and the chips all read the same word.
const STATUS_LABELS: Record<string, string> = {
  active: __('Active', 'kelune-crm'),
  draft: __('Draft', 'kelune-crm'),
  paused: __('Paused', 'kelune-crm'),
};

const CONDITION_LABELS: Record<string, string> = {
  field_value: __('Field Value', 'kelune-crm'),
  in_list: __('In List', 'kelune-crm'),
  not_in_list: __('Not In List', 'kelune-crm'),
  has_tag: __('Has Tag', 'kelune-crm'),
  not_has_tag: __('Does Not Have Tag', 'kelune-crm'),
  in_segment: __('In Segment', 'kelune-crm'),
  not_in_segment: __('Not In Segment', 'kelune-crm'),
  email_opened: __('Email Opened', 'kelune-crm'),
  email_clicked: __('Email Clicked', 'kelune-crm'),
};

/** Label for an action type — reuses the action picker's titles, else title-cases. */
export const actionTypeLabel = (value?: string): string =>
  findActionType(value)?.title ?? formatType(value);

/** Label for a condition type. */
export const conditionTypeLabel = (value?: string): string =>
  (value ? CONDITION_LABELS[value] : undefined) ?? formatType(value);

/** Label for a trigger type. */
export const triggerTypeLabel = (value?: string): string =>
  findTriggerType(value)?.label ?? formatType(value);

/** Label for an automation status; unknown statuses read as Draft. */
export const automationStatusLabel = (value?: string): string =>
  (value ? STATUS_LABELS[value] : undefined) ?? __('Draft', 'kelune-crm');
