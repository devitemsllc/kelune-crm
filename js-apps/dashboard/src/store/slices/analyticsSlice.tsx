import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import dayjs from 'dayjs';
import api from '../../services/api';
import type {
  AnalyticsRange,
  CampaignsAnalytics,
  ContactsAnalytics,
  EmailsAnalytics,
  OverviewData,
} from '../../types/analytics';

interface AnalyticsState {
  range: AnalyticsRange;
  overview: OverviewData | null;
  contacts: ContactsAnalytics | null;
  emails: EmailsAnalytics | null;
  campaigns: CampaignsAnalytics | null;
  loading: {
    overview: boolean;
    contacts: boolean;
    emails: boolean;
    campaigns: boolean;
  };
  error: string | null | undefined;
}

const defaultRange = (): AnalyticsRange => ({
  date_from: dayjs().subtract(29, 'day').format('YYYY-MM-DD'),
  date_to: dayjs().format('YYYY-MM-DD'),
});

// The overview endpoint ignores the range (fixed 30-day mini-charts); the other
// three take date_from/date_to.
export const fetchOverview = createAsyncThunk(
  'analytics/overview',
  async () => {
    const response = await api.get<OverviewData>('/analytics/dashboard');
    return response.data;
  }
);

export const fetchContactsAnalytics = createAsyncThunk(
  'analytics/contacts',
  async (params: AnalyticsRange) => {
    const response = await api.get<ContactsAnalytics>(
      '/analytics/contacts-growth',
      { params }
    );
    return response.data;
  }
);

export const fetchEmailsAnalytics = createAsyncThunk(
  'analytics/emails',
  async (params: AnalyticsRange) => {
    const response = await api.get<EmailsAnalytics>('/analytics/email-stats', {
      params,
    });
    return response.data;
  }
);

export const fetchCampaignsAnalytics = createAsyncThunk(
  'analytics/campaigns',
  async (params: AnalyticsRange) => {
    const response = await api.get<CampaignsAnalytics>(
      '/analytics/campaign-performance',
      { params }
    );
    return response.data;
  }
);

const initialState: AnalyticsState = {
  range: defaultRange(),
  overview: null,
  contacts: null,
  emails: null,
  campaigns: null,
  loading: {
    overview: false,
    contacts: false,
    emails: false,
    campaigns: false,
  },
  error: null,
};

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {
    setRange: (state, action: PayloadAction<AnalyticsRange>) => {
      state.range = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchOverview.pending, (state) => {
        state.loading.overview = true;
        state.error = null;
      })
      .addCase(fetchOverview.fulfilled, (state, action) => {
        state.loading.overview = false;
        state.overview = action.payload;
      })
      .addCase(fetchOverview.rejected, (state, action) => {
        state.loading.overview = false;
        state.error = action.error.message;
      })

      .addCase(fetchContactsAnalytics.pending, (state) => {
        state.loading.contacts = true;
        state.error = null;
      })
      .addCase(fetchContactsAnalytics.fulfilled, (state, action) => {
        state.loading.contacts = false;
        state.contacts = action.payload;
      })
      .addCase(fetchContactsAnalytics.rejected, (state, action) => {
        state.loading.contacts = false;
        state.error = action.error.message;
      })

      .addCase(fetchEmailsAnalytics.pending, (state) => {
        state.loading.emails = true;
        state.error = null;
      })
      .addCase(fetchEmailsAnalytics.fulfilled, (state, action) => {
        state.loading.emails = false;
        state.emails = action.payload;
      })
      .addCase(fetchEmailsAnalytics.rejected, (state, action) => {
        state.loading.emails = false;
        state.error = action.error.message;
      })

      .addCase(fetchCampaignsAnalytics.pending, (state) => {
        state.loading.campaigns = true;
        state.error = null;
      })
      .addCase(fetchCampaignsAnalytics.fulfilled, (state, action) => {
        state.loading.campaigns = false;
        state.campaigns = action.payload;
      })
      .addCase(fetchCampaignsAnalytics.rejected, (state, action) => {
        state.loading.campaigns = false;
        state.error = action.error.message;
      });
  },
});

export const { setRange } = analyticsSlice.actions;

export default analyticsSlice.reducer;
