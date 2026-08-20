import { __ } from '@wordpress/i18n';
import {
  isSortActive as isSortActiveBase,
  sortFieldLabel as sortFieldLabelBase,
} from '../common/list/listTypes';
import type {
  SortOption,
  SortOrder,
  SortValue,
} from '../common/list/listTypes';

export type { SortOrder, SortValue };

// Sortable fields for Campaigns, mirroring the backend's whitelisted orderby
// columns (id, name, status, scheduled_at, sent_at, created_at, updated_at).
// Engagement rates live in the JSON `stats` column and are not sortable, so
// they are intentionally not offered here. `id` is the implicit default
// (newest first).
export const SORT_OPTIONS: SortOption[] = [
  { value: 'name', label: __('Campaign name', 'kelune-crm') },
  { value: 'status', label: __('Status', 'kelune-crm') },
  { value: 'scheduled_at', label: __('Scheduled date', 'kelune-crm') },
  { value: 'sent_at', label: __('Sent date', 'kelune-crm') },
  { value: 'created_at', label: __('Created date', 'kelune-crm') },
  { value: 'updated_at', label: __('Updated date', 'kelune-crm') },
];

// Fields ordered chronologically — `id` is insertion order, so it reads like a
// date (oldest/newest first) alongside the real timestamps.
export const CHRONOLOGICAL_FIELDS = [
  'id',
  'created_at',
  'updated_at',
  'scheduled_at',
  'sent_at',
];
export const NUMERIC_FIELDS: string[] = [];

// Default: `id` DESC (newest campaigns first). `id` is not a user-selectable
// field, so it carries a friendly label for the active-sort chip.
export const DEFAULT_SORT: SortValue = { field: 'id', order: 'DESC' };

export const isSortActive = (value: SortValue): boolean =>
  isSortActiveBase(value, DEFAULT_SORT);

export const sortFieldLabel = (field: string): string => {
  if (field === 'id') {
    return __('Date added', 'kelune-crm');
  }
  return sortFieldLabelBase(field, SORT_OPTIONS);
};
