import { configureStore } from '@reduxjs/toolkit';
import contactsReducer from './slices/contactsSlice';
import campaignsReducer from './slices/campaignsSlice';
import automationsReducer from './slices/automationsSlice';
import segmentsReducer from './slices/segmentsSlice';
import webhooksReducer from './slices/webhooksSlice';
import smartLinksReducer from './slices/smartLinksSlice';
import emailTemplatesReducer from './slices/emailTemplatesSlice';
import emailLogsReducer from './slices/emailLogsSlice';
import analyticsReducer from './slices/analyticsSlice';
import uiReducer from './slices/uiSlice';
import globalLoadingReducer from './slices/globalLoadingSlice';
import setupWizardReducer from './slices/setupWizardSlice';

export const store = configureStore({
  reducer: {
    contacts: contactsReducer,
    campaigns: campaignsReducer,
    automations: automationsReducer,
    segments: segmentsReducer,
    webhooks: webhooksReducer,
    smartLinks: smartLinksReducer,
    emailTemplates: emailTemplatesReducer,
    emailLogs: emailLogsReducer,
    analytics: analyticsReducer,
    ui: uiReducer,
    globalLoading: globalLoadingReducer,
    setupWizard: setupWizardReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['ui/setNotification'],
        ignoredPaths: ['ui.notification'],
      },
    }),
});

type AppStore = typeof store;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
