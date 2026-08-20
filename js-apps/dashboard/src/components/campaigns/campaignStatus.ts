import { __ } from '@wordpress/i18n';
import { fromUtc } from '../../utils/time';
import type { Campaign } from '@/types/models';

/**
 * A campaign's stored status is its INTENT, and the user owns every value except
 * `sent`, which the completion sweep writes once the queue has drained.
 */
export const CAMPAIGN_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused',
  SENT: 'sent',
} as const;

/**
 * What the campaign is actually doing, derived from the stored status plus the
 * send time. `scheduled` and `sending` are the two faces of an active campaign,
 * so neither is ever stored — they would only fall out of step with the queue.
 */
export type CampaignDisplayState =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'paused'
  | 'sent';

const STATE_LABELS: Record<CampaignDisplayState, string> = {
  draft: __('Draft', 'kelune-crm'),
  scheduled: __('Scheduled', 'kelune-crm'),
  sending: __('Sending', 'kelune-crm'),
  paused: __('Paused', 'kelune-crm'),
  sent: __('Sent', 'kelune-crm'),
};

const STATE_COLORS: Record<CampaignDisplayState, string> = {
  draft: 'default',
  scheduled: 'blue',
  sending: 'processing',
  paused: 'warning',
  sent: 'success',
};

/** Whether the send time is set and still ahead of us. */
const waitsForSchedule = (campaign: Campaign): boolean => {
  const scheduled = fromUtc(campaign.scheduled_at);
  return Boolean(scheduled && scheduled.isAfter(Date.now()));
};

export const campaignDisplayState = (
  campaign: Campaign
): CampaignDisplayState => {
  if (campaign.status === CAMPAIGN_STATUS.SENT) return 'sent';
  if (campaign.status === CAMPAIGN_STATUS.PAUSED) return 'paused';
  if (campaign.status !== CAMPAIGN_STATUS.ACTIVE) return 'draft';
  return waitsForSchedule(campaign) ? 'scheduled' : 'sending';
};

export const campaignStateLabel = (campaign: Campaign): string =>
  STATE_LABELS[campaignDisplayState(campaign)];

export const campaignStateColor = (campaign: Campaign): string =>
  STATE_COLORS[campaignDisplayState(campaign)];

/** Label for a bare stored status — the list's status filter chips. */
export const campaignStatusLabel = (status?: string): string =>
  (status && STATE_LABELS[status as CampaignDisplayState]) ??
  __('Draft', 'kelune-crm');

/** The switch reflects "dispatch permitted", which is exactly `active`. */
export const isCampaignActive = (campaign: Campaign): boolean =>
  campaign.status === CAMPAIGN_STATUS.ACTIVE;

/**
 * A sent campaign is terminal: its queue rows are unique per contact, so
 * re-activating it would reach nobody. Duplicating is the way to send again.
 */
export const canToggleCampaign = (campaign: Campaign): boolean =>
  campaign.status !== CAMPAIGN_STATUS.SENT;

/** Stored statuses, as the list's filter options. */
export const CAMPAIGN_STATUS_OPTIONS = [
  { value: CAMPAIGN_STATUS.DRAFT, label: STATE_LABELS.draft },
  { value: CAMPAIGN_STATUS.ACTIVE, label: __('Active', 'kelune-crm') },
  { value: CAMPAIGN_STATUS.PAUSED, label: STATE_LABELS.paused },
  { value: CAMPAIGN_STATUS.SENT, label: STATE_LABELS.sent },
];
