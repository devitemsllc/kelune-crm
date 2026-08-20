import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { startGlobalLoading, stopGlobalLoading } from './globalLoadingSlice';
import type {
  EmailLog,
  EmailLogStats,
  PaginatedItems,
} from '../../types/models';

interface EmailLogsState {
  items: EmailLog[];
  currentLog: EmailLog | null;
  stats: EmailLogStats;
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
  filters: {
    search: string;
    email_type: string | null;
    status: string | null;
    provider: string | null;
    contact_id: number | string | null;
    campaign_id: number | string | null;
    automation_id: number | string | null;
    date_from: string | null;
    date_to: string | null;
    orderby: string;
    order: string;
  };
  loading: boolean;
  statsLoading: boolean;
  error: string | null | undefined;
  selectedIds: Array<number | string>;
}

// Async thunks
export const fetchEmailLogs = createAsyncThunk(
  'emailLogs/fetchAll',
  async (params: Record<string, unknown> | void = {}) => {
    const response = await api.get<PaginatedItems<EmailLog>>('/email-logs', {
      params,
    });
    return response.data;
  }
);

export const fetchEmailLog = createAsyncThunk(
  'emailLogs/fetchOne',
  async (id: number | string) => {
    const response = await api.get<EmailLog>(`/email-logs/${id}`);
    return response.data;
  }
);

export const deleteEmailLog = createAsyncThunk(
  'emailLogs/delete',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      await api.delete(`/email-logs/${id}`);
      return id;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const bulkDeleteEmailLogs = createAsyncThunk(
  'emailLogs/bulkDelete',
  async (ids: Array<number | string>, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post('/email-logs/bulk-delete', { ids });
      return { ids, data: response.data };
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const resendEmail = createAsyncThunk(
  'emailLogs/resend',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post(`/email-logs/${id}/resend`);
      return { id, data: response.data };
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const fetchStats = createAsyncThunk(
  'emailLogs/fetchStats',
  async (params: Record<string, unknown> | void = {}) => {
    const response = await api.get<EmailLogStats>('/email-logs/stats', {
      params,
    });
    return response.data;
  }
);

export const exportCSV = createAsyncThunk(
  'emailLogs/export',
  async (params: Record<string, unknown> | void = {}, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.get('/email-logs/export', {
        params,
        responseType: 'blob',
      });
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

const initialState: EmailLogsState = {
  items: [],
  currentLog: null,
  stats: {
    total_sent: 0,
    failed_count: 0,
    bounced_count: 0,
    delivered_count: 0,
    opened_count: 0,
    clicked_count: 0,
    open_rate: 0,
    click_rate: 0,
    bounce_rate: 0,
    by_type: {},
    by_provider: {},
    by_day: [],
  },
  total: 0,
  page: 1,
  per_page: 20,
  total_pages: 0,
  filters: {
    search: '',
    email_type: null,
    status: null,
    provider: null,
    contact_id: null,
    campaign_id: null,
    automation_id: null,
    date_from: null,
    date_to: null,
    orderby: 'created_at',
    order: 'DESC',
  },
  loading: false,
  statsLoading: false,
  error: null,
  selectedIds: [],
};

const emailLogsSlice = createSlice({
  name: 'emailLogs',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Fetch email logs
      .addCase(fetchEmailLogs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEmailLogs.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.items;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.per_page = action.payload.per_page;
        state.total_pages = action.payload.total_pages ?? 0;
      })
      .addCase(fetchEmailLogs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Fetch single email log
      .addCase(fetchEmailLog.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchEmailLog.fulfilled, (state, action) => {
        state.loading = false;
        state.currentLog = action.payload;
      })
      .addCase(fetchEmailLog.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Delete email log
      .addCase(deleteEmailLog.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteEmailLog.fulfilled, (state, action) => {
        state.loading = false;
        state.items = state.items.filter((log) => log.id !== action.payload);
        state.total -= 1;
        if (state.currentLog?.id === action.payload) {
          state.currentLog = null;
        }
        // Remove from selected IDs
        state.selectedIds = state.selectedIds.filter(
          (id) => id !== action.payload
        );
      })
      .addCase(deleteEmailLog.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Bulk delete email logs
      .addCase(bulkDeleteEmailLogs.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(bulkDeleteEmailLogs.fulfilled, (state, action) => {
        state.loading = false;
        const deletedIds = action.payload.ids;
        state.items = state.items.filter((log) => !deletedIds.includes(log.id));
        state.total -= deletedIds.length;
        state.selectedIds = [];
      })
      .addCase(bulkDeleteEmailLogs.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Resend email
      .addCase(resendEmail.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(resendEmail.fulfilled, (state, _action) => {
        state.loading = false;
        // Optionally update the log status or show success message
      })
      .addCase(resendEmail.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Fetch stats
      .addCase(fetchStats.pending, (state) => {
        state.statsLoading = true;
        state.error = null;
      })
      .addCase(fetchStats.fulfilled, (state, action) => {
        state.statsLoading = false;
        state.stats = action.payload;
      })
      .addCase(fetchStats.rejected, (state, action) => {
        state.statsLoading = false;
        state.error = action.error.message;
      })

      // Export CSV
      .addCase(exportCSV.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(exportCSV.fulfilled, (state) => {
        state.loading = false;
      })
      .addCase(exportCSV.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      });
  },
});

export default emailLogsSlice.reducer;
