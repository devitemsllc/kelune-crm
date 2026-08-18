/**
 * Shared domain model types.
 */

import type { CSSProperties } from 'react';

export type ID = number;

/**
 * Contact lifecycle status. Mirrors Models\Contact::STATUSES on the PHP side,
 * which the REST layer validates against — keep the two in step.
 *
 * `active` is the only mailable one (CampaignRepository::getRecipientIds).
 * `unsubscribed` is set by the unsubscribe link or by hand; `bounced` is
 * system-set only. Labels, colours and the badge live in
 * components/contacts/contactStatus.
 */
export type ContactStatus = 'active' | 'pending' | 'unsubscribed' | 'bounced';

/**
 * Strict entity base: `tsc` validates field access against the declared shape,
 * with no `[key: string]: unknown` escape hatch.
 */
interface StrictBase {
  id: ID;
  created_at?: string;
  updated_at?: string;
  created_by?: ID;
}

export interface Contact extends StrictBase {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postal_code?: string;
  timezone?: string;
  /** See components/contacts/contactStatus for the vocabulary and its labels. */
  status?: ContactStatus;
  source?: string;
  lead_score?: number;
  custom_fields?: Record<string, unknown>;
  /**
   * The contact's avatar, resolved server-side (see Services/AvatarService):
   * their stored avatar, else a Gravatar while the use_gravatar_service setting
   * is on, else '' (render initials). Resolved on the contact list; the raw
   * column comes through unresolved on GET single / create / update, which have
   * no avatar surface today.
   */
  avatar_url?: string;
  /** Present on GET list and GET single. */
  tags?: Tag[];
  lists?: ContactList[];
  /** Present on GET single only. */
  notes?: Note[];
  /**
   * NOT part of the single-contact payload — events live at
   * GET /contacts/{id}/events and are fetched separately by the detail view.
   */
  events?: ContactEvent[];
}

/** Contact note row (GET /contacts/{id}/notes, embedded on single contact). */
export interface Note extends StrictBase {
  contact_id?: ID;
  content?: string;
}

/** Contact activity/event row (GET /contacts/{id}/events), from the events table. */
export interface ContactEvent extends StrictBase {
  contact_id?: ID;
  event_type?: string;
  event_category?: string;
  event_label?: string;
  event_value?: string;
  event_data?: Record<string, unknown> | null;
}

/** Campaign stats payload — numeric fields often arrive as strings from PHP. */
export interface CampaignStats {
  total_sent?: number | string;
  delivered?: number | string;
  bounced?: number | string;
  unique_opens?: number | string;
  total_opens?: number | string;
  unique_clicks?: number | string;
  total_clicks?: number | string;
  unsubscribes?: number | string;
  open_rate?: number | string;
  click_rate?: number | string;
  bounce_rate?: number | string;
  unsubscribe_rate?: number | string;
}

/**
 * GET /email-logs/stats payload. Contract returns counts as strings and NO
 * rate fields; rates and breakdowns are computed/merged client-side. All
 * optional, numerics widened to number|string.
 */
export interface EmailLogStats {
  total_sent?: number | string;
  delivered_count?: number | string;
  failed_count?: number | string;
  bounced_count?: number | string;
  opened_count?: number | string;
  clicked_count?: number | string;
  total_opens?: number | string;
  total_clicks?: number | string;
  open_rate?: number | string;
  click_rate?: number | string;
  bounce_rate?: number | string;
  by_type?: Record<string, unknown>;
  by_provider?: Record<string, unknown>;
  by_day?: unknown[];
}

/** Webhook delivery/request log row (GET /webhooks/{id}/logs). */
export interface WebhookLog extends StrictBase {
  webhook_id?: ID;
  request_method?: string;
  response_status?: number;
  ip_address?: string;
  processing_time?: number;
  error_message?: string;
  request_url?: string;
  request_payload?: unknown;
  request_headers?: unknown;
  response_body?: unknown;
}

/** GET /automations/stats/summary payload. Numeric fields may arrive as strings. */
export interface AutomationSummaryStats {
  total_automations?: number | string;
  active_automations?: number | string;
  total_enrolled?: number | string;
  avg_completion_rate?: number | string;
}

/** GET /campaigns/stats/summary payload. Numeric fields may arrive as strings. */
export interface CampaignSummaryStats {
  total_campaigns?: number | string;
  active_campaigns?: number | string;
  scheduled_campaigns?: number | string;
  avg_open_rate?: number | string;
  avg_click_rate?: number | string;
}

export interface Campaign extends StrictBase {
  name?: string;
  description?: string;
  subject?: string;
  campaign_type?: string;
  status?: string;
  preview_text?: string;
  email_content?: string;
  content_mode?: 'builder' | 'richtext';
  json_structure?: unknown;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  email_provider_id?: ID | null;
  template_id?: ID | null;
  target_segments?: ID[];
  target_lists?: ID[];
  target_tags?: ID[];
  exclude_segments?: ID[];
  exclude_lists?: ID[];
  exclude_tags?: ID[];
  settings?: Record<string, unknown>;
  stats?: CampaignStats;
  scheduled_at?: string | null;
  sent_at?: string | null;
  ab_testing_enabled?: boolean;
  ab_test_winner_metric?: string;
  ab_test_sample_size?: number;
}

export interface Automation extends StrictBase {
  name?: string;
  description?: string;
  status?: string;
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  entry_conditions?: unknown;
  settings?: Record<string, unknown>;
  stats?: Record<string, unknown>;
  total_enrolled?: number;
  active_contacts?: number;
  completed_contacts?: number;
  conversion_rate?: number;
  last_triggered_at?: string | null;
}

export interface Segment extends StrictBase {
  name?: string;
  description?: string;
  type?: string;
  match_type?: string;
  conditions?: unknown;
  contact_count?: number;
  last_calculated?: string | null;
  cache_enabled?: boolean;
  auto_refresh?: boolean;
}

export interface Tag extends StrictBase {
  name?: string;
  slug?: string;
  description?: string;
  color?: string;
  contact_count?: number;
}

export interface ContactList extends StrictBase {
  name?: string;
  slug?: string;
  description?: string;
  status?: string;
  type?: string;
  contact_count?: number;
}

export interface EmailTemplate extends StrictBase {
  name?: string;
  description?: string;
  template_type?: string;
  html_content?: string;
  json_structure?: unknown;
  thumbnail_url?: string;
  is_favorite?: boolean | number;
  usage_count?: number;
  last_used_at?: string | null;
}

/** A single column entry inside a columns-type email block. */
interface EmailBlockColumn {
  /** Nested blocks rendered inside this column. */
  blocks?: EmailBlock[];
  /** @deprecated legacy single-HTML-string column content. */
  content?: string;
  [key: string]: unknown;
}

/** Style/content properties for an email template block. */
export interface EmailBlockStyles {
  content?: string;
  /** Raw author HTML for the `html` block (sanitized server-side via wp_kses_post). */
  html?: string;
  fontSize?: string;
  color?: string;
  fontWeight?: string;
  textAlign?: CSSProperties['textAlign'];
  fontFamily?: string;
  lineHeight?: string;
  padding?: string;
  margin?: string;
  /** Per-cell padding for a columns block (distinct from outer `padding`). */
  cellPadding?: string;
  blockBackground?: string;
  buttonPadding?: string;
  src?: string;
  alt?: string;
  link?: string;
  width?: string;
  height?: string;
  text?: string;
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: string;
  borderStyle?: CSSProperties['borderStyle'];
  borderColor?: string;
  borderWidth?: string;
  columnCount?: number;
  gap?: string;
  columns?: EmailBlockColumn[];
  [key: string]: unknown;
}

/** A block within the email template builder's JSON structure. */
export interface EmailBlock {
  id: string;
  type: string;
  content?: string;
  styles?: EmailBlockStyles;
  [key: string]: unknown;
}

export interface EmailLog extends StrictBase {
  email_type?: string;
  campaign_id?: ID | null;
  automation_id?: ID | null;
  contact_id?: ID | null;
  email_to?: string;
  email_from?: string;
  subject?: string;
  body_html?: string;
  body_text?: string;
  status?: string;
  provider?: string;
  tracking_token?: string;
  error_message?: string;
  metadata?: unknown;
  queued_at?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  bounced_at?: string | null;
  opened_at?: string | null;
  clicked_at?: string | null;
  open_count?: number;
  click_count?: number;
}

export interface CampaignVariant extends StrictBase {
  campaign_id?: ID;
  variant_type?: string;
  variant_label?: string;
  test_percentage?: number;
  subject?: string;
  email_content?: string;
  from_name?: string;
  sent_count?: number;
  open_count?: number;
  click_count?: number;
  open_rate?: number;
  click_rate?: number;
  is_winner?: boolean;
}

export interface AutomationStep extends StrictBase {
  automation_id?: ID;
  step_order?: number;
  step_type?: string;
  parent_step_id?: ID | null;
  branch_type?: string | null;
  action_type?: string | null;
  action_config?: unknown;
  condition_type?: string | null;
  condition_config?: unknown;
  delay_type?: string | null;
  delay_value?: number | string | null;
  position_x?: number;
  position_y?: number;
}

export interface SmartLink extends StrictBase {
  name?: string;
  description?: string;
  link_type?: string;
  /** Original/destination URL. */
  redirect_url?: string;
  original_url?: string;
  redirect_type?: string;
  tracking_code?: string;
  /** Public tracking URL (`home_url('/?cmsl='+code)`). */
  tracking_url?: string;
  add_tags?: ID[];
  remove_tags?: ID[];
  add_lists?: ID[];
  remove_lists?: ID[];
  trigger_automations?: ID[];
  total_clicks?: number;
  unique_clicks?: number;
  last_clicked_at?: string | null;
  status?: string;
  expires_at?: string | null;
  settings?: unknown;
}

/** Supported email provider connection types. */
export type EmailProviderType = 'smtp' | 'ses' | 'mailgun' | 'sendgrid';

/**
 * An email sending connection bound to a specific sender address. Credentials
 * are provider-specific (loosely typed); stored secrets arrive masked as the
 * `__secret_unchanged__` sentinel and are sent back unchanged.
 */
export interface EmailProvider extends StrictBase {
  name?: string;
  provider_type?: EmailProviderType;
  sender_name?: string;
  sender_email?: string;
  reply_to?: string;
  region?: string;
  credentials?: Record<string, string | number>;
  settings?: Record<string, unknown>;
  verified_senders?: string[];
  // Sender emails an admin manually registered on this connection (SES only).
  manual_senders?: string[];
  // Union of bound + verified + manual senders this connection may send as.
  allowed_senders?: string[];
  is_default?: boolean;
  status?: 'active' | 'inactive';
}

export interface Webhook extends StrictBase {
  webhook_name?: string;
  webhook_key?: string;
  description?: string;
  default_lists?: ID[];
  default_tags?: ID[];
  allowed_actions?: string[];
  status?: string;
  ip_whitelist?: string | null;
  total_requests?: number;
  last_used_at?: string | null;
}

/**
 * Body-nested list payload (post-unwrap `response.data`) for endpoints that put
 * pagination inside `data`: Campaigns, Automations(list/steps), SmartLinks,
 * Webhooks. Items live under `data`.
 */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages?: number;
}

/**
 * Body-nested list payload variant that uses `items` instead of `data`:
 * EmailLogs and EmailTemplates lists.
 */
export interface PaginatedItems<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages?: number;
}

/**
 * Cron Monitor (Settings → Cron Monitor), served by ToolsController.
 *
 * New contract, so these are strict — no index signature. Mirrors
 * Services\CronMonitorService::getEvents()/getServerInfo().
 */
type CronEventStatus = 'scheduled' | 'overdue' | 'not_scheduled';

export interface CronEvent {
  hook: string;
  label: string;
  description: string;
  status: CronEventStatus;
  /** Unix timestamp; null when nothing is scheduled for this hook. */
  next_run: number | null;
  /** Pre-formatted by PHP's human_time_diff; null when not scheduled. */
  next_run_relative: string | null;
  /** Recurrence in seconds; null when the schedule slug is unknown. */
  interval: number | null;
  interval_label: string | null;
}

interface CronServerInfo {
  /** null when PHP's memory_limit is -1 (unlimited) or unreadable. */
  memory_limit_bytes: number | null;
  memory_limit: string;
  memory_usage_bytes: number;
  memory_usage: string;
  /** null when there is no finite limit to measure against. */
  memory_usage_percent: number | null;
  /** Seconds; 0 means unlimited, null means unreadable. */
  max_execution_time: number | null;
  has_server_cron: boolean;
  has_alternate_cron: boolean;
}

export interface CronStatus {
  events: CronEvent[];
  server: CronServerInfo;
}
