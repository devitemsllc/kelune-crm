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

// Sortable fields, mirroring the backend's whitelisted orderby columns. `id` is
// the implicit default (newest first) and is intentionally not offered here.
// `usage_count`/`last_used_at` are whitelisted in the repo but never populated
// (no caller increments them), so they are deliberately omitted as sort options.
// So is `template_type`: every stored template is `custom`, since the built-ins
// are code-defined and served separately.
export const SORT_OPTIONS: SortOption[] = [
  { value: 'created_at', label: __('Created date', 'kelune-crm') },
  { value: 'updated_at', label: __('Updated date', 'kelune-crm') },
  { value: 'name', label: __('Name', 'kelune-crm') },
];

// Fields ordered chronologically — `id` is insertion order, so it reads like a
// date (oldest/newest first) alongside the real timestamps.
export const CHRONOLOGICAL_FIELDS = ['id', 'created_at', 'updated_at'];
export const NUMERIC_FIELDS: string[] = [];

// Default: `id` DESC (newest templates first). `id` is not a user-selectable
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
