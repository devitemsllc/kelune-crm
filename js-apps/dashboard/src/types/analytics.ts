// Analytics domain types — mirror the /analytics/* REST payloads.

import type { ContactStatus } from './models';

interface CountPoint {
  date: string;
  count: number;
}

export interface EmailPoint {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
}

interface StatusSlice {
  status: string;
  count: number;
}

interface NamedCount {
  name: string;
  count: number;
}

interface OverviewStats {
  totalContacts: number;
  totalCampaigns: number;
  activeAutomations: number;
  emailsSent: number;
  avgOpenRate: number;
  avgClickRate: number;
}

export interface OverviewData {
  stats: OverviewStats;
  contactsSeries: CountPoint[];
  emailSeries: EmailPoint[];
}

export interface ContactsAnalytics {
  bucket: string;
  total: number;
  series: CountPoint[];
  byStatus: StatusSlice[];
  topTags: NamedCount[];
  topLists: NamedCount[];
  topCountries: NamedCount[];
}

export interface EmailPerformance {
  total_sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
}

export interface EmailsAnalytics {
  bucket: string;
  series: EmailPoint[];
  performance: EmailPerformance;
}

interface CampaignSummary {
  total_campaigns: number;
  active_campaigns: number;
  scheduled_campaigns: number;
  avg_open_rate: number;
  avg_click_rate: number;
}

export interface CampaignPerfRow {
  id: number;
  name: string;
  status: string;
  sent_at: string | null;
  total_sent: number;
  unique_opens: number;
  unique_clicks: number;
  open_rate: number;
  click_rate: number;
}

export interface CampaignsAnalytics {
  summary: CampaignSummary;
  campaigns: CampaignPerfRow[];
  top: CampaignPerfRow[];
}

/** Shared date-range filter (YYYY-MM-DD), sent as query params. */
export interface AnalyticsRange {
  date_from: string;
  date_to: string;
}

export interface DashboardContact {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  status: ContactStatus;
  created_at: string;
  /**
   * Resolved server-side (see Services/AvatarService): stored avatar, else a
   * Gravatar while `use_gravatar_service` is on, else '' (render initials).
   */
  avatar_url?: string;
}

export interface DashboardAutomation {
  id: number;
  name: string;
  status: string;
  trigger_type: string;
}

interface OnboardingFlags {
  hasTags: boolean;
  hasContacts: boolean;
  hasCampaigns: boolean;
  hasAutomations: boolean;
  hasTemplates: boolean;
}

export interface HomeData {
  stats: OverviewStats;
  recentContacts: DashboardContact[];
  recentCampaigns: CampaignPerfRow[];
  activeAutomations: DashboardAutomation[];
  onboarding: OnboardingFlags;
}
