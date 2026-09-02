import api from '../services/api';

/** Prefix that namespaces a custom field wherever contact fields are flat. */
export const CUSTOM_FIELD_PREFIX = 'custom_field__';

/** Custom field definition as returned by GET /custom-fields. */
export interface CustomFieldDef {
  id: number;
  field_key: string;
  field_label: string;
  field_type: string;
  field_required?: number;
  field_options?: {
    choices?: string[];
    options?: string[];
  };
  field_default?: unknown;
  field_order?: number;
}

export const customFieldKey = (field: CustomFieldDef): string =>
  `${CUSTOM_FIELD_PREFIX}${field.field_key}`;

export const fetchCustomFields = async (): Promise<CustomFieldDef[]> => {
  const response = await api.get<CustomFieldDef[]>('/custom-fields', {
    params: { per_page: 100 },
  });
  return response.data || [];
};

/** Flatten a stored custom field value for display; checkbox fields hold a list. */
export const customFieldDisplayValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? '')).join(', ');
  }
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return String(value);
};
