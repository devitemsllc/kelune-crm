import React, { useCallback, useEffect, useState } from 'react';
import { Card, Row, Col, Progress, Table, Tag, Spin } from 'antd';
import { __, sprintf } from '@wordpress/i18n';
import api from '../../services/api';
import StatGrid, { type StatItem } from '../analytics/StatGrid';
import { CHART_COLORS } from '../analytics/chartUtils';

interface AutomationStatsProps {
  automationId?: number | string;
}

interface AutomationStatsData {
  total_enrolled?: number;
  active_contacts?: number;
  completed_contacts?: number;
  exited_contacts?: number;
  completion_rate?: number;
  total_actions?: number;
  successful_actions?: number;
  failed_actions?: number;
  avg_execution_time?: number | string;
}

const AutomationStats = ({ automationId }: AutomationStatsProps) => {
  const [stats, setStats] = useState<AutomationStatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!automationId) return;
    try {
      setLoading(true);
      const response = await api.automations.getStats(automationId);
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  }, [automationId]);

  useEffect(() => {
    if (automationId) {
      fetchStats();
    }
  }, [automationId, fetchStats]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin style={{ maxHeight: 'unset' }} />
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        {__('No statistics available', 'kelune-crm')}
      </div>
    );
  }

  const performanceColumns = [
    {
      title: __('Metric', 'kelune-crm'),
      dataIndex: 'metric',
      key: 'metric',
    },
    {
      title: __('Value', 'kelune-crm'),
      dataIndex: 'value',
      key: 'value',
      align: 'right' as const,
    },
  ];

  const performanceData = [
    {
      key: '1',
      metric: __('Total Actions Executed', 'kelune-crm'),
      value: stats.total_actions || 0,
    },
    {
      key: '2',
      metric: __('Successful Actions', 'kelune-crm'),
      value: stats.successful_actions || 0,
    },
    {
      key: '3',
      metric: __('Failed Actions', 'kelune-crm'),
      value: stats.failed_actions || 0,
    },
    {
      key: '4',
      metric: __('Average Execution Time', 'kelune-crm'),
      value: `${stats.avg_execution_time || 0}ms`,
    },
  ];

  // Plain KPI tiles (no tinted background) — same StatGrid used on the
  // Dashboard / Analytics pages; only the value takes a color.
  const keyMetrics: StatItem[] = [
    {
      title: __('Total Enrolled', 'kelune-crm'),
      value: stats.total_enrolled || 0,
      color: CHART_COLORS.primary,
    },
    {
      title: __('Active Contacts', 'kelune-crm'),
      value: stats.active_contacts || 0,
      color: CHART_COLORS.violet,
    },
    {
      title: __('Completed', 'kelune-crm'),
      value: stats.completed_contacts || 0,
      color: CHART_COLORS.green,
    },
    {
      title: __('Exited', 'kelune-crm'),
      value: stats.exited_contacts || 0,
      color: CHART_COLORS.red,
    },
  ];

  return (
    <div>
      {/* Key Metrics */}
      <div style={{ marginBottom: 24 }}>
        <StatGrid items={keyMetrics} />
      </div>

      {/* Completion Rate */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={12}>
          <Card
            title={__('Completion Rate', 'kelune-crm')}
            size="small"
            styles={{ body: { textAlign: 'center' } }}
          >
            <Progress
              type="dashboard"
              percent={stats.completion_rate || 0}
              format={(percent) => `${percent}%`}
            />
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Tag color="blue">
                {sprintf(
                  // translators: %1$d: number of completed contacts, %2$d: total enrolled contacts
                  __('%1$d of %2$d completed', 'kelune-crm'),
                  stats.completed_contacts || 0,
                  stats.total_enrolled || 0
                )}
              </Tag>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title={__('Active Rate', 'kelune-crm')}
            size="small"
            styles={{ body: { textAlign: 'center' } }}
          >
            <Progress
              type="dashboard"
              percent={
                stats.total_enrolled && stats.total_enrolled > 0
                  ? Number(
                      (
                        ((stats.active_contacts || 0) / stats.total_enrolled) *
                        100
                      ).toFixed(2)
                    )
                  : 0
              }
              format={(percent) => `${percent}%`}
              strokeColor={CHART_COLORS.primary}
            />
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Tag color="processing">
                {sprintf(
                  // translators: %d: number of currently active contacts
                  __('%d currently active', 'kelune-crm'),
                  stats.active_contacts || 0
                )}
              </Tag>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Performance Metrics */}
      <Card title={__('Performance Metrics', 'kelune-crm')} size="small">
        <Table
          columns={performanceColumns}
          dataSource={performanceData}
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </div>
  );
};

export default AutomationStats;
