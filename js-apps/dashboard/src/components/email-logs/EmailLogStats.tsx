import React, { useEffect } from 'react';
import { __ } from '@wordpress/i18n';
import { useDispatch, useSelector } from '@store/hooks';
import { fetchStats } from '../../store/slices/emailLogsSlice';
import type { EmailLogStats as EmailLogStatsData } from '@/types/models';
import StatGrid, { type StatItem } from '../analytics/StatGrid';
import { tintedCardStyle, type InfoCardTint } from '@/utils/infoCardTints';

interface DateRange {
  date_from?: string;
  date_to?: string;
}

interface SummaryCard {
  title: string;
  value: (stats: EmailLogStatsData) => number;
  precision?: number;
  suffix?: string;
  color?: string;
  tint: InfoCardTint;
}

// Summary band shown above the filter card.
const SUMMARY_CARDS: SummaryCard[] = [
  {
    title: __('Total Sent', 'kelune-crm'),
    value: (s) => Number(s.total_sent) || 0,
    tint: 'blue',
  },
  {
    title: __('Delivered', 'kelune-crm'),
    value: (s) => Number(s.delivered_count) || 0,
    color: '#3f8600',
    tint: 'green',
  },
  {
    title: __('Failed', 'kelune-crm'),
    value: (s) => Number(s.failed_count) || 0,
    color: '#cf1322',
    tint: 'red',
  },
  {
    title: __('Bounced', 'kelune-crm'),
    value: (s) => Number(s.bounced_count) || 0,
    color: '#d46b08',
    tint: 'orange',
  },
  {
    title: __('Complaints', 'kelune-crm'),
    value: (s) => Number(s.complained_count) || 0,
    color: '#d4380d',
    tint: 'volcano',
  },
  {
    title: __('Delivery Rate', 'kelune-crm'),
    value: (s) => Number(s.delivery_rate) || 0,
    precision: 1,
    suffix: '%',
    color: '#08979c',
    tint: 'cyan',
  },
  {
    title: __('Open Rate', 'kelune-crm'),
    value: (s) => Number(s.open_rate) || 0,
    precision: 1,
    suffix: '%',
    color: '#722ed1',
    tint: 'purple',
  },
  {
    title: __('Click Rate', 'kelune-crm'),
    value: (s) => Number(s.click_rate) || 0,
    precision: 1,
    suffix: '%',
    color: '#c41d7f',
    tint: 'magenta',
  },
];

const EmailLogStats = ({ dateRange = {} }: { dateRange?: DateRange }) => {
  const dispatch = useDispatch();
  const { stats } = useSelector((state) => state.emailLogs);

  useEffect(() => {
    // Fetch stats on mount and when date range changes.
    const params: Record<string, unknown> = {};
    if (dateRange.date_from) {
      params.date_from = dateRange.date_from;
    }
    if (dateRange.date_to) {
      params.date_to = dateRange.date_to;
    }

    dispatch(fetchStats(params));

    // Auto-refresh every 60 seconds.
    const interval = setInterval(() => {
      dispatch(fetchStats(params));
    }, 60000);

    return () => clearInterval(interval);
  }, [dispatch, dateRange.date_from, dateRange.date_to]);

  const items: StatItem[] = SUMMARY_CARDS.map((card) => ({
    title: card.title,
    value: card.value(stats),
    precision: card.precision,
    suffix: card.suffix,
    color: card.color,
    style: tintedCardStyle(card.tint),
  }));

  return (
    <div style={{ marginBottom: 16 }}>
      <StatGrid items={items} columns={8} />
    </div>
  );
};

export default EmailLogStats;
