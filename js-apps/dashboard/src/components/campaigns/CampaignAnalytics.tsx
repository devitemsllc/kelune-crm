import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Tabs,
  Progress,
  Tag,
  Tooltip,
  Empty,
  Spin,
} from 'antd';
import {
  BarChartOutlined,
  GlobalOutlined,
  MobileOutlined,
  ClockCircleOutlined,
  LinkOutlined,
  InfoCircleOutlined,
  ExperimentOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import api from '../../services/api';
import StatGrid, { type StatItem } from '../analytics/StatGrid';
import { CHART_COLORS, ratePercent } from '../analytics/chartUtils';
import { timeDiff, timeFormat } from '../../utils/time';
import { campaignStateColor, campaignStateLabel } from './campaignStatus';
import { isProActive } from '../../hooks/useFeature';
import type { Campaign, CampaignAbTest, EmailProvider } from '@/types/models';

// Resolved sender the campaign will send with. Mirrors CampaignForm's review
// step: a mode title (Custom / provider name / Global Email) and the From line.
interface ResolvedSender {
  title: string;
  identity: string;
}

// Overall campaign figures returned by /campaigns/{id}/stats. All rates are
// server-computed percentages; counts are integers.
interface AnalyticsStats {
  total_sent?: number;
  delivered?: number;
  bounced?: number;
  open_rate?: number;
  click_rate?: number;
  unique_opens?: number;
  total_opens?: number;
  unique_clicks?: number;
  total_clicks?: number;
  bounce_rate?: number;
  unsubscribe_rate?: number;
  unsubscribes?: number;
}

interface GeoRow {
  country: string;
  sends: number;
  opens: number;
  clicks: number;
  open_rate: number;
  click_rate: number;
}

// Device/browser/OS data is only known for opened emails, so the backend
// reports engagement (opens/clicks) per label rather than send counts.
interface EngagementRow {
  label: string;
  opens: number;
  clicks: number;
  click_rate: number;
}

interface LinkRow {
  url: string;
  total_clicks: number;
}

interface CampaignAnalyticsProps {
  visible: boolean;
  onCancel: () => void;
  campaign: Campaign | null;
}

const CampaignAnalytics = ({
  visible,
  onCancel,
  campaign,
}: CampaignAnalyticsProps) => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [geoData, setGeoData] = useState<GeoRow[]>([]);
  const [deviceData, setDeviceData] = useState<EngagementRow[]>([]);
  const [browserData, setBrowserData] = useState<EngagementRow[]>([]);
  const [linkData, setLinkData] = useState<LinkRow[]>([]);
  const [abTest, setAbTest] = useState<CampaignAbTest | null>(null);
  // Needed to resolve the sender the same way CampaignForm's review step does:
  // provider-mode reads the provider record, global-mode reads Settings.
  const [providers, setProviders] = useState<EmailProvider[]>([]);
  const [globalSender, setGlobalSender] = useState<{
    from_name: string;
    from_email: string;
  }>({ from_name: '', from_email: '' });

  const loadAnalytics = useCallback(async () => {
    if (!campaign?.id) return;
    setLoading(true);
    try {
      const id = campaign.id;
      const [statsRes, geoRes, deviceRes, browserRes, linkRes] =
        await Promise.all([
          api.campaigns.getStats(id),
          api.campaigns.getAnalytics(id, 'geographic'),
          api.campaigns.getAnalytics(id, 'device'),
          api.campaigns.getAnalytics(id, 'browser'),
          api.campaigns.getAnalytics(id, 'links'),
        ]);

      setStats((statsRes.data as AnalyticsStats) ?? null);
      setGeoData((geoRes.data as GeoRow[]) ?? []);
      setDeviceData((deviceRes.data as EngagementRow[]) ?? []);
      setBrowserData((browserRes.data as EngagementRow[]) ?? []);
      setLinkData((linkRes.data as LinkRow[]) ?? []);

      // The A/B route belongs to Pro and is absent while the add-on is
      // inactive, so a refusal simply means no A/B tab.
      const abRes = isProActive()
        ? await api.campaigns.getAbTest(id).catch(() => null)
        : null;
      setAbTest(abRes?.data ?? null);

      // Sender lookups are best-effort — a failure just falls back to '-'.
      const [providersRes, settingsRes] = await Promise.allSettled([
        api.emailProviders.getAll(),
        api.settings.getAll(),
      ]);
      if (providersRes.status === 'fulfilled') {
        setProviders((providersRes.value.data as EmailProvider[]) ?? []);
      }
      if (settingsRes.status === 'fulfilled') {
        const s = (settingsRes.value.data ?? {}) as Record<string, unknown>;
        setGlobalSender({
          from_name: String(s.email_from_name ?? ''),
          from_email: String(s.email_from_email ?? ''),
        });
      }
    } catch (error) {
      console.error('Failed to load analytics', error);
    } finally {
      setLoading(false);
    }
  }, [campaign?.id]);

  useEffect(() => {
    if (visible && campaign?.id) {
      loadAnalytics();
    }
  }, [visible, campaign?.id, loadAnalytics]);

  const num = (v: number | undefined) => Number(v) || 0;

  const clickToOpen =
    stats && num(stats.unique_opens) > 0
      ? Number(
          ((num(stats.unique_clicks) / num(stats.unique_opens)) * 100).toFixed(
            2
          )
        )
      : 0;

  const geoColumns = [
    {
      title: __('Country', 'kelune-crm'),
      dataIndex: 'country',
      key: 'country',
      render: (text: string) => <Tag bordered={false}>{text}</Tag>,
    },
    {
      title: __('Sends', 'kelune-crm'),
      dataIndex: 'sends',
      key: 'sends',
      sorter: (a: GeoRow, b: GeoRow) => a.sends - b.sends,
    },
    {
      title: __('Opens', 'kelune-crm'),
      dataIndex: 'opens',
      key: 'opens',
      sorter: (a: GeoRow, b: GeoRow) => a.opens - b.opens,
    },
    {
      title: __('Clicks', 'kelune-crm'),
      dataIndex: 'clicks',
      key: 'clicks',
      sorter: (a: GeoRow, b: GeoRow) => a.clicks - b.clicks,
    },
    {
      title: __('Open Rate', 'kelune-crm'),
      dataIndex: 'open_rate',
      key: 'open_rate',
      render: (rate: number) => (
        <Progress percent={rate} size="small" format={ratePercent} />
      ),
      sorter: (a: GeoRow, b: GeoRow) => a.open_rate - b.open_rate,
    },
    {
      title: __('Click Rate', 'kelune-crm'),
      dataIndex: 'click_rate',
      key: 'click_rate',
      render: (rate: number) => (
        <Progress
          percent={rate}
          size="small"
          strokeColor={CHART_COLORS.green}
          format={ratePercent}
        />
      ),
      sorter: (a: GeoRow, b: GeoRow) => a.click_rate - b.click_rate,
    },
  ];

  const engagementColumns = (firstColTitle: string) => [
    {
      title: firstColTitle,
      dataIndex: 'label',
      key: 'label',
    },
    {
      title: __('Opens', 'kelune-crm'),
      dataIndex: 'opens',
      key: 'opens',
      sorter: (a: EngagementRow, b: EngagementRow) => a.opens - b.opens,
    },
    {
      title: __('Clicks', 'kelune-crm'),
      dataIndex: 'clicks',
      key: 'clicks',
      sorter: (a: EngagementRow, b: EngagementRow) => a.clicks - b.clicks,
    },
    {
      title: __('Click Rate', 'kelune-crm'),
      dataIndex: 'click_rate',
      key: 'click_rate',
      render: (rate: number) => (
        <Progress
          percent={rate}
          size="small"
          strokeColor={CHART_COLORS.green}
          format={ratePercent}
        />
      ),
      sorter: (a: EngagementRow, b: EngagementRow) =>
        a.click_rate - b.click_rate,
    },
  ];

  const deviceColumns = engagementColumns(__('Device Type', 'kelune-crm'));
  const browserColumns = engagementColumns(__('Browser', 'kelune-crm'));

  const linkColumns = [
    {
      title: __('Link URL', 'kelune-crm'),
      dataIndex: 'url',
      key: 'url',
      ellipsis: true,
      render: (url: string) => (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>
      ),
    },
    {
      title: __('Total Clicks', 'kelune-crm'),
      dataIndex: 'total_clicks',
      key: 'total_clicks',
      sorter: (a: LinkRow, b: LinkRow) => a.total_clicks - b.total_clicks,
    },
  ];

  // Plain KPI tiles (no tinted background) — same StatGrid used on the
  // Dashboard / Analytics pages; only the value takes a color.
  const renderOverview = () => {
    if (!stats) {
      return (
        <Empty description={__('No analytics data available', 'kelune-crm')} />
      );
    }

    const countTiles: StatItem[] = [
      {
        title: __('Total Sent', 'kelune-crm'),
        value: num(stats.total_sent),
        color: CHART_COLORS.primary,
      },
      {
        title: __('Delivered', 'kelune-crm'),
        value: num(stats.delivered),
        color: CHART_COLORS.green,
      },
      {
        title: __('Bounced', 'kelune-crm'),
        value: num(stats.bounced),
        color: CHART_COLORS.red,
      },
      {
        title: __('Unique Opens', 'kelune-crm'),
        value: num(stats.unique_opens),
        color: CHART_COLORS.violet,
      },
      {
        title: __('Unique Clicks', 'kelune-crm'),
        value: num(stats.unique_clicks),
        color: CHART_COLORS.teal,
      },
      {
        title: __('Unsubscribes', 'kelune-crm'),
        value: num(stats.unsubscribes),
        color: CHART_COLORS.amber,
      },
    ];

    const rateTiles: StatItem[] = [
      {
        title: __('Bounce Rate', 'kelune-crm'),
        value: num(stats.bounce_rate),
        precision: 2,
        suffix: '%',
        color: CHART_COLORS.red,
      },
      {
        title: __('Unsubscribe Rate', 'kelune-crm'),
        value: num(stats.unsubscribe_rate),
        precision: 2,
        suffix: '%',
        color: CHART_COLORS.amber,
      },
      {
        title: __('Click-to-Open Rate', 'kelune-crm'),
        value: clickToOpen,
        precision: 2,
        suffix: '%',
        color: CHART_COLORS.primary,
      },
    ];

    return (
      <>
        <StatGrid items={countTiles} />

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} md={12}>
            <Card title={__('Open Rate', 'kelune-crm')} size="small">
              <Progress
                percent={num(stats.open_rate)}
                strokeColor={CHART_COLORS.primary}
                format={ratePercent}
                style={{ marginBottom: 16 }}
              />
              <Row>
                <Col span={12}>
                  <Statistic
                    title={__('Unique Opens', 'kelune-crm')}
                    value={num(stats.unique_opens)}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={__('Total Opens', 'kelune-crm')}
                    value={num(stats.total_opens)}
                  />
                </Col>
              </Row>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title={__('Click Rate', 'kelune-crm')} size="small">
              <Progress
                percent={num(stats.click_rate)}
                strokeColor={CHART_COLORS.green}
                format={ratePercent}
                style={{ marginBottom: 16 }}
              />
              <Row>
                <Col span={12}>
                  <Statistic
                    title={__('Unique Clicks', 'kelune-crm')}
                    value={num(stats.unique_clicks)}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title={__('Total Clicks', 'kelune-crm')}
                    value={num(stats.total_clicks)}
                  />
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>

        <div style={{ marginTop: 16 }}>
          <StatGrid items={rateTiles} />
        </div>
      </>
    );
  };

  // Resolve the sender exactly like CampaignForm's review step: a custom From
  // wins, else an explicit provider, else the account-default Global Email.
  const resolveSender = (): ResolvedSender => {
    const identityLine = (name?: string, email?: string): string =>
      email ? `${name ? `${name} ` : ''}<${email}>` : '-';

    if (campaign?.from_email) {
      return {
        title: __('Custom sender', 'kelune-crm'),
        identity: identityLine(campaign.from_name, campaign.from_email),
      };
    }
    if (campaign?.email_provider_id != null) {
      const p = providers.find(
        (prov) => Number(prov.id) === Number(campaign.email_provider_id)
      );
      return {
        title: p
          ? `${p.name}${
              p.is_default ? ` ${__('(default)', 'kelune-crm')}` : ''
            }`
          : __('Selected provider', 'kelune-crm'),
        identity: p ? identityLine(p.sender_name, p.sender_email) : '-',
      };
    }
    return {
      title: __('Global Email (account default)', 'kelune-crm'),
      identity: identityLine(globalSender.from_name, globalSender.from_email),
    };
  };

  const renderCampaignInfo = () => {
    if (!campaign) return null;

    const sender = resolveSender();

    const dateCell = (value?: string) =>
      value ? (
        <Tooltip title={timeFormat(value)}>
          <span>{timeDiff(value)}</span>
        </Tooltip>
      ) : (
        '-'
      );

    const rows: Array<{
      label: string;
      value: React.ReactNode;
    }> = [
      {
        label: __('Status', 'kelune-crm'),
        value: campaign.status ? (
          <Tag bordered={false} color={campaignStateColor(campaign)}>
            {campaignStateLabel(campaign)}
          </Tag>
        ) : (
          '-'
        ),
      },
      {
        label: __('Campaign Name', 'kelune-crm'),
        value: campaign.name,
      },
      {
        label: __('Subject', 'kelune-crm'),
        value: campaign.subject || '-',
      },
      {
        label: __('Sender', 'kelune-crm'),
        value: (
          <>
            <div>{sender.title}</div>
            <div>{sender.identity}</div>
          </>
        ),
      },
      {
        label: __('Created', 'kelune-crm'),
        value: dateCell(campaign.created_at),
      },
    ];

    if (campaign.sent_at) {
      rows.push({
        label: __('Sent', 'kelune-crm'),
        value: dateCell(campaign.sent_at),
      });
    }
    if (campaign.preview_text) {
      rows.push({
        label: __('Preview Text', 'kelune-crm'),
        value: campaign.preview_text,
      });
    }

    return (
      <Card title={__('Campaign Details', 'kelune-crm')} size="small">
        <Row gutter={[16, 16]}>
          {rows.map((row) => (
            <Col key={row.label} span={24}>
              <div style={{ color: '#8c8c8c', fontSize: 12 }}>{row.label}</div>
              <div style={{ marginTop: 2 }}>{row.value}</div>
            </Col>
          ))}
        </Row>
      </Card>
    );
  };

  // Per-arm results for a split send: the campaign's own copy is the control,
  // and the decided winner is flagged wherever it landed.
  const renderAbTest = () => {
    if (!abTest) return null;

    const rows = [
      {
        key: 'control',
        label: __('Original (control)', 'kelune-crm'),
        variant_type: '-',
        sent_count: abTest.control.sent_count,
        open_count: abTest.control.open_count,
        click_count: abTest.control.click_count,
        open_rate: abTest.control.open_rate,
        click_rate: abTest.control.click_rate,
        is_winner: abTest.winner_variant_id === 0,
      },
      ...abTest.variants.map((variant) => ({
        key: String(variant.id),
        label: variant.variant_label ?? __('Variant', 'kelune-crm'),
        variant_type: variant.variant_type ?? '-',
        sent_count: Number(variant.sent_count) || 0,
        open_count: Number(variant.open_count) || 0,
        click_count: Number(variant.click_count) || 0,
        open_rate: Number(variant.open_rate) || 0,
        click_rate: Number(variant.click_rate) || 0,
        is_winner:
          Boolean(variant.is_winner) ||
          abTest.winner_variant_id === Number(variant.id),
      })),
    ];

    type AbRow = (typeof rows)[number];

    const columns = [
      {
        title: __('Version', 'kelune-crm'),
        dataIndex: 'label',
        key: 'label',
        render: (text: string, record: AbRow) => (
          <Tag bordered={false} color={record.is_winner ? 'gold' : undefined}>
            {record.is_winner ? (
              <>
                <TrophyOutlined /> {text}
              </>
            ) : (
              text
            )}
          </Tag>
        ),
      },
      {
        title: __('Type', 'kelune-crm'),
        dataIndex: 'variant_type',
        key: 'variant_type',
        render: (type: string) =>
          type === '-'
            ? '-'
            : type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      },
      {
        title: __('Sent', 'kelune-crm'),
        dataIndex: 'sent_count',
        key: 'sent_count',
      },
      {
        title: __('Opens', 'kelune-crm'),
        dataIndex: 'open_count',
        key: 'open_count',
      },
      {
        title: __('Clicks', 'kelune-crm'),
        dataIndex: 'click_count',
        key: 'click_count',
      },
      {
        title: __('Open Rate', 'kelune-crm'),
        dataIndex: 'open_rate',
        key: 'open_rate',
        render: (rate: number) => (
          <Progress percent={rate} size="small" format={ratePercent} />
        ),
      },
      {
        title: __('Click Rate', 'kelune-crm'),
        dataIndex: 'click_rate',
        key: 'click_rate',
        render: (rate: number) => (
          <Progress
            percent={rate}
            size="small"
            strokeColor={CHART_COLORS.green}
            format={ratePercent}
          />
        ),
      },
    ];

    const winnerNote =
      abTest.winner_variant_id === null
        ? __('The test is still running.', 'kelune-crm')
        : abTest.remainder_queued
          ? __(
              'The winner has been sent to the rest of the audience.',
              'kelune-crm'
            )
          : __(
              'A winner is set; the rest of the audience is queued next.',
              'kelune-crm'
            );

    return (
      <>
        <Table
          columns={columns}
          dataSource={rows}
          rowKey="key"
          size="small"
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
        <div style={{ marginTop: 12, color: '#8c8c8c', fontSize: 12 }}>
          {sprintf(
            /* translators: %1$d: test sample share, %2$s: metric deciding the winner */
            __('Sample %1$d%% of the audience, decided on %2$s.', 'kelune-crm'),
            abTest.sample_size,
            abTest.winner_metric === 'click_rate'
              ? __('click rate', 'kelune-crm')
              : __('open rate', 'kelune-crm')
          )}{' '}
          {winnerNote}
        </div>
      </>
    );
  };

  const tabItems = [
    {
      key: 'overview',
      label: (
        <>
          <BarChartOutlined /> {__('Overview', 'kelune-crm')}
        </>
      ),
      children: renderOverview(),
    },
    {
      key: 'geographic',
      label: (
        <>
          <GlobalOutlined /> {__('Geographic', 'kelune-crm')}
        </>
      ),
      children: (
        <Table
          columns={geoColumns}
          dataSource={geoData}
          rowKey="country"
          size="small"
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
        />
      ),
    },
    {
      key: 'device',
      label: (
        <>
          <MobileOutlined /> {__('Device', 'kelune-crm')}
        </>
      ),
      children: (
        <Table
          columns={deviceColumns}
          dataSource={deviceData}
          rowKey="label"
          size="small"
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
        />
      ),
    },
    {
      key: 'browser',
      label: (
        <>
          <ClockCircleOutlined /> {__('Browser', 'kelune-crm')}
        </>
      ),
      children: (
        <Table
          columns={browserColumns}
          dataSource={browserData}
          rowKey="label"
          size="small"
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
        />
      ),
    },
    {
      key: 'links',
      label: (
        <>
          <LinkOutlined /> {__('Link Performance', 'kelune-crm')}
        </>
      ),
      children: (
        <Table
          columns={linkColumns}
          dataSource={linkData}
          rowKey="url"
          size="small"
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          scroll={{ x: 'max-content' }}
        />
      ),
    },
    ...(abTest && abTest.enabled && abTest.variants.length > 0
      ? [
          {
            key: 'abtest',
            label: (
              <>
                <ExperimentOutlined /> {__('A/B Test', 'kelune-crm')}
              </>
            ),
            children: renderAbTest(),
          },
        ]
      : []),
    {
      key: 'info',
      label: (
        <>
          <InfoCircleOutlined /> {__('Campaign Info', 'kelune-crm')}
        </>
      ),
      children: renderCampaignInfo(),
    },
  ];

  return (
    <Modal
      destroyOnHidden
      centered
      title={sprintf(
        // translators: %s: campaign name
        __('Analytics: %s', 'kelune-crm'),
        campaign?.name ?? ''
      )}
      open={visible}
      onCancel={onCancel}
      width={1100}
      footer={null}
      styles={{ body: { padding: '8px 20px 20px 20px' } }}
    >
      <Spin spinning={loading} style={{ maxHeight: 'unset' }}>
        <Tabs defaultActiveKey="overview" items={tabItems} />
      </Spin>
    </Modal>
  );
};

export default CampaignAnalytics;
