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

// Sortable fields, mirroring the backend's whitelisted orderby columns
// (EmailLogRepository::buildOrderByClause). `id` is the implicit default
// (newest first) and is intentionally not offered here.
export const SORT_OPTIONS: SortOption[] = [
  { value: 'created_at', label: __('Created date', 'kelune-crm') },
  { value: 'sent_at', label: __('Sent date', 'kelune-crm') },
  { value: 'subject', label: __('Subject', 'kelune-crm') },
  { value: 'email_to', label: __('Recipient', 'kelune-crm') },
  { value: 'status', label: __('Status', 'kelune-crm') },
  { value: 'email_type', label: __('Type', 'kelune-crm') },
  { value: 'open_count', label: __('Opens', 'kelune-crm') },
  { value: 'click_count', label: __('Clicks', 'kelune-crm') },
];

// Fields ordered chronologically — `id` is insertion order, so it reads like a
// date (oldest/newest first) alongside the real timestamps.
export const CHRONOLOGICAL_FIELDS = ['id', 'created_at', 'sent_at'];
export const NUMERIC_FIELDS = ['open_count', 'click_count'];

// Default: `id` DESC (newest logs first). `id` is not a user-selectable field,
// so it carries a friendly label for the active-sort chip. A created_at default
// would let a just-touched row (tracking bumps updated_at) drift — id is stable.
export const DEFAULT_SORT: SortValue = { field: 'id', order: 'DESC' };

export const isSortActive = (value: SortValue): boolean =>
  isSortActiveBase(value, DEFAULT_SORT);

export const sortFieldLabel = (field: string): string => {
  if (field === 'id') {
    return __('Date added', 'kelune-crm');
  }
  return sortFieldLabelBase(field, SORT_OPTIONS);
};
