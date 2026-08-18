import React, { useState, useEffect, useCallback } from 'react';
import {
  Drawer,
  Form,
  Input,
  Button,
  Space,
  Card,
  InputNumber,
  Select,
  Table,
  Tooltip,
  message,
  Progress,
  Tag,
  Radio,
  Alert,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  TrophyOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import api from '../../services/api';
import ActionConfirm from '../common/ActionConfirm';
import { CHART_COLORS } from '../analytics/chartUtils';
import type { Campaign, CampaignVariant, ID } from '@/types/models';

const { TextArea } = Input;
const { Option } = Select;

/**
 * A/B test variant row. Extends the persisted {@link CampaignVariant} model but
 * widens a few fields to match the REST payload (rates can arrive as strings and
 * `is_winner` as `0`/`1`).
 */
interface Variant extends Omit<
  CampaignVariant,
  'open_rate' | 'click_rate' | 'is_winner'
> {
  open_rate?: number | string;
  click_rate?: number | string;
  is_winner?: number | boolean;
}

interface ABTestConfigProps {
  visible: boolean;
  onCancel: () => void;
  campaign: Campaign | null;
}

const ABTestConfig = ({ visible, onCancel, campaign }: ABTestConfigProps) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [variantFormVisible, setVariantFormVisible] = useState(false);

  const loadVariants = useCallback(async () => {
    if (!campaign) return;
    try {
      const response = await api.get<Variant[]>(
        `/campaigns/${campaign.id}/variants`
      );
      setVariants(response.data || []);
    } catch (error) {
      console.error('Failed to load variants', error);
    }
  }, [campaign]);

  useEffect(() => {
    if (visible && campaign?.id) {
      loadVariants();
      form.setFieldsValue({
        ab_testing_enabled: campaign.ab_testing_enabled || false,
        ab_test_winner_metric: campaign.ab_test_winner_metric || 'open_rate',
        ab_test_sample_size: campaign.ab_test_sample_size || 50,
      });
    }
  }, [visible, campaign, form, loadVariants]);

  const handleSaveSettings = async (values: Record<string, unknown>) => {
    try {
      setLoading(true);
      if (!campaign) return;

      await api.put(`/campaigns/${campaign.id}`, {
        ab_testing_enabled: values.ab_testing_enabled,
        ab_test_winner_metric: values.ab_test_winner_metric,
        ab_test_sample_size: values.ab_test_sample_size,
      });

      message.success(__('A/B testing settings saved', 'kelune-crm'));
      onCancel();
    } catch (error) {
      message.error(__('Failed to save settings', 'kelune-crm'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVariant = () => {
    setEditingVariant(null);
    setVariantFormVisible(true);
  };

  const handleEditVariant = (variant: Variant) => {
    setEditingVariant(variant);
    setVariantFormVisible(true);
  };

  const handleDeleteVariant = async (variantId: ID) => {
    if (!campaign) return;
    try {
      await api.delete(`/campaigns/${campaign.id}/variants/${variantId}`);
      message.success(__('Variant deleted', 'kelune-crm'));
      loadVariants();
    } catch (error) {
      message.error(__('Failed to delete variant', 'kelune-crm'));
    }
  };

  const handleDetermineWinner = async () => {
    try {
      setLoading(true);
      if (!campaign) return;
      const metric = form.getFieldValue('ab_test_winner_metric');
      await api.post(`/campaigns/${campaign.id}/variants/winner`, { metric });
      message.success(__('Winner determined successfully', 'kelune-crm'));
      loadVariants();
    } catch (error) {
      message.error(__('Failed to determine winner', 'kelune-crm'));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: __('Variant', 'kelune-crm'),
      dataIndex: 'variant_label',
      key: 'variant_label',
      render: (text: string, record: Variant) => (
        <Space>
          {text}
          {record.is_winner == 1 && (
            <Tag color="gold" icon={<TrophyOutlined />}>
              {__('Winner', 'kelune-crm')}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: __('Type', 'kelune-crm'),
      dataIndex: 'variant_type',
      key: 'variant_type',
      width: 100,
      render: (type: string) =>
        type
          ? type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
          : '',
    },
    {
      title: __('Subject', 'kelune-crm'),
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true,
    },
    {
      title: __('Test %', 'kelune-crm'),
      dataIndex: 'test_percentage',
      key: 'test_percentage',
      width: 80,
      render: (pct: number) => `${pct}%`,
    },
    {
      title: __('Sent', 'kelune-crm'),
      dataIndex: 'sent_count',
      key: 'sent_count',
      width: 80,
    },
    {
      title: __('Open Rate', 'kelune-crm'),
      dataIndex: 'open_rate',
      key: 'open_rate',
      width: 120,
      render: (rate: number | string) => (
        <Progress percent={parseFloat(String(rate || 0))} size="small" />
      ),
    },
    {
      title: __('Click Rate', 'kelune-crm'),
      dataIndex: 'click_rate',
      key: 'click_rate',
      width: 120,
      render: (rate: number | string) => (
        <Progress
          percent={parseFloat(String(rate || 0))}
          size="small"
          strokeColor={CHART_COLORS.green}
        />
      ),
    },
    {
      title: __('Actions', 'kelune-crm'),
      key: 'actions',
      width: 100,
      align: 'right' as const,
      render: (_: unknown, record: Variant) => (
        <Space>
          <Tooltip title={__('Edit', 'kelune-crm')}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEditVariant(record)}
            />
          </Tooltip>
          <ActionConfirm
            action="delete"
            onConfirm={() => handleDeleteVariant(record.id)}
          >
            <Tooltip title={__('Delete', 'kelune-crm')}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </ActionConfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Drawer
        destroyOnHidden
        placement="right"
        title={
          <Space>
            <ExperimentOutlined />
            {__('A/B Testing Configuration', 'kelune-crm')}
          </Space>
        }
        open={visible}
        onClose={onCancel}
        width={900}
        footer={
          <Space>
            <Button
              type="primary"
              onClick={() => form.submit()}
              loading={loading}
            >
              {__('Save Settings', 'kelune-crm')}
            </Button>
            <Button onClick={onCancel}>{__('Cancel', 'kelune-crm')}</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSaveSettings}>
          <Alert
            message={__(
              'A/B Testing allows you to test different variations of your email to see which performs best',
              'kelune-crm'
            )}
            type="info"
            style={{ marginBottom: 16, border: 'none' }}
          />

          <Card
            title={__('Settings', 'kelune-crm')}
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Form.Item
              name="ab_testing_enabled"
              label={__('Enable A/B Testing', 'kelune-crm')}
              valuePropName="checked"
            >
              <Radio.Group>
                <Radio value={true}>{__('Enabled', 'kelune-crm')}</Radio>
                <Radio value={false}>{__('Disabled', 'kelune-crm')}</Radio>
              </Radio.Group>
            </Form.Item>

            <Form.Item
              name="ab_test_winner_metric"
              label={__('Winner Selection Metric', 'kelune-crm')}
              tooltip={__(
                'Which metric should determine the winning variant',
                'kelune-crm'
              )}
            >
              <Select>
                <Option value="open_rate">
                  {__('Open Rate', 'kelune-crm')}
                </Option>
                <Option value="click_rate">
                  {__('Click Rate', 'kelune-crm')}
                </Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="ab_test_sample_size"
              label={__('Test Sample Size (%)', 'kelune-crm')}
              tooltip={__(
                'Percentage of recipients to include in the A/B test (remaining will receive the winning variant)',
                'kelune-crm'
              )}
              style={{ marginBottom: 0 }}
            >
              <InputNumber min={10} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </Card>

          <Card
            title={__('Variants', 'kelune-crm')}
            size="small"
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleCreateVariant}
              >
                {__('Add Variant', 'kelune-crm')}
              </Button>
            }
          >
            <Table
              columns={columns}
              dataSource={variants}
              rowKey="id"
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
            />

            {variants.length > 0 && (
              <div style={{ marginTop: 16, textAlign: 'left' }}>
                <Button
                  type="dashed"
                  icon={<TrophyOutlined />}
                  onClick={handleDetermineWinner}
                  loading={loading}
                >
                  {__('Determine Winner', 'kelune-crm')}
                </Button>
              </div>
            )}
          </Card>
        </Form>
      </Drawer>

      <VariantFormDrawer
        visible={variantFormVisible}
        onCancel={() => setVariantFormVisible(false)}
        campaignId={campaign?.id}
        variant={editingVariant}
        onSuccess={() => {
          setVariantFormVisible(false);
          loadVariants();
        }}
      />
    </>
  );
};

interface VariantFormDrawerProps {
  visible: boolean;
  onCancel: () => void;
  campaignId?: ID;
  variant: Variant | null;
  onSuccess: () => void;
}

const VariantFormDrawer = ({
  visible,
  onCancel,
  campaignId,
  variant,
  onSuccess,
}: VariantFormDrawerProps) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      if (variant) {
        form.setFieldsValue(variant);
      } else {
        form.resetFields();
      }
    }
  }, [visible, variant, form]);

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      setLoading(true);

      if (variant) {
        await api.put(
          `/campaigns/${campaignId}/variants/${variant.id}`,
          values
        );
        message.success(__('Variant updated', 'kelune-crm'));
      } else {
        await api.post(`/campaigns/${campaignId}/variants`, values);
        message.success(__('Variant created', 'kelune-crm'));
      }

      onSuccess();
    } catch (error) {
      message.error(__('Failed to save variant', 'kelune-crm'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer
      destroyOnHidden
      placement="right"
      width={500}
      title={
        variant
          ? __('Edit Variant', 'kelune-crm')
          : __('Create Variant', 'kelune-crm')
      }
      open={visible}
      onClose={onCancel}
      footer={
        <Space>
          <Button
            type="primary"
            onClick={() => form.submit()}
            loading={loading}
          >
            {variant ? __('Update', 'kelune-crm') : __('Create', 'kelune-crm')}
          </Button>
          <Button onClick={onCancel}>{__('Cancel', 'kelune-crm')}</Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="variant_label"
          label={__('Variant Label', 'kelune-crm')}
          rules={[
            {
              required: true,
              message: __('Please enter a variant label', 'kelune-crm'),
            },
          ]}
        >
          <Input placeholder={__('e.g., Variant A, Version 1', 'kelune-crm')} />
        </Form.Item>

        <Form.Item
          name="variant_type"
          label={__('Test Type', 'kelune-crm')}
          initialValue="subject"
          rules={[{ required: true }]}
        >
          <Select>
            <Option value="subject">{__('Subject Line', 'kelune-crm')}</Option>
            <Option value="content">{__('Email Content', 'kelune-crm')}</Option>
            <Option value="from_name">{__('From Name', 'kelune-crm')}</Option>
            <Option value="full">
              {__('Full Email (Subject + Content)', 'kelune-crm')}
            </Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="test_percentage"
          label={__('Test Percentage', 'kelune-crm')}
          initialValue={50}
          tooltip={__(
            'Percentage of test sample to send this variant',
            'kelune-crm'
          )}
          rules={[{ required: true }]}
        >
          <InputNumber min={1} max={100} style={{ width: '100%' }} />
        </Form.Item>

        <Form.Item
          name="subject"
          label={__('Subject Line', 'kelune-crm')}
          rules={[
            {
              required: true,
              message: __('Please enter a subject', 'kelune-crm'),
            },
          ]}
        >
          <Input placeholder={__('Email subject', 'kelune-crm')} />
        </Form.Item>

        <Form.Item name="from_name" label={__('From Name', 'kelune-crm')}>
          <Input placeholder={__('Override from name', 'kelune-crm')} />
        </Form.Item>

        <Form.Item
          name="email_content"
          label={__('Email Content', 'kelune-crm')}
          tooltip={__(
            'Optional: Override email content for this variant',
            'kelune-crm'
          )}
        >
          <TextArea
            rows={6}
            placeholder={__(
              'HTML email content (leave empty to use campaign default)',
              'kelune-crm'
            )}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
};

export default ABTestConfig;
