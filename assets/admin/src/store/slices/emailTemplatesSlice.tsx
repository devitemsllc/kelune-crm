import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { startGlobalLoading, stopGlobalLoading } from './globalLoadingSlice';
import type { EmailTemplate, PaginatedItems } from '../../types/models';

// Metadata (name/description) captured by the info modal on the list page and
// carried into the builder route, since the builder itself only edits content
// (html/json). Kept in the store so it survives the navigation.
interface TemplateDraftMeta {
  name: string;
  description?: string;
}

interface EmailTemplatesState {
  items: EmailTemplate[];
  predefined: EmailTemplate[];
  currentTemplate: EmailTemplate | null;
  draftMeta: TemplateDraftMeta | null;
  total: number;
  page: number;
  per_page: number;
  filters: {
    search: string;
    template_type: string | null;
    is_favorite: boolean | null;
  };
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
  predefined: [],
  currentTemplate: null,
  draftMeta: null,
  total: 0,
  page: 1,
  per_page: 20,
  filters: {
    search: '',
    template_type: null,
    is_favorite: null,
  },
  loading: false,
  error: null,
};

const emailTemplatesSlice = createSlice({
  name: 'emailTemplates',
  initialState,
  reducers: {
    clearDraftMeta: (state) => {
      state.draftMeta = null;
    },
  },
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

export const { clearDraftMeta } = emailTemplatesSlice.actions;
export default emailTemplatesSlice.reducer;
