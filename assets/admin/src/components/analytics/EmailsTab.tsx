import React, { useEffect } from 'react';
import { __ } from '@wordpress/i18n';
import { Card, Row, Col } from 'antd';
import { Line } from '@ant-design/charts';
import { useDispatch, useSelector } from '@store/hooks';
import { fetchEmailsAnalytics } from '../../store/slices/analyticsSlice';
import { CHART_COLORS, toEmailLong } from './chartUtils';
import StatGrid from './StatGrid';
import type { StatItem } from './StatGrid';

const EmailsTab: React.FC = () => {
  const dispatch = useDispatch();
  const { emails, loading, range } = useSelector((s) => s.analytics);
  const isLoading = loading.emails;

  useEffect(() => {
    dispatch(fetchEmailsAnalytics(range));
  }, [dispatch, range]);

  const perf = emails?.performance;

  const tiles: StatItem[] = [
    {
      title: __('Sent', 'kelune-crm'),
      value: perf?.total_sent ?? 0,
      color: CHART_COLORS.primary,
    },
    {
      title: __('Delivered', 'kelune-crm'),
      value: perf?.delivered ?? 0,
      color: CHART_COLORS.teal,
    },
    {
      title: __('Opened', 'kelune-crm'),
      value: perf?.opened ?? 0,
      color: CHART_COLORS.green,
    },
    {
      title: __('Clicked', 'kelune-crm'),
      value: perf?.clicked ?? 0,
      color: CHART_COLORS.amber,
    },
    {
      title: __('Bounced', 'kelune-crm'),
      value: perf?.bounced ?? 0,
      color: CHART_COLORS.red,
    },
  ];

  const rates: StatItem[] = [
    {
      title: __('Delivery Rate', 'kelune-crm'),
      value: perf?.delivery_rate ?? 0,
      suffix: '%',
      precision: 2,
      color: CHART_COLORS.teal,
    },
    {
      title: __('Open Rate', 'kelune-crm'),
      value: perf?.open_rate ?? 0,
      suffix: '%',
      precision: 2,
      color: CHART_COLORS.green,
    },
    {
      title: __('Click Rate', 'kelune-crm'),
      value: perf?.click_rate ?? 0,
      suffix: '%',
      precision: 2,
      color: CHART_COLORS.amber,
    },
    {
      title: __('Bounce Rate', 'kelune-crm'),
      value: perf?.bounce_rate ?? 0,
      suffix: '%',
      precision: 2,
      color: CHART_COLORS.red,
    },
  ];

  return (
    <>
      <StatGrid items={tiles} loading={isLoading} />

      <div style={{ marginTop: 16 }}>
        <StatGrid items={rates} loading={isLoading} />
      </div>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            size="small"
            title={__('Engagement Over Time', 'kelune-crm')}
            loading={isLoading}
          >
            <Line
              data={toEmailLong(emails?.series ?? [])}
              xField="date"
              yField="value"
              colorField="type"
              shapeField="smooth"
              height={320}
              scale={{ color: { range: CHART_COLORS.engagement } }}
              axis={{ x: { title: false }, y: { title: false } }}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default EmailsTab;
