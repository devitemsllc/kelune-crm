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

// Sortable fields for Users, mirroring the backend's whitelisted WP_User_Query
// columns (ID, display_name, user_login, user_email, user_registered). `ID` is
// the implicit default (newest first) and is intentionally not offered here.
export const SORT_OPTIONS: SortOption[] = [
  { value: 'display_name', label: __('Name', 'kelune-crm') },
  { value: 'user_login', label: __('Username', 'kelune-crm') },
  { value: 'user_email', label: __('Email', 'kelune-crm') },
  { value: 'user_registered', label: __('Registered date', 'kelune-crm') },
];

// `ID` is insertion order, so it reads like a date alongside the real timestamp.
export const CHRONOLOGICAL_FIELDS = ['ID', 'user_registered'];
export const NUMERIC_FIELDS: string[] = [];

// Default: `ID` DESC (newest users first). `ID` is not a user-selectable field,
// so it carries a friendly label for the active-sort chip.
export const DEFAULT_SORT: SortValue = { field: 'ID', order: 'DESC' };

export const isSortActive = (value: SortValue): boolean =>
  isSortActiveBase(value, DEFAULT_SORT);

export const sortFieldLabel = (field: string): string => {
  if (field === 'ID') {
    return __('Date added', 'kelune-crm');
  }
  return sortFieldLabelBase(field, SORT_OPTIONS);
};
