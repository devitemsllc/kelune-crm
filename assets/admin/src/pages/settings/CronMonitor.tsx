import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Flex,
  List,
  Row,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  PlayCircleOutlined,
  ReloadOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '@store/slices/globalLoadingSlice';
import SettingsSectionTitle from './SettingsSectionTitle';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import type { CronEvent, CronStatus } from '@/types/models';

const { Text } = Typography;

// Soft tinted info cards, one hue per metric — mirrors the Campaigns summary band.
const INFO_CARD_TINTS = {
  blue: {
    background: 'linear-gradient(135deg, #eff6ff 0%, #f5f9ff 100%)',
    border: '#bae0ff',
  },
  green: {
    background: 'linear-gradient(135deg, #f0fdf4 0%, #f6fdf9 100%)',
    border: '#b7eb8f',
  },
  orange: {
    background: 'linear-gradient(135deg, #fff7ed 0%, #fffaf5 100%)',
    border: '#ffd591',
  },
};

const STATUS_TAG: Record<CronEvent['status'], { color: string; text: string }> =
  {
    scheduled: {
      color: 'success',
      text: __('Scheduled', 'kelune-crm'),
    },
    overdue: { color: 'warning', text: __('Overdue', 'kelune-crm') },
    not_scheduled: {
      color: 'error',
      text: __('Not scheduled', 'kelune-crm'),
    },
  };

// What each status means for the row's timing line. `not_scheduled` is the one
// that needs spelling out: it is not lateness, it is an event that will never
// run until it is rescheduled (deactivating and reactivating the plugin does it).
const describeTiming = (event: CronEvent): string => {
  if (event.status === 'not_scheduled') {
    return __('This task is not scheduled and will not run.', 'kelune-crm');
  }

  if (event.status === 'overdue') {
    return sprintf(
      // translators: %s is a human-readable duration, e.g. "5 minutes".
      __('Overdue by %s — WP-Cron may not be running.', 'kelune-crm'),
      event.next_run_relative
    );
  }

  return sprintf(
    // translators: %s is a human-readable duration, e.g. "5 minutes".
    __('Next run in %s', 'kelune-crm'),
    event.next_run_relative
  );
};

const formatExecutionTime = (seconds: number | null): string => {
  if (seconds === null) {
    return __('Unknown', 'kelune-crm');
  }
  // PHP reports 0 for "no limit" (typical on CLI, and on some managed hosts).
  return seconds === 0
    ? __('Unlimited', 'kelune-crm')
    : sprintf(
        // translators: %d is a number of seconds.
        _n('%d second', '%d seconds', seconds, 'kelune-crm'),
        seconds
      );
};

// Self-contained diagnostics section: shows what the plugin's scheduled tasks
// are actually doing, because a stalled WP-Cron is the usual reason campaigns
// and automations appear stuck.
const CronMonitor = () => {
  const dispatch = useDispatch();
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tracks which hook is mid-run so only that row's button spins.
  const [runningHook, setRunningHook] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.tools.getCronStatus();
      setStatus(response.data);
    } catch (err) {
      setError(
        getErrorMessage(err, __('Failed to load cron status', 'kelune-crm'))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runNow = async (event: CronEvent) => {
    setRunningHook(event.hook);
    dispatch(startGlobalLoading());
    try {
      // The response carries a fresh read of every row. A manual run is
      // out-of-band and does not move the schedule, so this row's "Next Run"
      // stays put — the success toast is what confirms it ran.
      const response = await api.tools.runCron(event.hook);
      setStatus(response.data);
      message.success(
        sprintf(
          // translators: %s is the name of a scheduled task.
          __('%s ran successfully', 'kelune-crm'),
          event.label
        )
      );
    } catch (err) {
      message.error(
        getErrorMessage(
          err,
          sprintf(
            // translators: %s is the name of a scheduled task.
            __('Failed to run %s', 'kelune-crm'),
            event.label
          )
        )
      );
    } finally {
      dispatch(stopGlobalLoading());
      setRunningHook(null);
    }
  };

  const server = status?.server;

  return (
    <>
      <SettingsSectionTitle
        name={__('Cron Monitor', 'kelune-crm')}
        action={
          // Icon-only: the visible label is gone, so the button still needs an
          // accessible name and a hover hint to say what it does.
          <Tooltip title={__('Refresh', 'kelune-crm')}>
            <Button
              icon={<ReloadOutlined />}
              onClick={load}
              loading={loading}
              aria-label={__('Refresh', 'kelune-crm')}
            />
          </Tooltip>
        }
      />

      {error ? (
        <Alert
          type="error"
          message={sprintf(
            // translators: %s is the error message.
            __('Could not load cron status: %s', 'kelune-crm'),
            error
          )}
          style={{ marginBottom: 24, border: 'none' }}
        />
      ) : null}

      {/* Only meaningful once loaded: absent server info would otherwise read as
          "server cron is off" during the first fetch. */}
      {server && !server.has_server_cron ? (
        <Alert
          type="info"
          message={__(
            'WordPress runs scheduled tasks when someone visits your site, so on a quiet site emails can go out late. Enabling a server-side cron sends them on time.',
            'kelune-crm'
          )}
          // Alert has no `bordered` prop in antd 5.29 — `banner` would drop the
          // border but flattens the corners too, so the border is removed here.
          style={{ marginBottom: 24, border: 'none' }}
        />
      ) : null}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} xl={8}>
          <Card
            size="small"
            variant="outlined"
            loading={loading && !status}
            style={{
              background: INFO_CARD_TINTS.blue.background,
              height: '100%',
              border: `1px solid ${INFO_CARD_TINTS.blue.border}`,
              boxShadow: 'none',
            }}
          >
            <Statistic
              title={__('Memory Limit', 'kelune-crm')}
              value={server?.memory_limit ?? '—'}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <Card
            size="small"
            variant="outlined"
            loading={loading && !status}
            style={{
              background: INFO_CARD_TINTS.green.background,
              height: '100%',
              border: `1px solid ${INFO_CARD_TINTS.green.border}`,
              boxShadow: 'none',
            }}
          >
            <Statistic
              title={
                <Space size={4}>
                  <span>{__('Memory In Use', 'kelune-crm')}</span>
                  <Tooltip
                    title={__(
                      'Memory used while building this page. Campaign and automation batches run in their own requests, so their usage will differ.',
                      'kelune-crm'
                    )}
                  >
                    <QuestionCircleOutlined style={{ color: '#8c8c8c' }} />
                  </Tooltip>
                </Space>
              }
              value={server?.memory_usage ?? '—'}
              // Null when memory_limit is unlimited: there is no ceiling to take
              // a percentage of, so the suffix is simply absent.
              suffix={
                server && server.memory_usage_percent !== null
                  ? `(${server.memory_usage_percent}%)`
                  : undefined
              }
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <Card
            size="small"
            variant="outlined"
            loading={loading && !status}
            style={{
              background: INFO_CARD_TINTS.orange.background,
              height: '100%',
              border: `1px solid ${INFO_CARD_TINTS.orange.border}`,
              boxShadow: 'none',
            }}
          >
            <Statistic
              title={__('Max Execution Time', 'kelune-crm')}
              value={
                server ? formatExecutionTime(server.max_execution_time) : '—'
              }
            />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title={__('Scheduled Tasks', 'kelune-crm')}
        loading={loading && !status}
        // The list rows carry their own padding, so the card body must not add
        // a second inset around them.
        styles={{ body: { padding: 0 } }}
      >
        <List
          size="small"
          dataSource={status?.events ?? []}
          rowKey={(event) => event.hook}
          renderItem={(event) => (
            <List.Item
              style={{ padding: 12, margin: 0 }}
              actions={[
                <Button
                  key="run"
                  icon={<PlayCircleOutlined />}
                  loading={runningHook === event.hook}
                  // One task at a time: they contend for the same queues, and
                  // each already runs synchronously in its own request.
                  disabled={runningHook !== null && runningHook !== event.hook}
                  onClick={() => void runNow(event)}
                >
                  {__('Run Now', 'kelune-crm')}
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <Space size={8} wrap>
                    <span>
                      <Text strong>{event.label}</Text>
                      {/* Reads as one phrase — "Campaign Email Sending (Every
                          minute)" — so the recurrence sits inside the same
                          element rather than as a separate Space child. Absent
                          when the event is not scheduled and has no interval. */}
                      {event.interval_label ? (
                        <Text>{` (${event.interval_label})`}</Text>
                      ) : null}
                    </span>
                    <Tag color={STATUS_TAG[event.status].color}>
                      {STATUS_TAG[event.status].text}
                    </Tag>
                  </Space>
                }
                description={
                  <Flex vertical gap={2}>
                    <Text type="secondary">{event.description}</Text>
                    <Text
                      type={
                        event.status === 'scheduled' ? 'secondary' : 'danger'
                      }
                    >
                      {describeTiming(event)}
                    </Text>
                  </Flex>
                }
              />
            </List.Item>
          )}
        />
      </Card>
    </>
  );
};

export default CronMonitor;
