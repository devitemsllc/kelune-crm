import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import api from '../../services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { CAP, can } from '@/utils/capabilities';
import { isProActive } from '@/hooks/useFeature';
import type {
  Automation,
  ContactList,
  EmailProvider,
  Segment,
  Tag,
} from '../../types/models';
import type { CustomFieldDef } from '@/utils/customFields';
import type { RootState } from '../index';

/**
 * Shared reference data — the option lists every picker, filter and form
 * across the dashboard reads. Each kind is fetched once, held here, and
 * refetched by every mounted consumer when a mutation invalidates it, so a
 * tag created on one screen is offered on every other without a reload.
 */
export interface ReferenceData {
  tags: Tag[];
  lists: ContactList[];
  segments: Segment[];
  customFields: CustomFieldDef[];
  emailProviders: EmailProvider[];
  /** Active automations only — the set a contact can be enrolled into. */
  automations: Automation[];
  settings: Record<string, unknown>;
}

export type ReferenceKind = keyof ReferenceData;

interface ReferenceEntry<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Bumped by every invalidation; a load is current when it matches. */
  version: number;
  loadedVersion: number;
}

export type ReferenceState = {
  [K in ReferenceKind]: ReferenceEntry<ReferenceData[K]>;
};

const emptyEntry = <T,>(): ReferenceEntry<T> => ({
  data: null,
  loading: false,
  error: null,
  version: 1,
  loadedVersion: 0,
});

const initialState: ReferenceState = {
  tags: emptyEntry(),
  lists: emptyEntry(),
  segments: emptyEntry(),
  customFields: emptyEntry(),
  emailProviders: emptyEntry(),
  automations: emptyEntry(),
  settings: emptyEntry(),
};

const LIST_PARAMS = { per_page: 100 };

/** Ids arrive as strings from PHP; every consumer compares them as numbers. */
const numericIds = <T extends { id: number | string }>(items: T[]): T[] =>
  items.map((item) => ({ ...item, id: Number(item.id) }));

/**
 * One loader per kind. A kind the user may not read (or whose route Pro owns
 * while Pro is inactive) resolves empty instead of requesting and failing.
 */
const loaders: {
  [K in ReferenceKind]: () => Promise<ReferenceData[K]>;
} = {
  tags: async () => {
    if (!can(CAP.VIEW_TAGS)) return [];
    const response = await api.tags.getAll(LIST_PARAMS);
    return numericIds(response.data ?? []);
  },
  lists: async () => {
    if (!can(CAP.VIEW_LISTS)) return [];
    const response = await api.lists.getAll(LIST_PARAMS);
    return numericIds(response.data ?? []);
  },
  segments: async () => {
    if (!isProActive() || !can(CAP.VIEW_SEGMENTS)) return [];
    const response = await api.segments.getAll(LIST_PARAMS);
    return numericIds(response.data ?? []);
  },
  customFields: async () => {
    const response = await api.get<CustomFieldDef[]>('/custom-fields', {
      params: LIST_PARAMS,
    });
    return numericIds(response.data ?? []);
  },
  emailProviders: async () => {
    if (!can(CAP.MANAGE_EMAIL_PROVIDERS)) return [];
    const response = await api.emailProviders.getAll(LIST_PARAMS);
    return numericIds((response.data as EmailProvider[] | undefined) ?? []);
  },
  automations: async () => {
    if (!can(CAP.VIEW_AUTOMATIONS)) return [];
    const response = await api.automations.getAll({
      ...LIST_PARAMS,
      status: 'active',
    });
    return numericIds(response.data?.data ?? []);
  },
  settings: async () => {
    const response = await api.settings.getAll();
    return (response.data ?? {}) as Record<string, unknown>;
  },
};

export const fetchReference = createAsyncThunk<
  { kind: ReferenceKind; data: ReferenceData[ReferenceKind]; version: number },
  ReferenceKind,
  { state: RootState; rejectValue: { kind: ReferenceKind; error: string } }
>(
  'reference/fetch',
  async (kind, { getState, rejectWithValue }) => {
    const { version } = getState().reference[kind];
    try {
      const data = await loaders[kind]();
      return { kind, data, version };
    } catch (error) {
      return rejectWithValue({ kind, error: getErrorMessage(error) });
    }
  },
  {
    // One request per kind at a time; an invalidation during the request
    // leaves loadedVersion behind version, so the hook refetches on settle.
    condition: (kind, { getState }) => !getState().reference[kind].loading,
  }
);

const referenceSlice = createSlice({
  name: 'reference',
  initialState,
  reducers: {
    /** Mark one or more kinds stale; mounted consumers refetch automatically. */
    invalidateReference: (
      state,
      action: PayloadAction<ReferenceKind | ReferenceKind[]>
    ) => {
      const kinds = Array.isArray(action.payload)
        ? action.payload
        : [action.payload];
      kinds.forEach((kind) => {
        state[kind].version += 1;
      });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReference.pending, (state, action) => {
        const entry = state[action.meta.arg];
        entry.loading = true;
        entry.error = null;
      })
      .addCase(fetchReference.fulfilled, (state, action) => {
        const { kind, data, version } = action.payload;
        const entry = state[kind] as ReferenceEntry<typeof data>;
        entry.data = data;
        entry.loading = false;
        entry.loadedVersion = version;
      })
      .addCase(fetchReference.rejected, (state, action) => {
        const entry = state[action.meta.arg];
        entry.loading = false;
        // A failed load still counts as attempted for its version, otherwise
        // every mounted consumer would retry in a loop.
        entry.loadedVersion = entry.version;
        entry.error =
          action.payload?.error ?? action.error.message ?? 'Request failed';
      });
  },
});

export const { invalidateReference } = referenceSlice.actions;

export default referenceSlice.reducer;
