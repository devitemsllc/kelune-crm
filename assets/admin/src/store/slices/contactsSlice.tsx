import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { startGlobalLoading, stopGlobalLoading } from './globalLoadingSlice';
import type { Contact, ID } from '../../types/models';

interface ContactsState {
  items: Contact[];
  selectedContact: Contact | null;
  loading: boolean;
  error: string | null | undefined;
  filters: {
    search: string;
    status: string;
    tags: ID[];
    lists: ID[];
  };
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

// Async thunks
export const fetchContacts = createAsyncThunk(
  'contacts/fetchContacts',
  async (params: Record<string, unknown> | void = {}, { rejectWithValue }) => {
    try {
      const response = await api.get<Contact[]>('/contacts', { params });
      // Extract total from headers if available
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

export const createContact = createAsyncThunk(
  'contacts/createContact',
  async (contactData: Record<string, unknown>, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.post<Contact>('/contacts', contactData);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const updateContact = createAsyncThunk(
  'contacts/updateContact',
  async (
    { id, ...data }: { id: number | string; [key: string]: unknown },
    { dispatch }
  ) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.put<Contact>(`/contacts/${id}`, data);
      return response.data;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

export const deleteContact = createAsyncThunk(
  'contacts/deleteContact',
  async (id: number | string, { dispatch }) => {
    dispatch(startGlobalLoading());
    try {
      await api.delete(`/contacts/${id}`);
      return id;
    } finally {
      dispatch(stopGlobalLoading());
    }
  }
);

const initialState: ContactsState = {
  items: [],
  selectedContact: null,
  loading: false,
  error: null,
  filters: {
    search: '',
    status: '',
    tags: [],
    lists: [],
  },
  pagination: {
    page: 1,
    perPage: 20,
    total: 0,
    totalPages: 0,
  },
};

const contactsSlice = createSlice({
  name: 'contacts',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // Fetch contacts
      .addCase(fetchContacts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchContacts.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.items;
        state.pagination.total = action.payload.total;
        state.pagination.totalPages = action.payload.totalPages;
      })
      .addCase(fetchContacts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // Create contact
      .addCase(createContact.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createContact.fulfilled, (state, action) => {
        state.loading = false;
        state.items.unshift(action.payload);
        state.pagination.total += 1;
      })
      .addCase(createContact.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message;
      })
      // Update contact
      .addCase(updateContact.fulfilled, (state, action) => {
        const index = state.items.findIndex(
          (item) => item.id === action.payload.id
        );
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        if (state.selectedContact?.id === action.payload.id) {
          state.selectedContact = action.payload;
        }
      })
      // Delete contact
      .addCase(deleteContact.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload);
        if (state.selectedContact?.id === action.payload) {
          state.selectedContact = null;
        }
        state.pagination.total -= 1;
      });
  },
});

export default contactsSlice.reducer;
