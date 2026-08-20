import axios from 'axios';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type {
  Automation,
  AutomationStep,
  Campaign,
  CampaignAbTest,
  CampaignVariant,
  Contact,
  ContactEvent,
  ContactList,
  CronStatus,
  LicenseStatus,
  Paginated,
  Segment,
  SmartLink,
  Tag,
} from '../types/models';

// Auth is WordPress cookie + REST nonce (X-WP-Nonce); no bearer token flow.
const api = axios.create({
  baseURL: window.kelunecrm?.api_url || '/wp-json/kelune-crm/v1',
  headers: {
    'Content-Type': 'application/json',
    'X-WP-Nonce': window.kelunecrm?.nonce || '',
  },
});

/**
 * SINGLE-PLACE ENVELOPE UNWRAP — the one convention for the whole dashboard.
 *
 * The PHP REST layer is mixed: most endpoints wrap payloads in
 * `{ success: true, data: <payload>, message? }`, a few return the bare payload
 * (Contacts/Segments get/create/update, utility routes), and a few are not JSON
 * at all (CSV blobs, tracking pixels). This interceptor detects the envelope and
 * replaces `response.data` with the inner payload, so `response.data` IS the PHP
 * `data` payload either way.
 *
 * Rules:
 *  - Only unwraps plain objects owning a boolean `success` AND a `data` key.
 *  - Arrays, Blobs and bare objects pass through — already the payload.
 *  - `message` is preserved on `response.message` for toasts.
 *  - Pagination is either in X-WP-Total / X-WP-TotalPages headers (Contacts,
 *    Segments, CustomFields) or nested in the payload as { data|items, total,
 *    page, per_page } (Campaigns, Automations, EmailLogs, EmailTemplates,
 *    SmartLinks, Webhooks) — check per endpoint.
 */
const isSuccessEnvelope = (
  body: unknown
): body is { success: boolean; data: unknown; message?: string } =>
  typeof body === 'object' &&
  body !== null &&
  !Array.isArray(body) &&
  typeof (body as Record<string, unknown>).success === 'boolean' &&
  'data' in (body as Record<string, unknown>);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    if (isSuccessEnvelope(response.data)) {
      const { data, message } = response.data;
      if (message !== undefined) {
        (response as AxiosResponse & { message?: string }).message = message;
      }
      response.data = data;
    }
    return response;
  },
  (error) => {
    if (error.response) {
      // Handle specific error cases
      switch (error.response.status) {
        case 401:
          // Unauthorized - redirect to login
          window.location.href = '/wp-login.php';
          break;
        case 403:
          // Forbidden
          console.error('Access denied');
          break;
        case 404:
          // Not found
          console.error('Resource not found');
          break;
        case 500:
          // Server error
          console.error('Server error');
          break;
        default:
          console.error('API error:', error.response.data);
      }
    }
    return Promise.reject(error);
  }
);

/** Common shapes used across the API surface. */
type Id = number | string;
type Params = Record<string, unknown>;
/** Request body — loosely typed; callers narrow per endpoint. */
type Payload = Record<string, unknown>;
/** Generic response alias. The payload type defaults to `unknown`; callers
 *  either supply `<T>` or narrow `response.data` themselves. */
type Res<T = unknown> = Promise<AxiosResponse<T>>;

// API methods
const apiService = {
  // Generic methods
  get: <T = unknown,>(url: string, config?: AxiosRequestConfig): Res<T> =>
    api.get(url, config),
  post: <T = unknown,>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Res<T> => api.post(url, data, config),
  put: <T = unknown,>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Res<T> => api.put(url, data, config),
  patch: <T = unknown,>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig
  ): Res<T> => api.patch(url, data, config),
  delete: <T = unknown,>(url: string, config?: AxiosRequestConfig): Res<T> =>
    api.delete(url, config),

  // Contacts
  contacts: {
    getOne: (id: Id): Res<Contact> => api.get(`/contacts/${id}`),
    update: (id: Id, data: Payload): Res<Contact> =>
      api.put(`/contacts/${id}`, data),
    bulkUpdate: (ids: Id[], data: Payload) =>
      api.put('/contacts/bulk', { ids, data }),
    bulkDelete: (ids: Id[]) =>
      api.delete('/contacts/bulk-delete', { data: { ids } }),
    export: (params?: Params) =>
      api.get('/contacts/export', { params, responseType: 'blob' }),
    import: (rows: Payload[]) => api.post('/contacts/import', { rows }),
    addTags: (id: Id, tagIds: Id[]) =>
      api.post(`/contacts/${id}/tags`, { tag_ids: tagIds }),
    getEvents: (id: Id, params?: Params): Res<ContactEvent[]> =>
      api.get(`/contacts/${id}/events`, { params }),
  },

  // Campaigns
  campaigns: {
    getAll: (params?: Params) => api.get('/campaigns', { params }),
    getOne: (id: Id): Res<Campaign> => api.get(`/campaigns/${id}`),
    sendTest: (id: Id, email: string) =>
      api.post(`/campaigns/${id}/test`, { email }),
    getStats: (id: Id) => api.get(`/campaigns/${id}/stats`),
    getAnalytics: (
      id: Id,
      type: 'geographic' | 'device' | 'browser' | 'links'
    ) => api.get(`/campaigns/${id}/analytics/${type}`),
    getRecipientCount: (id: Id): Res<{ count: number }> =>
      api.get(`/campaigns/${id}/recipients/count`),
    /** Count for targeting rules still being edited (not persisted yet). */
    previewRecipientCount: (targeting: Payload): Res<{ count: number }> =>
      api.post('/campaigns/recipients/count', targeting),

    // A/B testing (Pro): these routes 404 while the add-on is inactive, so
    // callers must gate them on isProActive() or tolerate the rejection.
    getAbTest: (id: Id): Res<CampaignAbTest> =>
      api.get(`/campaigns/${id}/ab-test`),
    createVariant: (id: Id, data: Payload): Res<CampaignVariant> =>
      api.post(`/campaigns/${id}/variants`, data),
    updateVariant: (
      id: Id,
      variantId: Id,
      data: Payload
    ): Res<CampaignVariant> =>
      api.put(`/campaigns/${id}/variants/${variantId}`, data),
    deleteVariant: (id: Id, variantId: Id) =>
      api.delete(`/campaigns/${id}/variants/${variantId}`),
    determineWinner: (id: Id, metric: string) =>
      api.post(`/campaigns/${id}/variants/winner`, { metric }),
  },

  // Automations
  automations: {
    getAll: (params?: Params): Res<Paginated<Automation>> =>
      api.get('/automations', { params }),
    getOne: (id: Id): Res<Automation> => api.get(`/automations/${id}`),
    create: (data: Payload): Res<Automation> => api.post('/automations', data),
    update: (id: Id, data: Payload): Res<Automation> =>
      api.put(`/automations/${id}`, data),
    delete: (id: Id) => api.delete(`/automations/${id}`),
    duplicate: (id: Id): Res<Automation> =>
      api.post(`/automations/${id}/duplicate`),
    activate: (id: Id) => api.post(`/automations/${id}/activate`),
    pause: (id: Id) => api.post(`/automations/${id}/pause`),
    /** Manually enroll a single contact into an automation. */
    enroll: (id: Id, contactId: Id) =>
      api.post(`/automations/${id}/enroll`, { contact_id: contactId }),
    getStats: (id: Id) => api.get(`/automations/${id}/stats`),
    getSummaryStats: () => api.get('/automations/stats/summary'),
    bulkAction: (action: string, ids: Id[]) =>
      api.post('/automations/bulk', { action, ids }),
    // Stateless test send for a send_email step's current (possibly unsaved)
    // config — the step drawer's "Send Test" button.
    testEmail: (email: string, actionConfig: Payload) =>
      api.post('/automations/test-email', {
        email,
        action_config: actionConfig,
      }),

    // Steps
    getSteps: (id: Id): Res<{ data: AutomationStep[] }> =>
      api.get(`/automations/${id}/steps`),
    bulkCreateSteps: (id: Id, steps: Payload[]) =>
      api.post(`/automations/${id}/steps/bulk`, { steps }),
  },

  // Analytics
  analytics: {
    getHome: (params?: Params) => api.get('/analytics/home', { params }),
    getContactsGrowth: (params?: Params) =>
      api.get('/analytics/contacts-growth', { params }),
    getEmailStats: (params?: Params) =>
      api.get('/analytics/email-stats', { params }),
  },

  // Settings
  // One endpoint for every settings section: each GETs the whole blob and PUTs
  // back only the fields it owns (the backend merges partial saves).
  settings: {
    getAll: () => api.get<Payload>('/settings'),
    update: (data: Payload) => api.put<Payload>('/settings', data),
  },

  // Diagnostics (Settings → Cron Monitor)
  tools: {
    getCronStatus: (): Res<CronStatus> => api.get('/tools/cron-status'),
    /** Runs a registered cron hook now; resolves with the refreshed status. */
    runCron: (hook: string): Res<CronStatus> =>
      api.post('/tools/run-cron', { hook }),
  },

  // Lists
  lists: {
    getAll: (params?: Params): Res<ContactList[]> =>
      api.get('/lists', { params }),
    create: (data: Payload): Res<ContactList> => api.post('/lists', data),
    update: (id: Id, data: Payload): Res<ContactList> =>
      api.put(`/lists/${id}`, data),
    delete: (id: Id) => api.delete(`/lists/${id}`),
  },

  // Tags
  tags: {
    getAll: (params?: Params): Res<Tag[]> => api.get('/tags', { params }),
    create: (data: Payload): Res<Tag> => api.post('/tags', data),
    update: (id: Id, data: Payload): Res<Tag> => api.put(`/tags/${id}`, data),
    delete: (id: Id) => api.delete(`/tags/${id}`),
  },

  // Segments
  segments: {
    getAll: (params?: Params): Res<Segment[]> =>
      api.get('/segments', { params }),
    create: (data: Payload): Res<Segment> => api.post('/segments', data),
    update: (id: Id, data: Payload): Res<Segment> =>
      api.put(`/segments/${id}`, data),
    delete: (id: Id) => api.delete(`/segments/${id}`),
    refresh: (id: Id) => api.post(`/segments/${id}/refresh`),
    preview: (conditions: unknown, match_type: string) =>
      api.post('/segments/preview', { conditions, match_type }),
    export: (id: Id) =>
      api.get(`/segments/${id}/export`, { responseType: 'blob' }),
  },

  // Automation Templates
  templates: {
    getAll: () => api.get('/automations/templates'),
    import: (templateId: Id, name: string) =>
      api.post(`/automations/templates/${templateId}/import`, { name }),
  },

  // Email Providers (sending connections)
  emailProviders: {
    getAll: (params?: Params) => api.get('/email-providers', { params }),
    create: (data: Payload) => api.post('/email-providers', data),
    update: (id: Id, data: Payload) => api.put(`/email-providers/${id}`, data),
    delete: (id: Id) => api.delete(`/email-providers/${id}`),
    /** Test a saved provider (pass { id }) or an unsaved inline config. */
    test: (data: Payload) => api.post('/email-providers/test', data),
    /** Connection Details: stats, valid senders, verified domains (SES gets live stats). */
    connectionDetails: (id: Id) =>
      api.get(`/email-providers/${id}/connection-details`),
    /** Register an extra sender email on a connection (Amazon SES only). */
    addSender: (id: Id, email: string) =>
      api.post(`/email-providers/${id}/senders`, { email }),
    /** Remove a manually-added sender email from a connection (Amazon SES only). */
    removeSender: (id: Id, email: string) =>
      api.delete(`/email-providers/${id}/senders`, { data: { email } }),
  },

  // License (Pro add-on; these routes 404 while Pro is inactive)
  license: {
    status: (): Res<LicenseStatus> => api.get('/license'),
    activate: (
      license_key: string,
      license_email: string
    ): Res<LicenseStatus> =>
      api.post('/license/activate', { license_key, license_email }),
    deactivate: (): Res<LicenseStatus> => api.post('/license/deactivate'),
  },

  // Smart Links
  smartLinks: {
    getAll: (params?: Params): Res<Paginated<SmartLink>> =>
      api.get('/smart-links', { params }),
    create: (data: Payload): Res<SmartLink> => api.post('/smart-links', data),
    update: (id: Id, data: Payload): Res<SmartLink> =>
      api.put(`/smart-links/${id}`, data),
    delete: (id: Id) => api.delete(`/smart-links/${id}`),
  },
};

export default apiService;
