import React, { useEffect } from 'react';
import { __ } from '@wordpress/i18n';
import { Card, Row, Col, Statistic } from 'antd';
import { useDispatch, useSelector } from '@store/hooks';
import { fetchStats } from '../../store/slices/emailLogsSlice';
import type { EmailLogStats as EmailLogStatsData } from '@/types/models';

interface DateRange {
  date_from?: string;
  date_to?: string;
}

interface SummaryCard {
  key: string;
  title: string;
  value: (stats: EmailLogStatsData) => number;
  precision?: number;
  suffix?: string;
  color?: string;
  background: string;
  border: string;
}

// Summary band shown above the filter card. Soft tinted backgrounds (one hue
// per metric) mirror the Campaigns page card styling — small, no icons.
const SUMMARY_CARDS: SummaryCard[] = [
  {
    key: 'sent',
    title: __('Total Sent', 'kelune-crm'),
    value: (s) => Number(s.total_sent) || 0,
    background: 'linear-gradient(135deg, #eff6ff 0%, #f5f9ff 100%)',
    border: '#bae0ff',
  },
  {
    key: 'delivered',
    title: __('Delivered', 'kelune-crm'),
    value: (s) => Number(s.delivered_count) || 0,
    color: '#3f8600',
    background: 'linear-gradient(135deg, #f0fdf4 0%, #f6fdf9 100%)',
    border: '#b7eb8f',
  },
  {
    key: 'failed',
    title: __('Failed', 'kelune-crm'),
    value: (s) => Number(s.failed_count) || 0,
    color: '#cf1322',
    background: 'linear-gradient(135deg, #fff1f0 0%, #fff7f6 100%)',
    border: '#ffccc7',
  },
  {
    key: 'bounced',
    title: __('Bounced', 'kelune-crm'),
    value: (s) => Number(s.bounced_count) || 0,
    color: '#d46b08',
    background: 'linear-gradient(135deg, #fff7ed 0%, #fffaf5 100%)',
    border: '#ffd591',
  },
  {
    key: 'open',
    title: __('Open Rate', 'kelune-crm'),
    value: (s) => Number(s.open_rate) || 0,
    precision: 1,
    suffix: '%',
    color: '#722ed1',
    background: 'linear-gradient(135deg, #faf5ff 0%, #fbf8ff 100%)',
    border: '#d3adf7',
  },
  {
    key: 'click',
    title: __('Click Rate', 'kelune-crm'),
    value: (s) => Number(s.click_rate) || 0,
    precision: 1,
    suffix: '%',
    color: '#c41d7f',
    background: 'linear-gradient(135deg, #fff0f6 0%, #fff7fa 100%)',
    border: '#ffadd2',
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

  return (
    <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
      {SUMMARY_CARDS.map((card) => (
        <Col key={card.key} xs={24} sm={12} md={8} lg={4}>
          <Card
            size="small"
            variant="outlined"
            style={{
              background: card.background,
              height: '100%',
              border: `1px solid ${card.border}`,
              boxShadow: 'none',
            }}
          >
            <Statistic
              title={card.title}
              value={card.value(stats)}
              precision={card.precision}
              suffix={card.suffix}
              valueStyle={{ color: card.color }}
            />
          </Card>
        </Col>
      ))}
    </Row>
  );
};

export default EmailLogStats;
