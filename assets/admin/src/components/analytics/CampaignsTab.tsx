import React, { useEffect } from 'react';
import { __ } from '@wordpress/i18n';
import { Card, Row, Col, Table, Tag, Empty, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Column } from '@ant-design/charts';
import { useDispatch, useSelector } from '@store/hooks';
import { fetchCampaignsAnalytics } from '../../store/slices/analyticsSlice';
import { CHART_COLORS, barStyle } from './chartUtils';
import StatGrid from './StatGrid';
import type { StatItem } from './StatGrid';
import type { CampaignPerfRow } from '../../types/analytics';
import { timeFormat } from '../../utils/time';

const { Text } = Typography;

const CampaignsTab: React.FC = () => {
  const dispatch = useDispatch();
  const { campaigns, loading, range } = useSelector((s) => s.analytics);
  const isLoading = loading.campaigns;

  useEffect(() => {
    dispatch(fetchCampaignsAnalytics(range));
  }, [dispatch, range]);

  const summary = campaigns?.summary;

  const tiles: StatItem[] = [
    {
      title: __('Total Campaigns', 'kelune-crm'),
      value: summary?.total_campaigns ?? 0,
      color: CHART_COLORS.primary,
    },
    {
      title: __('Active', 'kelune-crm'),
      value: summary?.active_campaigns ?? 0,
      color: CHART_COLORS.teal,
    },
    {
      title: __('Scheduled', 'kelune-crm'),
      value: summary?.scheduled_campaigns ?? 0,
      color: CHART_COLORS.violet,
    },
    {
      title: __('Avg Open Rate', 'kelune-crm'),
      value: summary?.avg_open_rate ?? 0,
      suffix: '%',
      precision: 2,
      color: CHART_COLORS.green,
    },
    {
      title: __('Avg Click Rate', 'kelune-crm'),
      value: summary?.avg_click_rate ?? 0,
      suffix: '%',
      precision: 2,
      color: CHART_COLORS.amber,
    },
  ];

  const columns: ColumnsType<CampaignPerfRow> = [
    {
      title: __('Campaign', 'kelune-crm'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: __('Sent', 'kelune-crm'),
      dataIndex: 'sent_at',
      key: 'sent_at',
      render: (sentAt: string | null) =>
        sentAt ? timeFormat(sentAt, 'date') : '—',
    },
    {
      title: __('Recipients', 'kelune-crm'),
      dataIndex: 'total_sent',
      key: 'total_sent',
      align: 'right',
      sorter: (a, b) => a.total_sent - b.total_sent,
    },
    {
      title: __('Open Rate', 'kelune-crm'),
      dataIndex: 'open_rate',
      key: 'open_rate',
      align: 'right',
      sorter: (a, b) => a.open_rate - b.open_rate,
      render: (rate: number) => (
        <Tag color={rate >= 20 ? 'green' : 'default'}>{rate.toFixed(2)}%</Tag>
      ),
    },
    {
      title: __('Click Rate', 'kelune-crm'),
      dataIndex: 'click_rate',
      key: 'click_rate',
      align: 'right',
      sorter: (a, b) => a.click_rate - b.click_rate,
      render: (rate: number) => (
        <Tag color={rate >= 3 ? 'blue' : 'default'}>{rate.toFixed(2)}%</Tag>
      ),
    },
  ];

  return (
    <>
      <StatGrid items={tiles} loading={isLoading} />

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            size="small"
            title={__('Top Campaigns by Open Rate', 'kelune-crm')}
            loading={isLoading}
          >
            {(campaigns?.top ?? []).length > 0 ? (
              <Column
                data={campaigns?.top ?? []}
                xField="name"
                yField="open_rate"
                height={300}
                style={barStyle(CHART_COLORS.green)}
                axis={{ x: { title: false }, y: { title: false } }}
              />
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
        <Col xs={24}>
          <Card
            size="small"
            title={__('Performance', 'kelune-crm')}
            loading={isLoading}
          >
            <Table<CampaignPerfRow>
              rowKey="id"
              size="small"
              columns={columns}
              dataSource={campaigns?.campaigns ?? []}
              pagination={{ pageSize: 10, hideOnSinglePage: true }}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
};

export default CampaignsTab;
