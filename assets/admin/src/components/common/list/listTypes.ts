import type React from 'react';
import type { ID } from '@/types/models';

// Shared types and helpers for the standard listing-page primitives.

export type SortOrder = 'ASC' | 'DESC';

export interface SortValue {
  field: string;
  order: SortOrder;
}

/** Sort option shown in the ListSort dropdown. */
export interface SortOption {
  value: string;
  label: string;
}

/** One column-visibility toggle for ColumnsButton / ColumnSettings. */
export interface ColumnOption {
  key: string;
  label: React.ReactNode;
}

/** A single removable chip in the active-filters row. */
interface FilterChip {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClose: () => void;
}

/** A labelled group of chips (e.g. all selected Tags) with its own clear. */
export interface FilterGroup {
  label: string;
  chips: FilterChip[];
  onClear: () => void;
}

/** A from/to date range (YYYY-MM-DD strings; '' = unset), used by daterange groups. */
export interface DateRangeFilterValue {
  from: string;
  to: string;
}

/**
 * One selectable group in the ListFilterMenu drill-down. `single` holds a
 * string value ('' = none); `multi` holds an ID[] of selected values;
 * `daterange` holds a DateRangeFilterValue and renders an in-panel RangePicker.
 */
export interface FilterMenuGroup {
  key: string;
  label: string;
  mode: 'single' | 'multi' | 'daterange';
  /** Selectable options for single/multi modes (omit for daterange). */
  options?: { value: ID | string; label: string }[];
  /** Show an in-panel search box (used for long lists like tags). */
  searchable?: boolean;
}

/** Value bag for ListFilterMenu, keyed by group key. */
export type FilterMenuValue = Record<
  string,
  string | ID[] | DateRangeFilterValue
>;

/** True when the sort differs from the page default in field or direction. */
export const isSortActive = (value: SortValue, def: SortValue): boolean =>
  value.field !== def.field || value.order !== def.order;

/** Human label for a sort field, falling back to the raw field name. */
export const sortFieldLabel = (field: string, options: SortOption[]): string =>
  options.find((o) => o.value === field)?.label ?? field;
