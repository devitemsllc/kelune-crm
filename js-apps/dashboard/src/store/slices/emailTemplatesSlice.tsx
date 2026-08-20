import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { startGlobalLoading, stopGlobalLoading } from './globalLoadingSlice';
import type { EmailTemplate, PaginatedItems } from '../../types/models';

interface EmailTemplatesState {
  items: EmailTemplate[];
  currentTemplate: EmailTemplate | null;
  total: number;
  page: number;
  per_page: number;
  loading: boolean;
  error: string | null | undefined;
}

// Async thunks
export const fetchTemplates = createAsyncThunk(
  'emailTemplates/fetchAll',
  async (params: Record<string, unknown> | void = {}) => {
    const response = await api.get<PaginatedItems<EmailTemplate>>(
      '/email-templates',
      { params }
    );
    return response.data;
  }
);

export const fetchTemplate = createAsyncThunk(
  'emailTemplates/fetchOne',
  async (id: number | string) => {
    const response = await api.get<EmailTemplate>(`/email-templates/${id}`);
    return response.data;
  }
);

export const createTemplate = createAsyncThunk(
  'emailTemplates/create',
  async (data: Record<string, unknown>, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<EmailTemplate>('/email-templates', data);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const updateTemplate = createAsyncThunk(
  'emailTemplates/update',
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
      const response = await api.put<EmailTemplate>(
        `/email-templates/${id}`,
        data
      );
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const deleteTemplate = createAsyncThunk(
  'emailTemplates/delete',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      await api.delete(`/email-templates/${id}`);
      return id;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const toggleFavorite = createAsyncThunk(
  'emailTemplates/toggleFavorite',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<EmailTemplate>(
        `/email-templates/${id}/favorite`
      );
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const duplicateTemplate = createAsyncThunk(
  'emailTemplates/duplicate',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<EmailTemplate>(
        `/email-templates/${id}/duplicate`
      );
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

const initialState: EmailTemplatesState = {
  items: [],
  currentTemplate: null,
  total: 0,
  page: 1,
  per_page: 20,
  loading: false,
  error: null,
};

const emailTemplatesSlice = createSlice({
  name: 'emailTemplates',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Fetch templates
      .addCase(fetchTemplates.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTemplates.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.items;
        state.total = action.payload.total;
        state.page = action.payload.page;
        state.per_page = action.payload.per_page;
      })
      .addCase(fetchTemplates.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Fetch single template
      .addCase(fetchTemplate.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTemplate.fulfilled, (state, action) => {
        state.loading = false;
        state.currentTemplate = action.payload;
      })
      .addCase(fetchTemplate.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Create template
      .addCase(createTemplate.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createTemplate.fulfilled, (state, action) => {
        state.loading = false;
        state.items.unshift(action.payload);
        state.total += 1;
      })
      .addCase(createTemplate.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })

      // Update template
      .addCase(updateTemplate.fulfilled, (state, action) => {
        const index = state.items.findIndex((t) => t.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (state.currentTemplate?.id === action.payload.id) {
          state.currentTemplate = action.payload;
        }
      })

      // Delete template
      .addCase(deleteTemplate.fulfilled, (state, action) => {
        state.items = state.items.filter((t) => t.id !== action.payload);
        state.total -= 1;
        if (state.currentTemplate?.id === action.payload) {
          state.currentTemplate = null;
        }
      })

      // Toggle favorite
      .addCase(toggleFavorite.fulfilled, (state, action) => {
        const index = state.items.findIndex((t) => t.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (state.currentTemplate?.id === action.payload.id) {
          state.currentTemplate = action.payload;
        }
      })

      // Duplicate template
      .addCase(duplicateTemplate.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
        state.total += 1;
      });
  },
});

export default emailTemplatesSlice.reducer;
