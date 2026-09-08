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

// Sortable fields for Roles. WordPress roles carry no id or timestamps — they
// are keyed by slug — so the list sorts on what a role actually has, and the
// default is the role name rather than the usual `id` DESC.
export const SORT_OPTIONS: SortOption[] = [
  { value: 'name', label: __('Role name', 'kelune-crm') },
  { value: 'slug', label: __('Slug', 'kelune-crm') },
  { value: 'permissions', label: __('Permissions', 'kelune-crm') },
  { value: 'users', label: __('Users', 'kelune-crm') },
];

export const CHRONOLOGICAL_FIELDS: string[] = [];
export const NUMERIC_FIELDS: string[] = ['permissions', 'users'];

// Default: most permissions first, name A-Z inside a tie. Alphabetical alone
// buries the working roles among the stock WordPress ones holding nothing.
export const DEFAULT_SORT: SortValue = { field: 'permissions', order: 'DESC' };

export const isSortActive = (value: SortValue): boolean =>
  isSortActiveBase(value, DEFAULT_SORT);

export const sortFieldLabel = (field: string): string =>
  sortFieldLabelBase(field, SORT_OPTIONS);
