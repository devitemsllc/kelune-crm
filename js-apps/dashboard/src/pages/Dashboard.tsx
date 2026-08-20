import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Avatar,
  List,
  Badge,
  Button,
  Empty,
  Progress,
  Select,
  DatePicker,
  Space,
  Tooltip,
  Skeleton,
} from 'antd';
import type { BadgeProps } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import {
  UserOutlined,
  ThunderboltOutlined,
  MailOutlined,
  CheckCircleTwoTone,
  RightOutlined,
  EyeOutlined,
  AimOutlined,
} from '@ant-design/icons';
import { Line } from '@ant-design/charts';
import { Link, useNavigate } from 'react-router-dom';
import { __, sprintf } from '@wordpress/i18n';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { dateRangePresets } from '../utils/dateRangePresets';
import { timeFormat } from '../utils/time';
import api from '../services/api';
import { CHART_COLORS } from '../components/analytics/chartUtils';
import { contactStatusLabel } from '../components/contacts/contactStatus';
import ContactAvatar from '../components/common/ContactAvatar';
import type { ContactStatus } from '../types/models';
import StatGrid from '../components/analytics/StatGrid';
import type { StatItem } from '../components/analytics/StatGrid';
import type {
  HomeData,
  ContactsAnalytics,
  EmailsAnalytics,
  EmailPerformance,
  CampaignPerfRow,
  DashboardContact,
  DashboardAutomation,
} from '../types/analytics';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const greeting = (): string => {
  const h = dayjs().hour();
  if (h >= 5 && h < 12) return __('Good morning', 'kelune-crm');
  if (h >= 12 && h < 17) return __('Good afternoon', 'kelune-crm');
  return __('Good evening', 'kelune-crm');
};

// Badge tokens, not Tag colours — this is the one status surface that renders a
// <Badge>. Labels still come from contactStatus, so the vocabulary stays shared.
const STATUS_BADGE: Record<ContactStatus, BadgeProps['status']> = {
  active: 'success',
  pending: 'warning',
  unsubscribed: 'error',
  bounced: 'error',
};

type ChartMode = 'contacts' | 'sent' | 'opened' | 'clicked';

const CHART_MODES: { value: ChartMode; label: string; color: string }[] = [
  {
    value: 'contacts',
    label: __('Contact Growth', 'kelune-crm'),
    color: CHART_COLORS.primary,
  },
  {
    value: 'sent',
    label: __('Emails Sent', 'kelune-crm'),
    color: CHART_COLORS.violet,
  },
  {
    value: 'opened',
    label: __('Email Opens', 'kelune-crm'),
    color: CHART_COLORS.green,
  },
  {
    value: 'clicked',
    label: __('Email Clicks', 'kelune-crm'),
    color: CHART_COLORS.amber,
  },
];

const PERF_PERIODS = [
  { value: 30, label: __('Last 30 Days', 'kelune-crm') },
  { value: 60, label: __('Last 60 Days', 'kelune-crm') },
  { value: 90, label: __('Last 90 Days', 'kelune-crm') },
  { value: 0, label: __('All Time', 'kelune-crm') },
];

const PERF_BARS: {
  key: keyof EmailPerformance;
  label: string;
  color: string;
}[] = [
  {
    key: 'total_sent',
    label: __('Sent', 'kelune-crm'),
    color: CHART_COLORS.violet,
  },
  {
    key: 'delivered',
    label: __('Delivered', 'kelune-crm'),
    color: CHART_COLORS.teal,
  },
  {
    key: 'opened',
    label: __('Opened', 'kelune-crm'),
    color: CHART_COLORS.green,
  },
  {
    key: 'clicked',
    label: __('Clicked', 'kelune-crm'),
    color: CHART_COLORS.amber,
  },
  {
    key: 'bounced',
    label: __('Bounced', 'kelune-crm'),
    color: CHART_COLORS.red,
  },
];

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const userName = window.kelunecrm?.user?.name ?? '';
  const userAvatar = window.kelunecrm?.user?.avatar_url ?? null;

  const [home, setHome] = useState<HomeData | null>(null);
  const [homeLoading, setHomeLoading] = useState(true);

  const [chartMode, setChartMode] = useState<ChartMode>('contacts');
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(29, 'day'),
    dayjs(),
  ]);
  const [chartData, setChartData] = useState<{ date: string; value: number }[]>(
    []
  );
  const [chartLoading, setChartLoading] = useState(true);

  const [perfPeriod, setPerfPeriod] = useState(30);
  const [performance, setPerformance] = useState<EmailPerformance | null>(null);
  const [perfLoading, setPerfLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setHomeLoading(true);
    api.analytics
      .getHome()
      .then((res) => {
        if (active) setHome(res.data as HomeData);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setHomeLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadChart = useCallback(async () => {
    setChartLoading(true);
    const params = {
      date_from: range[0].format('YYYY-MM-DD'),
      date_to: range[1].format('YYYY-MM-DD'),
    };
    try {
      if (chartMode === 'contacts') {
        const res = await api.analytics.getContactsGrowth(params);
        const data = res.data as ContactsAnalytics;
        setChartData(
          data.series.map((p) => ({ date: p.date, value: p.count }))
        );
      } else {
        const res = await api.analytics.getEmailStats(params);
        const data = res.data as EmailsAnalytics;
        setChartData(
          data.series.map((p) => ({ date: p.date, value: p[chartMode] }))
        );
      }
    } catch {
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  }, [chartMode, range]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  useEffect(() => {
    let active = true;
    setPerfLoading(true);
    const params = {
      date_from:
        perfPeriod === 0
          ? '2000-01-01'
          : dayjs()
              .subtract(perfPeriod - 1, 'day')
              .format('YYYY-MM-DD'),
      date_to: dayjs().format('YYYY-MM-DD'),
    };
    api.analytics
      .getEmailStats(params)
      .then((res) => {
        if (active) setPerformance((res.data as EmailsAnalytics).performance);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setPerfLoading(false);
      });
    return () => {
      active = false;
    };
  }, [perfPeriod]);

  const stats = home?.stats;
  const activeChartColor =
    CHART_MODES.find((m) => m.value === chartMode)?.color ??
    CHART_COLORS.primary;

  const handleRangeChange: RangePickerProps['onChange'] = (dates) => {
    if (dates && dates[0] && dates[1]) {
      setRange([dates[0], dates[1]]);
    }
  };

  const kpis: StatItem[] = [
    {
      title: __('Total Contacts', 'kelune-crm'),
      value: stats?.totalContacts ?? 0,
      color: CHART_COLORS.primary,
      onClick: () => navigate('/contacts'),
    },
    {
      title: __('Campaigns', 'kelune-crm'),
      value: stats?.totalCampaigns ?? 0,
      color: CHART_COLORS.violet,
      onClick: () => navigate('/campaigns'),
    },
    {
      title: __('Emails Sent', 'kelune-crm'),
      value: stats?.emailsSent ?? 0,
      color: CHART_COLORS.teal,
      onClick: () => navigate('/email-logs'),
    },
    {
      title: __('Active Automations', 'kelune-crm'),
      value: stats?.activeAutomations ?? 0,
      color: CHART_COLORS.amber,
      onClick: () => navigate('/automations'),
    },
  ];

  const checklist = useMemo(() => {
    const ob = home?.onboarding;
    return [
      {
        done: !!ob?.hasTags,
        label: __('Create a tag', 'kelune-crm'),
        to: '/contacts/tags',
      },
      {
        done: !!ob?.hasContacts,
        label: __('Add your first contact', 'kelune-crm'),
        to: '/contacts',
      },
      {
        done: !!ob?.hasTemplates,
        label: __('Design an email template', 'kelune-crm'),
        to: '/email-templates',
      },
      {
        done: !!ob?.hasCampaigns,
        label: __('Send a campaign', 'kelune-crm'),
        to: '/campaigns',
      },
      {
        done: !!ob?.hasAutomations,
        label: __('Build an automation', 'kelune-crm'),
        to: '/automations',
      },
    ];
  }, [home]);

  const checklistDone = checklist.filter((c) => c.done).length;

  return (
    <div>
      <Space align="center" size={16} style={{ marginBottom: 24 }}>
        {/*
          The WP user's own avatar, supplied server-side via get_avatar_url().
          Not a contact, so use_gravatar_service does not apply — WordPress's own
          show_avatars governs it. Null means fall back to the icon.
        */}
        <Avatar
          size={48}
          src={userAvatar ?? undefined}
          icon={<UserOutlined />}
          style={{ flexShrink: 0 }}
        />
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {greeting()}
            {userName ? `, ${userName}` : ''} 👋
          </Title>
          <Text type="secondary">
            {__('Welcome to Kelune CRM', 'kelune-crm')}
          </Text>
        </div>
      </Space>

      {/* KPI row */}
      <StatGrid items={kpis} loading={homeLoading} />

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {/* LEFT COLUMN */}
        <Col xs={24} lg={16}>
          <Card
            size="small"
            title={
              <Select
                size="small"
                variant="borderless"
                value={chartMode}
                onChange={(v) => setChartMode(v)}
                options={CHART_MODES.map((m) => ({
                  value: m.value,
                  label: m.label,
                }))}
                style={{ minWidth: 160, fontWeight: 600 }}
              />
            }
            extra={
              <RangePicker
                size="small"
                allowClear={false}
                presets={dateRangePresets}
                value={range}
                onChange={handleRangeChange}
              />
            }
          >
            {chartLoading ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : (
              <Line
                data={chartData}
                xField="date"
                yField="value"
                shapeField="smooth"
                height={280}
                style={{ stroke: activeChartColor }}
                axis={{ x: { title: false }, y: { title: false } }}
              />
            )}
          </Card>

          <Card
            size="small"
            title={__('Recent Campaigns', 'kelune-crm')}
            style={{ marginTop: 16 }}
            styles={{ body: { padding: 0 } }}
            loading={homeLoading}
            extra={<Link to="/campaigns">{__('View All', 'kelune-crm')}</Link>}
          >
            {(home?.recentCampaigns ?? []).length > 0 ? (
              <List<CampaignPerfRow>
                dataSource={home?.recentCampaigns ?? []}
                rowKey="id"
                renderItem={(c) => (
                  <List.Item
                    style={{ padding: 12, marginBottom: 0 }}
                    actions={[
                      <Tooltip title={__('Sent', 'kelune-crm')} key="sent">
                        <span>
                          <MailOutlined /> {c.total_sent}
                        </span>
                      </Tooltip>,
                      <Tooltip title={__('Opens', 'kelune-crm')} key="opens">
                        <span>
                          <EyeOutlined /> {c.unique_opens}
                        </span>
                      </Tooltip>,
                      <Tooltip title={__('Clicks', 'kelune-crm')} key="clicks">
                        <span>
                          <AimOutlined /> {c.unique_clicks}
                        </span>
                      </Tooltip>,
                      <Text type="secondary" key="rate">
                        {sprintf(
                          /* translators: %s: email open rate percentage */
                          __('%s%% open', 'kelune-crm'),
                          c.open_rate.toFixed(1)
                        )}
                      </Text>,
                    ]}
                  >
                    <List.Item.Meta
                      title={<Text strong>{c.name}</Text>}
                      description={
                        c.sent_at ? timeFormat(c.sent_at, 'date') : '—'
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={__('No campaigns yet', 'kelune-crm')}
              >
                <Button type="primary" onClick={() => navigate('/campaigns')}>
                  {__('Create a Campaign', 'kelune-crm')}
                </Button>
              </Empty>
            )}
          </Card>

          <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
            <Col xs={24} md={12}>
              <Card
                size="small"
                title={__('Recent Contacts', 'kelune-crm')}
                loading={homeLoading}
                extra={
                  <Link to="/contacts">{__('View All', 'kelune-crm')}</Link>
                }
                style={{ height: '100%' }}
                styles={{ body: { padding: 0 } }}
              >
                {(home?.recentContacts ?? []).length > 0 ? (
                  <List<DashboardContact>
                    dataSource={home?.recentContacts ?? []}
                    rowKey="id"
                    renderItem={(c) => (
                      <List.Item style={{ padding: 12, marginBottom: 0 }}>
                        <List.Item.Meta
                          avatar={
                            <ContactAvatar
                              email={c.email}
                              first_name={c.first_name}
                              last_name={c.last_name}
                              avatar_url={c.avatar_url}
                            />
                          }
                          title={
                            `${c.first_name} ${c.last_name}`.trim() || c.email
                          }
                          description={c.email}
                        />
                        <Badge
                          status={c.status ? STATUS_BADGE[c.status] : 'default'}
                          text={contactStatusLabel(c.status) || '—'}
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={__('No contacts yet', 'kelune-crm')}
                  >
                    <Button
                      type="primary"
                      onClick={() => navigate('/contacts')}
                    >
                      {__('Add a Contact', 'kelune-crm')}
                    </Button>
                  </Empty>
                )}
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card
                size="small"
                title={__('Active Automations', 'kelune-crm')}
                loading={homeLoading}
                extra={
                  <Link to="/automations">{__('View All', 'kelune-crm')}</Link>
                }
                style={{ height: '100%' }}
                styles={{ body: { padding: 0 } }}
              >
                {(home?.activeAutomations ?? []).length > 0 ? (
                  <List<DashboardAutomation>
                    dataSource={home?.activeAutomations ?? []}
                    rowKey="id"
                    renderItem={(a) => (
                      <List.Item style={{ padding: 12, marginBottom: 0 }}>
                        <List.Item.Meta
                          avatar={
                            <Avatar
                              icon={<ThunderboltOutlined />}
                              style={{
                                background: '#fff7e6',
                                color: CHART_COLORS.amber,
                              }}
                            />
                          }
                          title={a.name}
                          description={
                            <Text type="secondary">
                              {a.trigger_type.replace(/_/g, ' ') || '—'}
                            </Text>
                          }
                        />
                      </List.Item>
                    )}
                  />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={__('No active automations', 'kelune-crm')}
                  >
                    <Button
                      type="primary"
                      onClick={() => navigate('/automations')}
                    >
                      {__('Create an Automation', 'kelune-crm')}
                    </Button>
                  </Empty>
                )}
              </Card>
            </Col>
          </Row>
        </Col>

        {/* RIGHT COLUMN */}
        <Col xs={24} lg={8}>
          <Card
            size="small"
            title={__('Getting Started', 'kelune-crm')}
            loading={homeLoading}
            styles={{ body: { padding: 0 } }}
            extra={
              <Text type="secondary">
                {sprintf(
                  /* translators: %1$d: number of completed steps, %2$d: total number of steps */
                  __('%1$d / %2$d done', 'kelune-crm'),
                  checklistDone,
                  checklist.length
                )}
              </Text>
            }
          >
            <List
              dataSource={checklist}
              rowKey="label"
              renderItem={(item) => (
                <List.Item
                  style={{
                    padding: 12,
                    marginBottom: 0,
                    cursor: item.done ? 'default' : 'pointer',
                  }}
                  onClick={() => !item.done && navigate(item.to)}
                >
                  <Space>
                    {item.done ? (
                      <CheckCircleTwoTone twoToneColor={CHART_COLORS.green} />
                    ) : (
                      <RightOutlined style={{ color: '#bfbfbf' }} />
                    )}
                    <Text
                      delete={item.done}
                      type={item.done ? 'secondary' : undefined}
                    >
                      {item.label}
                    </Text>
                  </Space>
                </List.Item>
              )}
            />
          </Card>

          <Card
            size="small"
            title={__('Email Performance', 'kelune-crm')}
            style={{ marginTop: 16 }}
            extra={
              <Select
                size="small"
                variant="borderless"
                value={perfPeriod}
                onChange={(v) => setPerfPeriod(v)}
                options={PERF_PERIODS}
                style={{ minWidth: 120 }}
              />
            }
          >
            {perfLoading ? (
              <Skeleton active paragraph={{ rows: 5 }} />
            ) : (
              <Space direction="vertical" size={14} style={{ width: '100%' }}>
                {PERF_BARS.map((bar) => {
                  const sent = performance?.total_sent ?? 0;
                  const value = Number(performance?.[bar.key] ?? 0);
                  const pct = sent > 0 ? Math.round((value / sent) * 100) : 0;
                  return (
                    <div key={bar.key}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                        }}
                      >
                        <Text>{bar.label}</Text>
                        <Text strong>{value.toLocaleString()}</Text>
                      </div>
                      <Progress
                        percent={pct}
                        strokeColor={bar.color}
                        showInfo={false}
                        size="small"
                      />
                    </div>
                  );
                })}
              </Space>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
