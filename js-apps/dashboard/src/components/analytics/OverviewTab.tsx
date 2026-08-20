import React, { useEffect } from 'react';
import { __ } from '@wordpress/i18n';
import { Card, Row, Col } from 'antd';
import { Area, Line } from '@ant-design/charts';
import { useDispatch, useSelector } from '@store/hooks';
import { fetchOverview } from '../../store/slices/analyticsSlice';
import { CHART_COLORS, toEmailLong } from './chartUtils';
import StatGrid from './StatGrid';
import type { StatItem } from './StatGrid';

const OverviewTab: React.FC = () => {
  const dispatch = useDispatch();
  const { overview, loading } = useSelector((s) => s.analytics);
  const isLoading = loading.overview;

  useEffect(() => {
    if (!overview) {
      dispatch(fetchOverview());
    }
  }, [dispatch, overview]);

  const stats = overview?.stats;

  const tiles: StatItem[] = [
    {
      title: __('Total Contacts', 'kelune-crm'),
      value: stats?.totalContacts ?? 0,
      color: CHART_COLORS.primary,
    },
    {
      title: __('Campaigns', 'kelune-crm'),
      value: stats?.totalCampaigns ?? 0,
      color: CHART_COLORS.violet,
    },
    {
      title: __('Active Automations', 'kelune-crm'),
      value: stats?.activeAutomations ?? 0,
      color: CHART_COLORS.amber,
    },
    {
      title: __('Emails Sent', 'kelune-crm'),
      value: stats?.emailsSent ?? 0,
      color: CHART_COLORS.teal,
    },
    {
      title: __('Avg Open Rate', 'kelune-crm'),
      value: stats?.avgOpenRate ?? 0,
      suffix: '%',
      precision: 2,
      color: CHART_COLORS.green,
    },
    {
      title: __('Avg Click Rate', 'kelune-crm'),
      value: stats?.avgClickRate ?? 0,
      suffix: '%',
      precision: 2,
      color: CHART_COLORS.red,
    },
  ];

  return (
    <>
      <StatGrid items={tiles} loading={isLoading} />

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            size="small"
            title={__('Contact Growth (30 days)', 'kelune-crm')}
            loading={isLoading}
          >
            <Area
              data={overview?.contactsSeries ?? []}
              xField="date"
              yField="count"
              shapeField="smooth"
              height={280}
              style={{ fill: CHART_COLORS.primary, fillOpacity: 0.15 }}
              line={{ style: { stroke: CHART_COLORS.primary } }}
              axis={{ x: { title: false }, y: { title: false } }}
            />
          </Card>
        </Col>
        <Col xs={24}>
          <Card
            size="small"
            title={__('Email Engagement (30 days)', 'kelune-crm')}
            loading={isLoading}
          >
            <Line
              data={toEmailLong(overview?.emailSeries ?? [])}
              xField="date"
              yField="value"
              colorField="type"
              shapeField="smooth"
              height={280}
              scale={{ color: { range: CHART_COLORS.engagement } }}
              axis={{ x: { title: false }, y: { title: false } }}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default OverviewTab;
