import { __ } from '@wordpress/i18n';
import type { ContactStatus } from '@/types/models';

// Single source of truth for status labels; PHP mirror is Models\Contact::STATUSES.
const STATUS_LABEL: Record<ContactStatus, string> = {
  active: __('Active', 'kelune-crm'),
  pending: __('Pending', 'kelune-crm'),
  unsubscribed: __('Unsubscribed', 'kelune-crm'),
  bounced: __('Bounced', 'kelune-crm'),
};

const STATUS_COLOR: Record<ContactStatus, string> = {
  active: 'green',
  pending: 'orange',
  unsubscribed: 'red',
  bounced: 'volcano',
};

const CONTACT_STATUSES = Object.keys(STATUS_LABEL) as ContactStatus[];

export const isContactStatus = (value: string): value is ContactStatus =>
  Object.prototype.hasOwnProperty.call(STATUS_LABEL, value);

export const contactStatusLabel = (status?: string): string => {
  if (!status) return '';
  return isContactStatus(status)
    ? STATUS_LABEL[status]
    : status.charAt(0).toUpperCase() + status.slice(1);
};

export const contactStatusColor = (status?: string): string =>
  status && isContactStatus(status) ? STATUS_COLOR[status] : 'default';

export const CONTACT_STATUS_OPTIONS = CONTACT_STATUSES.map((value) => ({
  value,
  label: STATUS_LABEL[value],
}));
