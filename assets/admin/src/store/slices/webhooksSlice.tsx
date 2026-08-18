import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { startGlobalLoading, stopGlobalLoading } from './globalLoadingSlice';
import type { Paginated, Webhook, WebhookLog } from '../../types/models';

interface WebhooksState {
  webhooks: Webhook[];
  currentWebhook: Webhook | null;
  logs: WebhookLog[];
  loading: boolean;
  error: string | null | undefined;
  pagination: {
    total: number;
    page: number;
    per_page: number;
  };
  logsPagination: {
    total: number;
    page: number;
    per_page: number;
  };
}

// Async thunks
export const fetchWebhooks = createAsyncThunk(
  'webhooks/fetchWebhooks',
  async (params: Record<string, unknown> | void = {}, { rejectWithValue }) => {
    try {
      const response = await api.get<Paginated<Webhook>>('/webhooks', {
        params,
      });
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

export const createWebhook = createAsyncThunk(
  'webhooks/createWebhook',
  async (data: Record<string, unknown>, { dispatch, rejectWithValue }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<Webhook>('/webhooks', data);
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const updateWebhook = createAsyncThunk(
  'webhooks/updateWebhook',
  async (
    { id, data }: { id: number | string; data: Record<string, unknown> },
    { dispatch, rejectWithValue }
  ) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.put<Webhook>(`/webhooks/${id}`, data);
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const deleteWebhook = createAsyncThunk(
  'webhooks/deleteWebhook',
  async (id: number | string, { dispatch, rejectWithValue }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.delete<Record<string, unknown>>(
        `/webhooks/${id}`
      );
      return { id, ...response.data };
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const regenerateWebhookKey = createAsyncThunk(
  'webhooks/regenerateKey',
  async (id: number | string, { dispatch, rejectWithValue }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<{ webhook_key: string }>(
        `/webhooks/${id}/regenerate-key`
      );
      return { id, ...response.data };
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const toggleWebhookStatus = createAsyncThunk(
  'webhooks/toggleStatus',
  async (id: number | string, { dispatch, rejectWithValue }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<Webhook>(`/webhooks/${id}/toggle-status`);
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const fetchWebhookLogs = createAsyncThunk(
  'webhooks/fetchLogs',
  async (
    {
      id,
      params = {},
    }: { id: number | string; params?: Record<string, unknown> },
    { rejectWithValue }
  ) => {
    try {
      const response = await api.get<Paginated<WebhookLog>>(
        `/webhooks/${id}/logs`,
        { params }
      );
      return response.data;
    } catch (error) {
      return rejectWithValue(getErrorMessage(error));
    }
  }
);

const initialState: WebhooksState = {
  webhooks: [],
  currentWebhook: null,
  logs: [],
  loading: false,
  error: null,
  pagination: {
    total: 0,
    page: 1,
    per_page: 20,
  },
  logsPagination: {
    total: 0,
    page: 1,
    per_page: 20,
  },
};

const webhooksSlice = createSlice({
  name: 'webhooks',
  initialState,
  reducers: {
    clearLogs: (state) => {
      state.logs = [];
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch webhooks
      .addCase(fetchWebhooks.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWebhooks.fulfilled, (state, action) => {
        state.loading = false;
        state.webhooks = action.payload.data;
        state.pagination = {
          total: action.payload.total,
          page: action.payload.page,
          per_page: action.payload.per_page,
        };
      })
      .addCase(fetchWebhooks.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Create webhook
      .addCase(createWebhook.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createWebhook.fulfilled, (state, action) => {
        state.loading = false;
        state.webhooks.unshift(action.payload);
        state.pagination.total += 1;
      })
      .addCase(createWebhook.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Update webhook
      .addCase(updateWebhook.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateWebhook.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.webhooks.findIndex(
          (w) => w.id === action.payload.id
        );
        if (index !== -1) {
          state.webhooks[index] = action.payload;
        }
        if (state.currentWebhook?.id === action.payload.id) {
          state.currentWebhook = action.payload;
        }
      })
      .addCase(updateWebhook.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Delete webhook
      .addCase(deleteWebhook.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteWebhook.fulfilled, (state, action) => {
        state.loading = false;
        state.webhooks = state.webhooks.filter(
          (w) => w.id !== action.payload.id
        );
        state.pagination.total -= 1;
      })
      .addCase(deleteWebhook.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Regenerate key
      .addCase(regenerateWebhookKey.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(regenerateWebhookKey.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.webhooks.findIndex(
          (w) => w.id === action.payload.id
        );
        if (index !== -1) {
          state.webhooks[index].webhook_key = action.payload.webhook_key;
        }
        if (state.currentWebhook?.id === action.payload.id) {
          state.currentWebhook.webhook_key = action.payload.webhook_key;
        }
      })
      .addCase(regenerateWebhookKey.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Toggle status
      .addCase(toggleWebhookStatus.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(toggleWebhookStatus.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.webhooks.findIndex(
          (w) => w.id === action.payload.id
        );
        if (index !== -1) {
          state.webhooks[index] = action.payload;
        }
        if (state.currentWebhook?.id === action.payload.id) {
          state.currentWebhook = action.payload;
        }
      })
      .addCase(toggleWebhookStatus.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // Fetch logs
      .addCase(fetchWebhookLogs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWebhookLogs.fulfilled, (state, action) => {
        state.loading = false;
        state.logs = action.payload.data;
        state.logsPagination = {
          total: action.payload.total,
          page: action.payload.page,
          per_page: action.payload.per_page,
        };
      })
      .addCase(fetchWebhookLogs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearLogs } = webhooksSlice.actions;

export default webhooksSlice.reducer;
