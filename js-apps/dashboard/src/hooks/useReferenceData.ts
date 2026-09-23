import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from '@store/hooks';
import {
  fetchReference,
  invalidateReference,
} from '@store/slices/referenceSlice';
import type {
  ReferenceData,
  ReferenceKind,
} from '@store/slices/referenceSlice';

const EMPTY: never[] = [];
const EMPTY_SETTINGS: Record<string, unknown> = {};

const emptyFor = <K extends ReferenceKind>(kind: K): ReferenceData[K] =>
  (kind === 'settings' ? EMPTY_SETTINGS : EMPTY) as ReferenceData[K];

/**
 * Read one kind of shared reference data (tags, lists, segments, custom
 * fields, email providers, active automations, settings).
 *
 * Loads on first use, serves the cached copy afterwards, and refetches
 * whenever a mutation dispatches `invalidateReference(kind)` — every mounted
 * consumer picks the change up without a reload. Pass `enabled: false` to
 * defer the load (e.g. until a drawer opens).
 */
export const useReferenceData = <K extends ReferenceKind>(
  kind: K,
  enabled = true
) => {
  const dispatch = useDispatch();
  const entry = useSelector((state) => state.reference[kind]);
  const stale = entry.loadedVersion !== entry.version;
  // Which kind this mount has already asked for, so a rejected load is retried
  // once when a picker or drawer next opens rather than every render.
  const attempted = useRef<ReferenceKind | null>(null);

  // Only once settled: a pending load reports no error, so clearing there loops.
  useEffect(() => {
    if (entry.error === null && !entry.loading) {
      attempted.current = null;
    }
  }, [entry.error, entry.loading]);

  useEffect(() => {
    if (!enabled || entry.loading) {
      return;
    }

    if (stale) {
      attempted.current = kind;
      dispatch(fetchReference(kind));

      return;
    }

    // A rejected load is not stale, so nothing above refetches it.
    if (entry.error !== null && attempted.current !== kind) {
      attempted.current = kind;
      dispatch(fetchReference(kind));
    }
  }, [dispatch, kind, enabled, stale, entry.loading, entry.error]);

  const reload = useCallback(
    () => dispatch(invalidateReference(kind)),
    [dispatch, kind]
  );

  return {
    data: (entry.data ?? emptyFor(kind)) as ReferenceData[K],
    /** True until the first load settles; background refreshes keep the old data. */
    loading: entry.data === null && (entry.loading || (enabled && stale)),
    /** True while any load is in flight. */
    fetching: entry.loading,
    /** True once the current version has loaded (or failed) — safe to seed from. */
    ready: !stale && !entry.loading,
    error: entry.error,
    reload,
  };
};

export default useReferenceData;
