import { __ } from '@wordpress/i18n';

const FALLBACK = ['email'];

export const contactRequiredFields = (): string[] => {
  const fields = window.kelunecrm?.contact_required_fields;

  return Array.isArray(fields) && fields.length > 0 ? fields : FALLBACK;
};

export const isContactRequired = (field: string): boolean =>
  contactRequiredFields().includes(field);

export const contactFieldLabel = (field: string): string => {
  const labels: Record<string, string> = {
    email: __('Email', 'kelune-crm'),
    first_name: __('First Name', 'kelune-crm'),
    last_name: __('Last Name', 'kelune-crm'),
    company: __('Company', 'kelune-crm'),
    phone: __('Phone', 'kelune-crm'),
    address_line1: __('Address Line 1', 'kelune-crm'),
    address_line2: __('Address Line 2', 'kelune-crm'),
    city: __('City', 'kelune-crm'),
    state: __('State', 'kelune-crm'),
    country: __('Country', 'kelune-crm'),
    postal_code: __('Postal Code', 'kelune-crm'),
    status: __('Status', 'kelune-crm'),
  };

  return labels[field] ?? field;
};

export const contactRequiredLabels = (): string =>
  contactRequiredFields().map(contactFieldLabel).join(', ');
