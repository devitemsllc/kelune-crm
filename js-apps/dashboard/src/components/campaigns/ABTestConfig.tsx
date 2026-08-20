import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Alert,
  Typography,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  TrophyOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import api from '../../services/api';
import ActionConfirm from '../common/ActionConfirm';
import EmailContentEditor from '../common/EmailContentEditor';
import InlineSwitch from '../common/InlineSwitch';
import ModalFooter from '../common/ModalFooter';
import SubmitOnEnter from '../common/SubmitOnEnter';
import { CHART_COLORS, ratePercent } from '../analytics/chartUtils';
import { audienceSplit } from './abTestSplit';
import { isProActive } from '../../hooks/useFeature';
import { timeFormat } from '../../utils/time';
import { getErrorMessage } from '@/utils/getErrorMessage';
import type {
  Campaign,
  CampaignAbTest,
  CampaignVariant,
  ID,
} from '@/types/models';

const { Option } = Select;
const { Text } = Typography;

/** The control's row id. The campaign itself is the control, and owns no row. */
const CONTROL_ID = 0;

/** Variant types whose copy replaces the campaign's body. */
const CONTENT_TYPES = ['content', 'full'];

/** Variant types whose copy replaces the campaign's subject. */
const SUBJECT_TYPES = ['subject', 'full'];

/** Hours a test runs for when the campaign names no wait of its own. */
const DEFAULT_WAIT_HOURS = 4;

/**
 * One line of the split table: the control, or a variant. Contacts is what this
 * arm would be sent right now, given the audience and the configured shares.
 */
interface SplitRow {
  key: string;
  id: ID;
  label: string;
  variant_type?: string;
  subject?: string;
  percentage: number;
  contacts: number;
  sent_count: number;
  open_rate: number;
  click_rate: number;
  is_winner: boolean;
  variant?: CampaignVariant;
}

interface ABTestConfigProps {
  visible: boolean;
  onCancel: () => void;
  campaign: Campaign | null;
}

const emptyTest = (campaign: Campaign | null): CampaignAbTest => ({
  enabled: Boolean(campaign?.ab_testing_enabled),
  sample_size: Number(campaign?.ab_test_sample_size) || 50,
  winner_metric: campaign?.ab_test_winner_metric || 'open_rate',
  winner_wait_hours: DEFAULT_WAIT_HOURS,
  winner_decision_at: null,
  editable: true,
  control: {
    percentage: 100,
    sent_count: 0,
    open_count: 0,
    click_count: 0,
    open_rate: 0,
    click_rate: 0,
  },
  variants: [],
  winner_variant_id: null,
  remainder_queued: false,
});

const ABTestConfig = ({ visible, onCancel, campaign }: ABTestConfigProps) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [test, setTest] = useState<CampaignAbTest | null>(null);
  const [audience, setAudience] = useState(0);
  const [editingVariant, setEditingVariant] = useState<CampaignVariant | null>(
    null
  );
  const [variantFormVisible, setVariantFormVisible] = useState(false);

  const sampleSize = Form.useWatch('ab_test_sample_size', form);
  const metric = Form.useWatch('ab_test_winner_metric', form);

  const variants = test?.variants ?? [];
  const editable = test?.editable ?? true;
  const winnerId = test?.winner_variant_id ?? null;

  // Seeding is for opening the drawer only. The refresh calls that follow a
  // variant change would otherwise throw away edits the user has made to these
  // fields and not yet saved.
  const load = useCallback(
    async (seedForm = false) => {
      if (!campaign?.id || !isProActive()) return;

      // The A/B route belongs to Pro and the count route to Free; settle them
      // separately so one refusal cannot blank the other.
      const [testRes, countRes] = await Promise.allSettled([
        api.campaigns.getAbTest(campaign.id),
        api.campaigns.getRecipientCount(campaign.id),
      ]);

      if (testRes.status === 'fulfilled') {
        const loaded = testRes.value.data ?? emptyTest(campaign);
        setTest(loaded);

        // Seed from the record just fetched, not from the campaign row the
        // drawer was opened with: that row is the list's copy and does not
        // follow a save, so saving twice in one visit would write back the
        // values from before the first save.
        if (seedForm) {
          form.setFieldsValue({
            ab_testing_enabled: loaded.enabled,
            ab_test_winner_metric: loaded.winner_metric || 'open_rate',
            ab_test_sample_size: loaded.sample_size || 50,
            ab_test_winner_wait_hours:
              loaded.winner_wait_hours || DEFAULT_WAIT_HOURS,
          });
        }
      } else {
        message.error(
          getErrorMessage(
            testRes.reason,
            __('Failed to load A/B test', 'kelune-crm')
          )
        );
        setTest(emptyTest(campaign));
      }

      if (countRes.status === 'fulfilled') {
        setAudience(Number(countRes.value.data?.count) || 0);
      }
    },
    [campaign, form]
  );

  useEffect(() => {
    if (visible && campaign?.id) {
      load(true);
      form.setFieldsValue({
        ab_testing_enabled: Boolean(campaign.ab_testing_enabled),
        ab_test_winner_metric: campaign.ab_test_winner_metric || 'open_rate',
        ab_test_sample_size: campaign.ab_test_sample_size || 50,
        ab_test_winner_wait_hours:
          Number(campaign.settings?.ab_test_winner_wait_hours) ||
          DEFAULT_WAIT_HOURS,
      });
    }
  }, [visible, campaign, form, load]);

  const split = audienceSplit(audience, sampleSize ?? 50, variants);
  const shareExceeded = split.variantShare > 100;

  const handleSaveSettings = async (values: Record<string, unknown>) => {
    if (!campaign) return;

    try {
      setLoading(true);

      await api.put(`/campaigns/${campaign.id}`, {
        ab_testing_enabled: values.ab_testing_enabled,
        ab_test_winner_metric: values.ab_test_winner_metric,
        ab_test_sample_size: values.ab_test_sample_size,
        // `settings` is stored whole, so the wait is merged over whatever the
        // campaign already keeps there rather than replacing it.
        settings: {
          ...(campaign.settings ?? {}),
          ab_test_winner_wait_hours: Math.max(
            1,
            Number(values.ab_test_winner_wait_hours) || DEFAULT_WAIT_HOURS
          ),
        },
      });

      message.success(__('A/B testing settings saved', 'kelune-crm'));
      onCancel();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to save settings', 'kelune-crm'))
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteVariant = async (variantId: ID) => {
    if (!campaign) return;

    try {
      await api.campaigns.deleteVariant(campaign.id, variantId);
      message.success(__('Variant deleted', 'kelune-crm'));
      load();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete variant', 'kelune-crm'))
      );
    }
  };

  const handleDetermineWinner = async () => {
    if (!campaign) return;

    try {
      setLoading(true);
      await api.campaigns.determineWinner(
        campaign.id,
        String(metric || 'open_rate')
      );
      message.success(__('Winner determined', 'kelune-crm'));
      load();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to determine winner', 'kelune-crm'))
      );
    } finally {
      setLoading(false);
    }
  };

  const rows: SplitRow[] = [
    {
      key: 'control',
      id: CONTROL_ID,
      label: __('Original (control)', 'kelune-crm'),
      subject: campaign?.subject ?? '',
      percentage: Math.max(0, 100 - split.variantShare),
      contacts: split.control,
      sent_count: test?.control.sent_count ?? 0,
      open_rate: test?.control.open_rate ?? 0,
      click_rate: test?.control.click_rate ?? 0,
      is_winner: winnerId === CONTROL_ID,
    },
    ...variants.map((variant) => ({
      key: String(variant.id),
      id: variant.id,
      label: variant.variant_label || __('Variant', 'kelune-crm'),
      variant_type: variant.variant_type,
      subject: variant.subject,
      percentage: Number(variant.test_percentage) || 0,
      contacts: split.perVariant[String(variant.id)] ?? 0,
      sent_count: Number(variant.sent_count) || 0,
      open_rate: Number(variant.open_rate) || 0,
      click_rate: Number(variant.click_rate) || 0,
      is_winner: Boolean(variant.is_winner) || winnerId === Number(variant.id),
      variant,
    })),
  ];

  const hasTestData = variants.some(
    (variant) => Number(variant.sent_count) > 0
  );

  const columns = [
    {
      title: __('Variant', 'kelune-crm'),
      dataIndex: 'label',
      key: 'label',
      render: (text: string, record: SplitRow) => (
        <Space>
          {text}
          {record.is_winner && (
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
          : '-',
    },
    {
      title: __('Subject', 'kelune-crm'),
      dataIndex: 'subject',
      key: 'subject',
      ellipsis: true,
    },
    {
      title: __('Share', 'kelune-crm'),
      dataIndex: 'percentage',
      key: 'percentage',
      width: 80,
      render: (pct: number) => `${pct}%`,
    },
    // A projection of who WOULD receive each arm; once the send is under way
    // the Sent column is the fact, and showing both invites the reader to
    // reconcile two numbers that answer different questions.
    ...(editable
      ? [
          {
            title: __('Contacts', 'kelune-crm'),
            dataIndex: 'contacts',
            key: 'contacts',
            width: 90,
          },
        ]
      : []),
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
      render: (rate: number) => (
        <Progress percent={rate} size="small" format={ratePercent} />
      ),
    },
    {
      title: __('Click Rate', 'kelune-crm'),
      dataIndex: 'click_rate',
      key: 'click_rate',
      width: 120,
      render: (rate: number) => (
        <Progress
          percent={rate}
          size="small"
          strokeColor={CHART_COLORS.green}
          format={ratePercent}
        />
      ),
    },
    ...(editable
      ? [
          {
            title: __('Actions', 'kelune-crm'),
            key: 'actions',
            width: 100,
            align: 'right' as const,
            render: (_: unknown, record: SplitRow) =>
              record.variant ? (
                <Space>
                  <Tooltip title={__('Edit', 'kelune-crm')}>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setEditingVariant(record.variant ?? null);
                        setVariantFormVisible(true);
                      }}
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
              ) : null,
          },
        ]
      : []),
  ];

  // What the split means in plain numbers, under the table. Past tense once the
  // remainder has gone out, or the line would still promise a send that is done.
  const splitSummary = test?.remainder_queued
    ? sprintf(
        /* translators: %1$d: contacts in the test sample, %2$d: whole audience, %3$d: contacts sent the winning email */
        __(
          '%1$d of %2$d contacts received the test; the winning email went to the other %3$d.',
          'kelune-crm'
        ),
        split.sample,
        split.audience,
        split.remainder
      )
    : sprintf(
        /* translators: %1$d: contacts in the test sample, %2$d: whole audience, %3$d: contacts held back for the winner */
        __(
          '%1$d of %2$d contacts are in the test sample; %3$d wait for the winning email.',
          'kelune-crm'
        ),
        split.sample,
        split.audience,
        split.remainder
      );

  // When the automatic decision lands, for a test that is already running. The
  // wait is measured from the last test email, so before the sample finishes
  // sending there is no time to name yet.
  const scheduleSummary = (): string => {
    const hours = Number(test?.winner_wait_hours) || DEFAULT_WAIT_HOURS;
    const due = test?.winner_decision_at;

    if (split.remainder === 0) {
      return __(
        'The test sample is the whole audience, so there is no waiting period — nobody is held back for a winner.',
        'kelune-crm'
      );
    }

    if (winnerId !== null) {
      return sprintf(
        /* translators: %d: hours the test ran for */
        __('The test ran for %d hours and has been decided.', 'kelune-crm'),
        hours
      );
    }

    if (!due) {
      return sprintf(
        /* translators: %d: hours the test runs for */
        __(
          'The winner is picked %d hours after the last test email is sent.',
          'kelune-crm'
        ),
        hours
      );
    }

    return sprintf(
      /* translators: %1$d: hours the test runs for, %2$s: local date and time the winner is picked */
      __(
        'The winner is picked %1$d hours after the last test email, which falls on %2$s.',
        'kelune-crm'
      ),
      hours,
      timeFormat(due)
    );
  };

  const winnerLabel = () => {
    if (winnerId === null) return null;
    if (winnerId === CONTROL_ID) {
      return __('The original email won this test.', 'kelune-crm');
    }
    const winner = variants.find((variant) => Number(variant.id) === winnerId);
    return sprintf(
      /* translators: %s: winning variant label */
      __('%s won this test.', 'kelune-crm'),
      winner?.variant_label ?? __('A variant', 'kelune-crm')
    );
  };

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
        width={1120}
        footer={
          <ModalFooter
            okText={__('Save', 'kelune-crm')}
            onOk={editable ? () => form.submit() : undefined}
            confirmLoading={loading}
            onCancel={onCancel}
            cancelText={
              editable ? __('Cancel', 'kelune-crm') : __('Close', 'kelune-crm')
            }
          />
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveSettings}
          disabled={!editable}
        >
          <Alert
            message={
              editable
                ? __(
                    'Send competing versions of this email to a sample of the audience, then send the winner to everyone else.',
                    'kelune-crm'
                  )
                : __(
                    'This campaign has started sending, so its test is now read-only.',
                    'kelune-crm'
                  )
            }
            type="info"
            style={{ marginBottom: 24, border: 'none' }}
          />

          {winnerId !== null && (
            <Alert
              message={winnerLabel()}
              type="success"
              style={{ marginBottom: 24, border: 'none' }}
            />
          )}

          {shareExceeded && (
            <Alert
              message={sprintf(
                /* translators: %d: total share the variants claim */
                __(
                  'The variants claim %d%% of the test sample. Lower a share so the original keeps part of it.',
                  'kelune-crm'
                ),
                split.variantShare
              )}
              type="error"
              style={{ marginBottom: 24, border: 'none' }}
            />
          )}

          <Card
            title={__('Settings', 'kelune-crm')}
            size="small"
            style={{ marginBottom: 24 }}
          >
            <InlineSwitch
              form={form}
              name="ab_testing_enabled"
              label={__('Enable A/B Testing', 'kelune-crm')}
              disabled={!editable}
            />

            <Form.Item
              name="ab_test_winner_metric"
              label={__('Winner Selection Metric', 'kelune-crm')}
              tooltip={__(
                'Which metric decides the winning version',
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
                'Share of the audience that receives the test. The rest are sent the winner.',
                'kelune-crm'
              )}
            >
              <InputNumber min={10} max={100} style={{ width: '100%' }} />
            </Form.Item>

            <Form.Item
              name="ab_test_winner_wait_hours"
              label={__('Winner Wait (hours)', 'kelune-crm')}
              tooltip={__(
                'How long the test runs after the last test email goes out, before the winner is picked. Recipients need time to open and click.',
                'kelune-crm'
              )}
              style={{ marginBottom: 0 }}
            >
              <InputNumber min={1} max={168} style={{ width: '100%' }} />
            </Form.Item>
          </Card>

          {!editable && (
            <Card
              title={__('Test Schedule', 'kelune-crm')}
              size="small"
              style={{ marginBottom: 24 }}
            >
              <Text type="secondary">{scheduleSummary()}</Text>
            </Card>
          )}

          <SubmitOnEnter />
        </Form>

        <Card
          title={__('Audience Split', 'kelune-crm')}
          size="small"
          extra={
            editable ? (
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingVariant(null);
                  setVariantFormVisible(true);
                }}
              >
                {__('Create Variant', 'kelune-crm')}
              </Button>
            ) : null
          }
        >
          <Table
            columns={columns}
            dataSource={rows}
            rowKey="key"
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
          />

          <div style={{ marginTop: 16 }}>
            <Text type="secondary">{splitSummary}</Text>
          </div>

          {/* Once the rest of the audience holds the winning email there is
              nothing left to decide — naming a winner then would only relabel a
              send that already happened. */}
          {!editable && variants.length > 0 && !test?.remainder_queued && (
            <div style={{ marginTop: 16 }}>
              <Tooltip
                title={
                  hasTestData
                    ? __(
                        'Override the automatic decision with the current numbers.',
                        'kelune-crm'
                      )
                    : __(
                        'No test emails have been sent yet, so there is nothing to compare.',
                        'kelune-crm'
                      )
                }
              >
                <Button
                  type="dashed"
                  icon={<TrophyOutlined />}
                  onClick={handleDetermineWinner}
                  loading={loading}
                  disabled={!hasTestData}
                >
                  {__('Determine Winner', 'kelune-crm')}
                </Button>
              </Tooltip>
            </div>
          )}
        </Card>
      </Drawer>

      <VariantFormDrawer
        visible={variantFormVisible}
        onCancel={() => setVariantFormVisible(false)}
        campaignId={campaign?.id}
        variant={editingVariant}
        shareTaken={
          split.variantShare - (Number(editingVariant?.test_percentage) || 0)
        }
        onSuccess={() => {
          setVariantFormVisible(false);
          load();
        }}
      />
    </>
  );
};

interface VariantFormDrawerProps {
  visible: boolean;
  onCancel: () => void;
  campaignId?: ID;
  variant: CampaignVariant | null;
  /** Share the other variants already claim, so this one cannot overrun it. */
  shareTaken: number;
  onSuccess: () => void;
}

const VariantFormDrawer = ({
  visible,
  onCancel,
  campaignId,
  variant,
  shareTaken,
  onSuccess,
}: VariantFormDrawerProps) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const variantType = Form.useWatch('variant_type', form) as string | undefined;
  const type = variantType ?? variant?.variant_type ?? 'subject';
  const available = Math.max(0, 100 - Math.max(0, shareTaken));

  // Read through a ref so the share moving — the parent's fetch landing while
  // this drawer is already open — cannot retrigger the seeding below and wipe
  // what has been typed into it.
  const availableRef = useRef(available);
  availableRef.current = available;

  useEffect(() => {
    if (!visible) return;

    if (variant) {
      form.setFieldsValue({
        variant_label: variant.variant_label,
        variant_type: variant.variant_type ?? 'subject',
        test_percentage: variant.test_percentage ?? 50,
        subject: variant.subject,
        from_name: variant.from_name,
        email_content: variant.email_content,
        content_mode: variant.content_mode ?? 'richtext',
        json_structure: variant.json_structure ?? null,
      });
    } else {
      form.resetFields();
      // Opening on a share the sample cannot give would show an error before
      // the user has touched anything.
      form.setFieldValue(
        'test_percentage',
        Math.max(1, Math.min(50, availableRef.current))
      );
    }
  }, [visible, variant, form]);

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (!campaignId) return;

    try {
      setLoading(true);

      if (variant) {
        await api.campaigns.updateVariant(campaignId, variant.id, values);
        message.success(__('Variant updated', 'kelune-crm'));
      } else {
        await api.campaigns.createVariant(campaignId, values);
        message.success(__('Variant created', 'kelune-crm'));
      }

      onSuccess();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to save variant', 'kelune-crm'))
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer
      destroyOnHidden
      placement="right"
      // The email builder inside opens its own drawers, which would otherwise
      // shove this one sideways.
      push={false}
      width={900}
      title={
        variant
          ? __('Edit Variant', 'kelune-crm')
          : __('Create Variant', 'kelune-crm')
      }
      open={visible}
      onClose={onCancel}
      footer={
        <ModalFooter
          okText={
            variant ? __('Update', 'kelune-crm') : __('Create', 'kelune-crm')
          }
          onOk={() => form.submit()}
          confirmLoading={loading}
          onCancel={onCancel}
        />
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
          label={__('Share of the Test Sample', 'kelune-crm')}
          initialValue={50}
          tooltip={__(
            'Share of the test sample sent this variant. The original takes whatever the variants leave.',
            'kelune-crm'
          )}
          extra={sprintf(
            /* translators: %d: share still available across all variants */
            __('Up to %d%% is still free.', 'kelune-crm'),
            available
          )}
          rules={[
            { required: true },
            {
              validator: (_, value) =>
                Number(value) <= available
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error(
                        sprintf(
                          /* translators: %d: share still available across all variants */
                          __(
                            'The other variants already take the rest of the sample. This variant can take at most %d%%.',
                            'kelune-crm'
                          ),
                          available
                        )
                      )
                    ),
            },
          ]}
        >
          <InputNumber min={1} max={100} style={{ width: '100%' }} />
        </Form.Item>

        {/* Only the parts this type actually overrides are offered — the send
            ignores the others, so showing them would promise a change that
            never reaches the inbox. */}
        {SUBJECT_TYPES.includes(type) && (
          <Form.Item
            name="subject"
            label={__('Subject Line', 'kelune-crm')}
            style={
              CONTENT_TYPES.includes(type) ? undefined : { marginBottom: 0 }
            }
            rules={[
              {
                required: true,
                message: __('Please enter a subject', 'kelune-crm'),
              },
            ]}
          >
            <Input placeholder={__('Email subject', 'kelune-crm')} />
          </Form.Item>
        )}

        {type === 'from_name' && (
          <Form.Item
            name="from_name"
            label={__('From Name', 'kelune-crm')}
            style={{ marginBottom: 0 }}
            rules={[
              {
                required: true,
                message: __('Please enter a from name', 'kelune-crm'),
              },
            ]}
          >
            <Input placeholder={__('Override from name', 'kelune-crm')} />
          </Form.Item>
        )}

        {CONTENT_TYPES.includes(type) && (
          <EmailContentEditor
            form={form}
            modeName="content_mode"
            contentName="email_content"
            structureName="json_structure"
            initialStructure={variant?.json_structure ?? null}
            templateName={
              (form.getFieldValue('variant_label') as string) ||
              __('Variant Email', 'kelune-crm')
            }
            builderRequiredMessage={__(
              'Add email content before saving this variant',
              'kelune-crm'
            )}
          />
        )}
        <SubmitOnEnter />
      </Form>
    </Drawer>
  );
};

export default ABTestConfig;
