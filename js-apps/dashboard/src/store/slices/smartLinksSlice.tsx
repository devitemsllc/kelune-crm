import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { startGlobalLoading, stopGlobalLoading } from './globalLoadingSlice';
import type { SmartLink } from '../../types/models';

interface SmartLinksState {
  items: SmartLink[];
  total: number;
  page: number;
  per_page: number;
  selectedLink: SmartLink | null;
  // Click-stats payload is a separate analytics shape — kept loose.
  stats: Record<string, unknown> | null;
  loading: boolean;
  error: string | null | undefined;
  filters: {
    search: string;
    status: string;
    link_type: string;
  };
}

// Async thunks
export const fetchSmartLinks = createAsyncThunk(
  'smartLinks/fetchAll',
  async (params: Record<string, unknown> = {}) => {
    const response = await api.smartLinks.getAll(params);
    return response.data;
  }
);

export const createSmartLink = createAsyncThunk(
  'smartLinks/create',
  async (data: Record<string, unknown>, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.smartLinks.create(data);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const updateSmartLink = createAsyncThunk(
  'smartLinks/update',
  async (
    {
      id,
      data,
    }: {
      id: number | string;
      data: Record<string, unknown>;
    },
    { dispatch }
  ) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.smartLinks.update(id, data);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const deleteSmartLink = createAsyncThunk(
  'smartLinks/delete',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      await api.smartLinks.delete(id);
      return id;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

const initialState: SmartLinksState = {
  items: [],
  total: 0,
  page: 1,
  per_page: 20,
  selectedLink: null,
  stats: null,
  loading: false,
  error: null,
  filters: {
    search: '',
    status: '',
    link_type: '',
  },
};

const smartLinksSlice = createSlice({
  name: 'smartLinks',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Fetch all smart links
      .addCase(fetchSmartLinks.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSmartLinks.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.data || [];
        state.total = action.payload.total || 0;
        state.page = action.payload.page || 1;
        state.per_page = action.payload.per_page || 20;
      })
      .addCase(fetchSmartLinks.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Create smart link
      .addCase(createSmartLink.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createSmartLink.fulfilled, (state, action) => {
        state.loading = false;
        state.items.unshift(action.payload);
        state.total += 1;
      })
      .addCase(createSmartLink.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Update smart link
      .addCase(updateSmartLink.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateSmartLink.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.items.findIndex(
          (item) => item.id === action.payload.id
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (state.selectedLink && state.selectedLink.id === action.payload.id) {
          state.selectedLink = action.payload;
        }
      })
      .addCase(updateSmartLink.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Delete smart link
      .addCase(deleteSmartLink.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteSmartLink.fulfilled, (state, action) => {
        state.loading = false;
        state.items = state.items.filter((item) => item.id !== action.payload);
        state.total -= 1;
      })
      .addCase(deleteSmartLink.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  },
});

export default smartLinksSlice.reducer;
