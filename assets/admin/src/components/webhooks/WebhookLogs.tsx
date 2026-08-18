import React, { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from '@store/hooks';
import {
  Modal,
  Table,
  Tag,
  Typography,
  Space,
  Collapse,
  Alert,
  Button,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import { fetchWebhookLogs, clearLogs } from '../../store/slices/webhooksSlice';
import { ListTableFooter } from '../common/list';
import { timeDiff, timeFormat } from '../../utils/time';
import type { Webhook, WebhookLog } from '@/types/models';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;
const { Panel } = Collapse;

interface WebhookLogsProps {
  visible: boolean;
  onCancel: () => void;
  webhook: Webhook | null;
}

const WebhookLogs = ({ visible, onCancel, webhook }: WebhookLogsProps) => {
  const dispatch = useDispatch();
  const { logs, loading, logsPagination } = useSelector(
    (state) => state.webhooks
  );

  const loadLogs = useCallback(
    (params: Record<string, unknown> = {}) => {
      if (webhook) {
        dispatch(
          fetchWebhookLogs({
            id: webhook.id,
            params: {
              page: logsPagination.page,
              per_page: logsPagination.per_page,
              ...params,
            },
          })
        );
      }
    },
    [webhook, logsPagination.page, logsPagination.per_page, dispatch]
  );

  useEffect(() => {
    if (visible && webhook) {
      loadLogs();
    }

    return () => {
      if (!visible) {
        dispatch(clearLogs());
      }
    };
  }, [visible, webhook, loadLogs, dispatch]);

  const handleRefresh = () => {
    loadLogs();
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'success';
    if (status >= 400 && status < 500) return 'warning';
    if (status >= 500) return 'error';
    return 'default';
  };

  const columns: ColumnsType<WebhookLog> = [
    {
      title: __('Timestamp', 'kelune-crm'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date) =>
        date ? (
          <Tooltip title={timeFormat(date)}>
            <span>{timeDiff(date)}</span>
          </Tooltip>
        ) : (
          '-'
        ),
    },
    {
      title: __('Method', 'kelune-crm'),
      dataIndex: 'request_method',
      key: 'request_method',
      width: 80,
      render: (method) => <Tag>{method}</Tag>,
    },
    {
      title: __('Status', 'kelune-crm'),
      dataIndex: 'response_status',
      key: 'response_status',
      width: 100,
      render: (status) => (
        <Tag
          color={getStatusColor(status)}
          icon={
            status >= 200 && status < 300 ? (
              <CheckCircleOutlined />
            ) : (
              <CloseCircleOutlined />
            )
          }
        >
          {status}
        </Tag>
      ),
    },
    {
      title: __('IP Address', 'kelune-crm'),
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 150,
      render: (ip) => <Text code>{ip}</Text>,
    },
    {
      title: __('Time', 'kelune-crm'),
      dataIndex: 'processing_time',
      key: 'processing_time',
      width: 120,
      render: (time) => `${time}ms`,
    },
    {
      title: __('Details', 'kelune-crm'),
      key: 'details',
      render: (_, record) => (
        <Collapse ghost size="small">
          <Panel header={__('View Details', 'kelune-crm')} key="1">
            <Space direction="vertical" style={{ width: '100%' }}>
              {record.error_message && (
                <Alert
                  message={sprintf(
                    // translators: %s: error message
                    __('Error: %s', 'kelune-crm'),
                    record.error_message
                  )}
                  type="error"
                  style={{ border: 'none' }}
                />
              )}

              <div>
                <Text strong>{__('Request URL:', 'kelune-crm')}</Text>
                <div>
                  <Text code>{record.request_url}</Text>
                </div>
              </div>

              {Boolean(record.request_payload) && (
                <div>
                  <Text strong>{__('Request Payload:', 'kelune-crm')}</Text>
                  <pre
                    style={{
                      background: '#f5f5f5',
                      padding: '12px',
                      borderRadius: '4px',
                      overflow: 'auto',
                      maxHeight: '200px',
                    }}
                  >
                    {JSON.stringify(record.request_payload, null, 2)}
                  </pre>
                </div>
              )}

              {Boolean(record.request_headers) && (
                <div>
                  <Text strong>{__('Request Headers:', 'kelune-crm')}</Text>
                  <pre
                    style={{
                      background: '#f5f5f5',
                      padding: '12px',
                      borderRadius: '4px',
                      overflow: 'auto',
                      maxHeight: '150px',
                    }}
                  >
                    {JSON.stringify(record.request_headers, null, 2)}
                  </pre>
                </div>
              )}

              {Boolean(record.response_body) && (
                <div>
                  <Text strong>{__('Response:', 'kelune-crm')}</Text>
                  <pre
                    style={{
                      background: '#f5f5f5',
                      padding: '12px',
                      borderRadius: '4px',
                      overflow: 'auto',
                      maxHeight: '200px',
                    }}
                  >
                    {JSON.stringify(record.response_body, null, 2)}
                  </pre>
                </div>
              )}
            </Space>
          </Panel>
        </Collapse>
      ),
    },
  ];

  return (
    <Modal
      destroyOnHidden
      centered
      title={__('Webhook Logs', 'kelune-crm')}
      open={visible}
      onCancel={onCancel}
      width={1000}
      footer={null}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Text style={{ fontSize: 15, fontWeight: 500 }}>
          {webhook?.webhook_name ?? ''}
        </Text>
        <Tooltip title={__('Reload', 'kelune-crm')}>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
          />
        </Tooltip>
      </div>

      <Table
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={false}
        footer={() => (
          <ListTableFooter
            page={logsPagination.page}
            perPage={logsPagination.per_page}
            total={logsPagination.total}
            onChange={(nextPage, nextSize) =>
              loadLogs({ page: nextPage, per_page: nextSize })
            }
          />
        )}
      />

      <div style={{ marginTop: 24, textAlign: 'left' }}>
        <Button onClick={onCancel}>{__('Close', 'kelune-crm')}</Button>
      </div>
    </Modal>
  );
};

export default WebhookLogs;
