import { createSlice } from '@reduxjs/toolkit';
import type { RootState } from '../index';

interface GlobalLoadingState {
  // Reference count of in-flight blocking operations. A counter (not a boolean)
  // so overlapping mutations don't hide the overlay early: each start increments,
  // each stop decrements, and the overlay shows while count > 0.
  count: number;
}

const initialState: GlobalLoadingState = {
  count: 0,
};

/**
 * App-wide blocking loader state. Drives a single `<Spin fullscreen>` overlay
 * (see GlobalLoader). Every data mutation brackets itself with
 * `startGlobalLoading()` / `stopGlobalLoading()` (in a try/finally) — done inside
 * the mutation thunks and in component-level direct-API write handlers.
 * For list/table fetches use the AntD `loading` prop; for route/page loads use
 * PageLoader.
 */
const globalLoadingSlice = createSlice({
  name: 'globalLoading',
  initialState,
  reducers: {
    startGlobalLoading: (state) => {
      state.count += 1;
    },
    stopGlobalLoading: (state) => {
      // Floor at 0 so an extra/duplicate stop can never drive the count negative
      // (which would wedge the overlay on for a subsequent real operation).
      state.count = Math.max(0, state.count - 1);
    },
  },
});

export const { startGlobalLoading, stopGlobalLoading } =
  globalLoadingSlice.actions;

export const selectIsGlobalLoading = (state: RootState): boolean =>
  state.globalLoading.count > 0;

export default globalLoadingSlice.reducer;
