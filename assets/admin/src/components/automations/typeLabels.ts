import { __ } from '@wordpress/i18n';
import { findActionType } from './actionTypeOptions';

/** Title-case a snake_case / space-separated value: "add_to_list" → "Add To List". */
const formatType = (value?: string): string =>
  (value ?? '')
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const CONDITION_LABELS: Record<string, string> = {
  field_value: __('Field Value', 'kelune-crm'),
  has_tag: __('Has Tag', 'kelune-crm'),
  not_has_tag: __('Does Not Have Tag', 'kelune-crm'),
  in_list: __('In List', 'kelune-crm'),
  not_in_list: __('Not In List', 'kelune-crm'),
  in_segment: __('In Segment', 'kelune-crm'),
  not_in_segment: __('Not In Segment', 'kelune-crm'),
  email_opened: __('Email Opened', 'kelune-crm'),
  email_clicked: __('Email Clicked', 'kelune-crm'),
};

const TRIGGER_LABELS: Record<string, string> = {
  contact_created: __('Contact Created', 'kelune-crm'),
  contact_updated: __('Contact Updated', 'kelune-crm'),
  tag_added: __('Tag Added', 'kelune-crm'),
  tag_removed: __('Tag Removed', 'kelune-crm'),
  list_added: __('Added to List', 'kelune-crm'),
  list_removed: __('Removed from List', 'kelune-crm'),
  manual: __('Manual Enrollment', 'kelune-crm'),
};

/** Label for an action type — reuses the action picker's titles, else title-cases. */
export const actionTypeLabel = (value?: string): string =>
  findActionType(value)?.title ?? formatType(value);

/** Label for a condition type. */
export const conditionTypeLabel = (value?: string): string =>
  (value ? CONDITION_LABELS[value] : undefined) ?? formatType(value);

/** Label for a trigger type. */
export const triggerTypeLabel = (value?: string): string =>
  (value ? TRIGGER_LABELS[value] : undefined) ?? formatType(value);
