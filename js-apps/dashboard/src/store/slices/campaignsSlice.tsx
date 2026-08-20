import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { startGlobalLoading, stopGlobalLoading } from './globalLoadingSlice';
import { getErrorMessage } from '@/utils/getErrorMessage';
import type {
  Campaign,
  CampaignStats,
  CampaignSummaryStats,
  Paginated,
} from '../../types/models';

interface CampaignsState {
  items: Campaign[];
  total: number;
  page: number;
  per_page: number;
  selectedCampaign: Campaign | null;
  stats: CampaignStats | null;
  recipientCount: number;
  summaryStats: CampaignSummaryStats | null;
  loading: boolean;
  error: string | null | undefined;
  filters: {
    search: string;
    status: string;
    campaign_type: string;
  };
}

type ListParams = Record<string, unknown>;

// Async thunks
export const fetchCampaigns = createAsyncThunk(
  'campaigns/fetchAll',
  async (params: ListParams | void = {}, { rejectWithValue }) => {
    try {
      const response = await api.get<Paginated<Campaign>>('/campaigns', {
        params,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

export const fetchCampaign = createAsyncThunk(
  'campaigns/fetchOne',
  async (id: number | string, { rejectWithValue }) => {
    try {
      const response = await api.campaigns.getOne(id);
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

export const createCampaign = createAsyncThunk(
  'campaigns/create',
  async (data: Record<string, unknown>, { dispatch, rejectWithValue }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<Campaign>('/campaigns', data);
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const updateCampaign = createAsyncThunk(
  'campaigns/update',
  async (
    {
      id,
      data,
    }: {
      id: number | string;
      data: Record<string, unknown>;
    },
    { dispatch, rejectWithValue }
  ) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.put<Campaign>(`/campaigns/${id}`, data);
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const deleteCampaign = createAsyncThunk(
  'campaigns/delete',
  async (id: number | string, { dispatch, rejectWithValue }) => {
    dispatch(startGlobalLoading());
    try {
      await api.delete(`/campaigns/${id}`);
      return id;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const duplicateCampaign = createAsyncThunk(
  'campaigns/duplicate',
  async (id: number | string, { dispatch, rejectWithValue }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<Campaign>(`/campaigns/${id}/duplicate`);
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

// Activating IS the send: dispatch starts now, or at the campaign's own
// scheduled_at. Pausing holds it and keeps the queue for a later activation.
export const activateCampaign = createAsyncThunk(
  'campaigns/activate',
  async (id: number | string, { dispatch, rejectWithValue }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post(`/campaigns/${id}/activate`);
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const pauseCampaign = createAsyncThunk(
  'campaigns/pause',
  async (id: number | string, { dispatch, rejectWithValue }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post(`/campaigns/${id}/pause`);
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const fetchSummaryStats = createAsyncThunk(
  'campaigns/fetchSummaryStats',
  async (_: void, { rejectWithValue }) => {
    try {
      const response = await api.get<CampaignSummaryStats>(
        '/campaigns/stats/summary'
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

export const bulkActionCampaigns = createAsyncThunk(
  'campaigns/bulkAction',
  async (
    { action, ids }: { action: string; ids: Array<number | string> },
    { dispatch, rejectWithValue }
  ) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<Record<string, unknown>>(
        '/campaigns/bulk',
        { action, ids }
      );
      return { action, ids, ...response.data };
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

const initialState: CampaignsState = {
  items: [],
  total: 0,
  page: 1,
  per_page: 20,
  selectedCampaign: null,
  stats: null,
  recipientCount: 0,
  summaryStats: null,
  loading: false,
  error: null,
  filters: {
    search: '',
    status: '',
    campaign_type: '',
  },
};

const campaignsSlice = createSlice({
  name: 'campaigns',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Fetch campaigns
      .addCase(fetchCampaigns.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCampaigns.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.data;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.per_page = action.payload.per_page;
      })
      .addCase(fetchCampaigns.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Fetch one campaign
      .addCase(fetchCampaign.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCampaign.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedCampaign = action.payload;
      })
      .addCase(fetchCampaign.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Create campaign
      .addCase(createCampaign.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createCampaign.fulfilled, (state, action) => {
        state.loading = false;
        state.items.unshift(action.payload);
        state.total += 1;
      })
      .addCase(createCampaign.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Update campaign
      .addCase(updateCampaign.fulfilled, (state, action) => {
        const index = state.items.findIndex((c) => c.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (state.selectedCampaign?.id === action.payload.id) {
          state.selectedCampaign = action.payload;
        }
      })

      // Delete campaign
      .addCase(deleteCampaign.fulfilled, (state, action) => {
        state.items = state.items.filter((c) => c.id !== action.payload);
        state.total -= 1;
        if (state.selectedCampaign?.id === action.payload) {
          state.selectedCampaign = null;
        }
      })

      // Duplicate campaign
      .addCase(duplicateCampaign.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
        state.total += 1;
      })

      // Fetch summary stats
      .addCase(fetchSummaryStats.fulfilled, (state, action) => {
        state.summaryStats = action.payload;
      })

      // Bulk actions
      .addCase(bulkActionCampaigns.fulfilled, (state, action) => {
        const { action: bulkAction, ids } = action.payload;
        if (bulkAction === 'delete') {
          state.items = state.items.filter((c) => !ids.includes(c.id));
          state.total -= ids.length;
        }
      });
  },
});

export default campaignsSlice.reducer;
