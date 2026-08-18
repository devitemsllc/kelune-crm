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

// Sortable fields for Incoming Webhooks, mirroring the backend's whitelisted
// orderby columns (id, webhook_name, status, total_requests, last_used_at,
// created_at, updated_at). `id` is the implicit default (newest first) and is
// intentionally not offered here.
export const SORT_OPTIONS: SortOption[] = [
  { value: 'webhook_name', label: __('Name', 'kelune-crm') },
  { value: 'status', label: __('Status', 'kelune-crm') },
  { value: 'total_requests', label: __('Requests', 'kelune-crm') },
  { value: 'last_used_at', label: __('Last used', 'kelune-crm') },
  { value: 'created_at', label: __('Created date', 'kelune-crm') },
];

// Fields ordered chronologically — `id` is insertion order, so it reads like a
// date (oldest/newest first) alongside the real timestamps.
export const CHRONOLOGICAL_FIELDS = ['id', 'created_at', 'last_used_at'];
export const NUMERIC_FIELDS: string[] = ['total_requests'];

// Default: `id` DESC (newest webhooks first). `id` is not a user-selectable
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
