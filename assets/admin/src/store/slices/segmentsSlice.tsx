import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { startGlobalLoading, stopGlobalLoading } from './globalLoadingSlice';
import type { Segment } from '../../types/models';

interface SegmentsState {
  items: Segment[];
  selectedSegment: Segment | null;
  loading: boolean;
  error: string | null | undefined;
  previewCount: number;
  previewLoading: boolean;
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

// Async thunks
export const fetchSegments = createAsyncThunk(
  'segments/fetchSegments',
  async (params: Record<string, unknown> = {}, { rejectWithValue }) => {
    try {
      const response = await api.segments.getAll(params);
      const total = response.headers['x-wp-total'];
      const totalPages = response.headers['x-wp-totalpages'];
      return {
        items: response.data,
        total: total ? parseInt(total) : 0,
        totalPages: totalPages ? parseInt(totalPages) : 0,
      };
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

export const createSegment = createAsyncThunk(
  'segments/createSegment',
  async (
    segmentData: Record<string, unknown>,
    { dispatch, rejectWithValue }
  ) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.segments.create(segmentData);
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const updateSegment = createAsyncThunk(
  'segments/updateSegment',
  async (
    { id, ...data }: { id: number | string; [key: string]: unknown },
    { dispatch, rejectWithValue }
  ) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.segments.update(id, data);
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const deleteSegment = createAsyncThunk(
  'segments/deleteSegment',
  async (id: number | string, { dispatch, rejectWithValue }) => {
    dispatch(startGlobalLoading());
    try {
      await api.segments.delete(id);
      return id;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const refreshSegment = createAsyncThunk(
  'segments/refreshSegment',
  async (id: number | string, { dispatch, rejectWithValue }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.segments.refresh(id);
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const previewSegmentCount = createAsyncThunk(
  'segments/previewCount',
  async (
    { conditions, match_type }: { conditions: unknown; match_type: string },
    { rejectWithValue }
  ) => {
    try {
      const response = await api.segments.preview(conditions, match_type);
      // Handle both response formats: direct data or wrapped in success object
      const count = response.data?.data?.count ?? response.data?.count ?? 0;
      return count;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

const initialState: SegmentsState = {
  items: [],
  selectedSegment: null,
  loading: false,
  error: null,
  previewCount: 0,
  previewLoading: false,
  pagination: {
    page: 1,
    perPage: 20,
    total: 0,
    totalPages: 0,
  },
};

const segmentsSlice = createSlice({
  name: 'segments',
  initialState,
  reducers: {
    clearPreviewCount: (state) => {
      state.previewCount = 0;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch segments
      .addCase(fetchSegments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSegments.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.items;
        state.pagination.total = action.payload.total;
        state.pagination.totalPages = action.payload.totalPages;
      })
      .addCase(fetchSegments.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message;
      })
      // Create segment
      .addCase(createSegment.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createSegment.fulfilled, (state, action) => {
        state.loading = false;
        state.items.unshift(action.payload);
        state.pagination.total += 1;
      })
      .addCase(createSegment.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message;
      })
      // Update segment
      .addCase(updateSegment.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (item) => item.id === action.payload.id
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (state.selectedSegment?.id === action.payload.id) {
          state.selectedSegment = action.payload;
        }
      })
      // Delete segment
      .addCase(deleteSegment.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
        if (state.selectedSegment?.id === action.payload) {
          state.selectedSegment = null;
        }
        state.pagination.total -= 1;
      })
      // Refresh segment
      .addCase(refreshSegment.pending, (state) => {
        state.loading = true;
      })
      .addCase(refreshSegment.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.items.findIndex(
          (item) => item.id === action.payload.id
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
      })
      .addCase(refreshSegment.rejected, (state, action) => {
        state.loading = false;
        state.error = (action.payload as string) || action.error.message;
      })
      // Preview count
      .addCase(previewSegmentCount.pending, (state) => {
        state.previewLoading = true;
      })
      .addCase(previewSegmentCount.fulfilled, (state, action) => {
        state.previewLoading = false;
        state.previewCount = action.payload;
      })
      .addCase(previewSegmentCount.rejected, (state, action) => {
        state.previewLoading = false;
        state.error = (action.payload as string) || action.error.message;
      });
  },
});

export const { clearPreviewCount } = segmentsSlice.actions;
export default segmentsSlice.reducer;
