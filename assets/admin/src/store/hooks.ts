import {
  useDispatch as useReduxDispatch,
  useSelector as useReduxSelector,
} from 'react-redux';
import type { AppDispatch, RootState } from './index';

/**
 * Pre-typed Redux hooks. Re-exported under the SAME names as the react-redux
 * originals so components only need to swap the import source from
 * `'react-redux'` to `'@store/hooks'` — no call-site changes.
 *
 *   - `useDispatch()` is thunk-aware (returns AppDispatch)
 *   - `useSelector((s) => ...)` infers `s` as RootState
 */
export const useDispatch = useReduxDispatch.withTypes<AppDispatch>();
export const useSelector = useReduxSelector.withTypes<RootState>();
