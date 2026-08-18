import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { getApiError, getErrorMessage } from '@/utils/getErrorMessage';
import { startGlobalLoading, stopGlobalLoading } from './globalLoadingSlice';
import type {
  Automation,
  AutomationStep,
  AutomationSummaryStats,
} from '../../types/models';

interface AutomationsState {
  items: Automation[];
  total: number;
  page: number;
  per_page: number;
  selectedAutomation: Automation | null;
  steps: AutomationStep[];
  // Non-entity analytics/validation payloads — kept loose.
  stats: Record<string, unknown> | null;
  summaryStats: AutomationSummaryStats | null;
  validationResult: { valid?: boolean; errors?: string[] } | null;
  loading: boolean;
  stepsLoading: boolean;
  error: string | null | undefined;
  filters: {
    search: string;
    status: string;
    trigger_type: string;
  };
}

// Async thunks
export const fetchAutomations = createAsyncThunk(
  'automations/fetchAll',
  async (params: Record<string, unknown> = {}) => {
    const response = await api.automations.getAll(params);
    return response.data;
  }
);

export const fetchAutomation = createAsyncThunk(
  'automations/fetchOne',
  async (id: number | string) => {
    const response = await api.automations.getOne(id);
    return response.data;
  }
);

export const createAutomation = createAsyncThunk(
  'automations/create',
  async (data: Record<string, unknown>, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.automations.create(data);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const updateAutomation = createAsyncThunk(
  'automations/update',
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
      const response = await api.automations.update(id, data);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const deleteAutomation = createAsyncThunk(
  'automations/delete',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      await api.automations.delete(id);
      return id;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const duplicateAutomation = createAsyncThunk(
  'automations/duplicate',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.automations.duplicate(id);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const activateAutomation = createAsyncThunk(
  'automations/activate',
  async (id: number | string, { dispatch, rejectWithValue }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.automations.activate(id);
      return { id, ...response.data };
    } catch (error) {
      // Surface the real reason (e.g. validation errors), not a generic message.
      const apiError = getApiError(error);
      const validationErrors = apiError?.data?.errors;
      const messageText =
        validationErrors && validationErrors.length > 0
          ? validationErrors.join(' ')
          : apiError?.message || getErrorMessage(error);
      return rejectWithValue(messageText);
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const pauseAutomation = createAsyncThunk(
  'automations/pause',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.automations.pause(id);
      return { id, ...response.data };
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const archiveAutomation = createAsyncThunk(
  'automations/archive',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.automations.archive(id);
      return { id, ...response.data };
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const fetchSummaryStats = createAsyncThunk(
  'automations/fetchSummaryStats',
  async () => {
    const response = await api.automations.getSummaryStats();
    return response.data as AutomationSummaryStats;
  }
);

export const bulkActionAutomations = createAsyncThunk(
  'automations/bulkAction',
  async (
    { action, ids }: { action: string; ids: Array<number | string> },
    { dispatch }
  ) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.automations.bulkAction(action, ids);
      return { action, ids, ...response.data };
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

// Steps
export const fetchAutomationSteps = createAsyncThunk(
  'automations/fetchSteps',
  async (id: number | string) => {
    const response = await api.automations.getSteps(id);
    return response.data;
  }
);

export const bulkCreateSteps = createAsyncThunk(
  'automations/bulkCreateSteps',
  async (
    {
      id,
      steps,
    }: {
      id: number | string;
      steps: Record<string, unknown>[];
    },
    { dispatch }
  ) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.automations.bulkCreateSteps(id, steps);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

const initialState: AutomationsState = {
  items: [],
  total: 0,
  page: 1,
  per_page: 20,
  selectedAutomation: null,
  steps: [],
  stats: null,
  summaryStats: null,
  validationResult: null,
  loading: false,
  stepsLoading: false,
  error: null,
  filters: {
    search: '',
    status: '',
    trigger_type: '',
  },
};

const automationsSlice = createSlice({
  name: 'automations',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Fetch all automations
      .addCase(fetchAutomations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAutomations.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.data || [];
        state.total = action.payload.total || 0;
        state.page = action.payload.page || 1;
        state.per_page = action.payload.per_page || 20;
      })
      .addCase(fetchAutomations.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Fetch single automation
      .addCase(fetchAutomation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAutomation.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedAutomation = action.payload;
      })
      .addCase(fetchAutomation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Create automation
      .addCase(createAutomation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createAutomation.fulfilled, (state, action) => {
        state.loading = false;
        state.items.unshift(action.payload);
        state.total += 1;
      })
      .addCase(createAutomation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Update automation
      .addCase(updateAutomation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateAutomation.fulfilled, (state, action) => {
        state.loading = false;
        const index = state.items.findIndex(
          (item) => item.id === action.payload.id
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (
          state.selectedAutomation &&
          state.selectedAutomation.id === action.payload.id
        ) {
          state.selectedAutomation = action.payload;
        }
      })
      .addCase(updateAutomation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Delete automation
      .addCase(deleteAutomation.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteAutomation.fulfilled, (state, action) => {
        state.loading = false;
        state.items = state.items.filter((item) => item.id !== action.payload);
        state.total -= 1;
      })
      .addCase(deleteAutomation.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Duplicate automation
      .addCase(duplicateAutomation.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
        state.total += 1;
      })

      // Activate automation
      .addCase(activateAutomation.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (item) => item.id === action.payload.id
        );
        if (index !== -1) {
          state.items[index].status = 'active';
        }
      })

      // Pause automation
      .addCase(pauseAutomation.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (item) => item.id === action.payload.id
        );
        if (index !== -1) {
          state.items[index].status = 'paused';
        }
      })

      // Archive automation
      .addCase(archiveAutomation.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (item) => item.id === action.payload.id
        );
        if (index !== -1) {
          state.items[index].status = 'archived';
        }
      })

      // Fetch summary stats
      .addCase(fetchSummaryStats.fulfilled, (state, action) => {
        state.summaryStats = action.payload;
      })

      // Fetch steps
      .addCase(fetchAutomationSteps.pending, (state) => {
        state.stepsLoading = true;
      })
      .addCase(fetchAutomationSteps.fulfilled, (state, action) => {
        state.stepsLoading = false;
        state.steps = action.payload.data || [];
      })
      .addCase(fetchAutomationSteps.rejected, (state, action) => {
        state.stepsLoading = false;
        state.error = action.error.message;
      })

      // Bulk create steps
      .addCase(bulkCreateSteps.fulfilled, (state, _action) => {
        state.stepsLoading = false;
      });
  },
});

export default automationsSlice.reducer;
