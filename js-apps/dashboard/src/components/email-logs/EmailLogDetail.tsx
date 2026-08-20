import React, { useState } from 'react';
import {
  Drawer,
  Descriptions,
  Tag,
  Button,
  Timeline,
  Empty,
  Divider,
  Typography,
  message,
  Tabs,
} from 'antd';
import { SendOutlined, EyeOutlined, LinkOutlined } from '@ant-design/icons';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import { resendEmail } from '../../store/slices/emailLogsSlice';
import { timeFormat } from '../../utils/time';
import EmailPreviewFrame from '../common/EmailPreviewFrame';
import type { EmailLog } from '@/types/models';

const { TabPane } = Tabs;
const { Paragraph, Text } = Typography;

interface EmailLogDetailProps {
  visible: boolean;
  log: EmailLog | null;
  onClose: () => void;
  onResent?: () => void;
}

const ucFirst = (value?: string): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : '';

const getStatusColor = (status?: string): string => {
  if (!status) return 'default';
  const colors: Record<string, string> = {
    queued: 'default',
    sending: 'processing',
    sent: 'blue',
    delivered: 'cyan',
    opened: 'purple',
    clicked: 'magenta',
    failed: 'red',
    bounced: 'orange',
  };
  return colors[status] || 'default';
};

const getEmailTypeColor = (type?: string): string => {
  if (!type) return 'default';
  const colors: Record<string, string> = {
    campaign: 'blue',
    automation: 'purple',
    test: 'orange',
    transactional: 'green',
  };
  return colors[type] || 'default';
};

// Metadata is stored as a (sometimes double-encoded) JSON string. Decode until
// we reach a real object/value, then pretty-print — so the panel shows clean
// JSON instead of a wall of escaped backslashes and quotes.
const formatMetadata = (metadata: unknown): string => {
  let value = metadata;
  for (let i = 0; i < 5 && typeof value === 'string'; i += 1) {
    try {
      value = JSON.parse(value);
    } catch {
      break;
    }
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

/**
 * Rich detail view for a single email log, shown in a wide Drawer (listing-page
 * standard for detail surfaces). Tabs cover the record, its status timeline and
 * an HTML preview; Resend lives in the Drawer `extra` cluster.
 */
const EmailLogDetail = ({
  visible,
  log,
  onClose,
  onResent,
}: EmailLogDetailProps) => {
  const dispatch = useDispatch();
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    if (!log) return;
    try {
      setResending(true);
      await dispatch(resendEmail(log.id)).unwrap();
      message.success(__('Email resent successfully', 'kelune-crm'));
      if (onResent) onResent();
    } catch (error) {
      message.error(__('Failed to resend email', 'kelune-crm'));
    } finally {
      setResending(false);
    }
  };

  // Build a chronological timeline from the log's status timestamps.
  const buildTimeline = () => {
    if (!log) return [];
    const events: {
      time: string;
      label: string;
      color: string;
      icon?: React.ReactNode;
    }[] = [];

    if (log.created_at) {
      events.push({
        time: log.created_at,
        label: __('Created', 'kelune-crm'),
        color: 'blue',
      });
    }
    if (log.sent_at) {
      events.push({
        time: log.sent_at,
        label: __('Sent', 'kelune-crm'),
        color: 'green',
      });
    }
    if (log.delivered_at) {
      events.push({
        time: log.delivered_at,
        label: __('Delivered', 'kelune-crm'),
        color: 'cyan',
      });
    }
    if (log.opened_at) {
      const openCount = log.open_count || 0;
      events.push({
        time: log.opened_at,
        label: sprintf(
          // translators: %d: number of times opened
          _n('Opened (%d time)', 'Opened (%d times)', openCount, 'kelune-crm'),
          openCount
        ),
        color: 'purple',
        icon: <EyeOutlined />,
      });
    }
    if (log.clicked_at) {
      const clickCount = log.click_count || 0;
      events.push({
        time: log.clicked_at,
        label: sprintf(
          // translators: %d: number of times clicked
          _n(
            'Clicked (%d time)',
            'Clicked (%d times)',
            clickCount,
            'kelune-crm'
          ),
          clickCount
        ),
        color: 'magenta',
        icon: <LinkOutlined />,
      });
    }
    if (log.bounced_at) {
      events.push({
        time: log.bounced_at,
        label: __('Bounced', 'kelune-crm'),
        color: 'orange',
      });
    }

    return events.sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
  };

  const timeline = buildTimeline();

  return (
    <Drawer
      destroyOnHidden
      width={720}
      open={visible}
      onClose={onClose}
      title={__('Email Log Details', 'kelune-crm')}
      styles={{ body: { padding: '8px 20px 20px 20px' } }}
      extra={
        log && (
          <Button
            type="primary"
            size="small"
            icon={<SendOutlined />}
            onClick={handleResend}
            loading={resending}
            disabled={log.status === 'queued' || log.status === 'sending'}
          >
            {__('Resend', 'kelune-crm')}
          </Button>
        )
      }
    >
      {log && (
        <Tabs defaultActiveKey="details">
          <TabPane tab={__('Details', 'kelune-crm')} key="details">
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label={__('ID', 'kelune-crm')}>
                {log.id}
              </Descriptions.Item>
              <Descriptions.Item label={__('Type', 'kelune-crm')}>
                <Tag bordered={false} color={getEmailTypeColor(log.email_type)}>
                  {ucFirst(log.email_type)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={__('Status', 'kelune-crm')}>
                <Tag bordered={false} color={getStatusColor(log.status)}>
                  {ucFirst(log.status)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label={__('Provider', 'kelune-crm')}>
                {log.provider ? (
                  <Tag bordered={false}>{log.provider}</Tag>
                ) : (
                  '-'
                )}
              </Descriptions.Item>
              <Descriptions.Item label={__('To', 'kelune-crm')}>
                {log.email_to || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('From', 'kelune-crm')}>
                {log.email_from || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Subject', 'kelune-crm')}>
                {log.subject || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Campaign ID', 'kelune-crm')}>
                {log.campaign_id || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Automation ID', 'kelune-crm')}>
                {log.automation_id || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Contact ID', 'kelune-crm')}>
                {log.contact_id || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Tracking Token', 'kelune-crm')}>
                {log.tracking_token || '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Opens', 'kelune-crm')}>
                {log.open_count || 0}
              </Descriptions.Item>
              <Descriptions.Item label={__('Clicks', 'kelune-crm')}>
                {log.click_count || 0}
              </Descriptions.Item>
              {log.error_message && (
                <Descriptions.Item label={__('Error', 'kelune-crm')}>
                  <Text type="danger">{log.error_message}</Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label={__('Queued At', 'kelune-crm')}>
                {log.queued_at ? timeFormat(log.queued_at) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Sent At', 'kelune-crm')}>
                {log.sent_at ? timeFormat(log.sent_at) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Delivered At', 'kelune-crm')}>
                {log.delivered_at ? timeFormat(log.delivered_at) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Opened At', 'kelune-crm')}>
                {log.opened_at ? timeFormat(log.opened_at) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Clicked At', 'kelune-crm')}>
                {log.clicked_at ? timeFormat(log.clicked_at) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Bounced At', 'kelune-crm')}>
                {log.bounced_at ? timeFormat(log.bounced_at) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Created At', 'kelune-crm')}>
                {log.created_at ? timeFormat(log.created_at) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Updated At', 'kelune-crm')}>
                {log.updated_at ? timeFormat(log.updated_at) : '-'}
              </Descriptions.Item>
            </Descriptions>

            {Boolean(log.metadata) && (
              <>
                <Divider orientation="left" orientationMargin="0">
                  {__('Metadata', 'kelune-crm')}
                </Divider>
                <Paragraph>
                  <pre
                    style={{
                      background: '#f5f5f5',
                      padding: 12,
                      borderRadius: 4,
                      fontSize: 12,
                      overflow: 'auto',
                      maxHeight: 200,
                    }}
                  >
                    {formatMetadata(log.metadata)}
                  </pre>
                </Paragraph>
              </>
            )}
          </TabPane>

          <TabPane tab={__('Timeline', 'kelune-crm')} key="timeline">
            {timeline.length > 0 ? (
              <Timeline>
                {timeline.map((event, index) => (
                  <Timeline.Item
                    key={index}
                    color={event.color}
                    dot={event.icon}
                  >
                    <strong>{event.label}</strong>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {timeFormat(event.time)}
                    </Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            ) : (
              <Empty description={__('No timeline events', 'kelune-crm')} />
            )}
          </TabPane>

          <TabPane tab={__('HTML Preview', 'kelune-crm')} key="preview">
            {log.body_html ? (
              <div
                style={{
                  border: '1px solid #d9d9d9',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <EmailPreviewFrame
                  html={log.body_html}
                  title={__('Email Preview', 'kelune-crm')}
                  maxHeight={400}
                  sandbox="allow-same-origin"
                />
              </div>
            ) : (
              <Empty
                description={__('No HTML content available', 'kelune-crm')}
              />
            )}
          </TabPane>
        </Tabs>
      )}
    </Drawer>
  );
};

export default EmailLogDetail;
