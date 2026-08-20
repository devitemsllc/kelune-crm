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

// Sortable fields for Automations, mirroring the backend's whitelisted orderby
// columns (id, name, status, trigger_type, total_enrolled, last_triggered_at,
// created_at, updated_at). `conversion_rate` is derived live for display only
// (not a trustworthy stored column), so it is not offered as a sort. `id` is
// the implicit default (newest first).
export const SORT_OPTIONS: SortOption[] = [
  { value: 'name', label: __('Name', 'kelune-crm') },
  { value: 'status', label: __('Status', 'kelune-crm') },
  { value: 'trigger_type', label: __('Trigger', 'kelune-crm') },
  { value: 'total_enrolled', label: __('Enrolled', 'kelune-crm') },
  {
    value: 'last_triggered_at',
    label: __('Last triggered', 'kelune-crm'),
  },
  { value: 'created_at', label: __('Created date', 'kelune-crm') },
  { value: 'updated_at', label: __('Updated date', 'kelune-crm') },
];

// Fields ordered chronologically — `id` is insertion order, so it reads like a
// date (oldest/newest first) alongside the real timestamps.
export const CHRONOLOGICAL_FIELDS = [
  'id',
  'last_triggered_at',
  'created_at',
  'updated_at',
];
export const NUMERIC_FIELDS = ['total_enrolled'];

// Default: `id` DESC (newest automations first). `id` is not a user-selectable
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
