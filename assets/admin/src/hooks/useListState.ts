import { useCallback, useState } from 'react';

/**
 * Persisted view-state for list pages (search, filters, pagination, columns).
 *
 * All list pages share ONE localStorage object keyed by page. Each page owns a
 * sub-key (e.g. `contacts`, `campaigns`) whose value is that page's own shape.
 * This keeps a user's search/filters/page/limit/columns across reloads and
 * direct visits, and gives every list page the same mechanism.
 */
const STORAGE_KEY = 'kelune_crm_list_state';

type Store = Record<string, unknown>;

const readStore = (): Store => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {};
  } catch {
    return {};
  }
};

const writeStore = (store: Store): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota / private-mode failures — persistence is best-effort.
  }
};

/** Read one page's saved state, merged over `defaults` for forward-compat. */
const readListState = <T extends object>(pageKey: string, defaults: T): T => {
  const saved = readStore()[pageKey];
  return saved && typeof saved === 'object'
    ? { ...defaults, ...(saved as Partial<T>) }
    : defaults;
};

/** Write one page's state into the shared store, leaving other pages intact. */
const writeListState = <T extends object>(pageKey: string, value: T): void => {
  const store = readStore();
  store[pageKey] = value;
  writeStore(store);
};

type Updater<T> = Partial<T> | ((prev: T) => T);

/**
 * `useState`-like hook whose value is persisted to the shared list-state store.
 * `update` accepts a partial patch or an updater fn; every change is written
 * back to localStorage synchronously.
 */
export const useListState = <T extends object>(
  pageKey: string,
  defaults: T
): [T, (patch: Updater<T>) => void] => {
  const [state, setState] = useState<T>(() => readListState(pageKey, defaults));

  const update = useCallback(
    (patch: Updater<T>) => {
      setState((prev) => {
        const next =
          typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
        writeListState(pageKey, next);
        return next;
      });
    },
    [pageKey]
  );

  return [state, update];
};
