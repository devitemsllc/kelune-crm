import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { startGlobalLoading, stopGlobalLoading } from './globalLoadingSlice';
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
  async (params: ListParams | void = {}) => {
    const response = await api.get<Paginated<Campaign>>('/campaigns', {
      params,
    });
    return response.data;
  }
);

export const createCampaign = createAsyncThunk(
  'campaigns/create',
  async (data: Record<string, unknown>, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<Campaign>('/campaigns', data);
      return response.data;
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
    { dispatch }
  ) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.put<Campaign>(`/campaigns/${id}`, data);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const deleteCampaign = createAsyncThunk(
  'campaigns/delete',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      await api.delete(`/campaigns/${id}`);
      return id;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const duplicateCampaign = createAsyncThunk(
  'campaigns/duplicate',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<Campaign>(`/campaigns/${id}/duplicate`);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const sendCampaign = createAsyncThunk(
  'campaigns/send',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post(`/campaigns/${id}/send`);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const scheduleCampaign = createAsyncThunk(
  'campaigns/schedule',
  async (
    {
      id,
      scheduled_at,
    }: {
      id: number | string;
      scheduled_at: string;
    },
    { dispatch }
  ) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post(`/campaigns/${id}/schedule`, {
        scheduled_at,
      });
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const pauseCampaign = createAsyncThunk(
  'campaigns/pause',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post(`/campaigns/${id}/pause`);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const resumeCampaign = createAsyncThunk(
  'campaigns/resume',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post(`/campaigns/${id}/resume`);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const fetchSummaryStats = createAsyncThunk(
  'campaigns/fetchSummaryStats',
  async () => {
    const response = await api.get<CampaignSummaryStats>(
      '/campaigns/stats/summary'
    );
    return response.data;
  }
);

export const bulkActionCampaigns = createAsyncThunk(
  'campaigns/bulkAction',
  async (
    { action, ids }: { action: string; ids: Array<number | string> },
    { dispatch }
  ) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<Record<string, unknown>>(
        '/campaigns/bulk',
        { action, ids }
      );
      return { action, ids, ...response.data };
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
        state.error = action.error.message;
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
        state.error = action.error.message;
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
