import React, { useState, useEffect, useMemo } from 'react';
import {
  Form,
  Input,
  Select,
  InputNumber,
  Divider,
  Steps,
  Typography,
  message,
  Button,
  Card,
  Row,
  Col,
  Space,
  Flex,
} from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import type { FormInstance } from 'antd';
import api from '../../services/api';
import EmailContentEditor from '../common/EmailContentEditor';
import EmailPreviewModal from '../common/EmailPreviewModal';
import { TagSelect, ListSelect } from '../common/AudienceSelect';
import SubmitOnEnter from '../common/SubmitOnEnter';
import { ProTag } from '../common/ProTag';
import ActionTypePicker from './ActionTypePicker';
import SendStepTestEmail from './SendStepTestEmail';
import { findActionType } from './actionTypeOptions';
import { EMAIL_STEPS } from './emailStepOptions';
import { isProActive } from '../../hooks/useFeature';
import { formSectionDivider } from '../../utils/formStyles';
import { PRO_CONDITION_TYPES } from './proFeatures';
import type { Tag, ContactList, Segment, EmailProvider } from '@/types/models';

const { Option } = Select;
const { Step } = Steps;
const { Paragraph } = Typography;

type SenderType = 'global' | 'provider' | 'custom';

interface CustomFieldOption {
  field_key: string;
  field_label: string;
}

const STANDARD_FIELDS: { key: string; label: string }[] = [
  { key: 'first_name', label: __('First Name', 'kelune-crm') },
  { key: 'last_name', label: __('Last Name', 'kelune-crm') },
  { key: 'email', label: __('Email', 'kelune-crm') },
  { key: 'phone', label: __('Phone', 'kelune-crm') },
  { key: 'company', label: __('Company', 'kelune-crm') },
  { key: 'website', label: __('Website', 'kelune-crm') },
  { key: 'address', label: __('Address', 'kelune-crm') },
  { key: 'city', label: __('City', 'kelune-crm') },
  { key: 'state', label: __('State', 'kelune-crm') },
  { key: 'zip', label: __('Zip', 'kelune-crm') },
  { key: 'country', label: __('Country', 'kelune-crm') },
  { key: 'status', label: __('Status', 'kelune-crm') },
];

interface StepConfigPanelProps {
  form: FormInstance;
  node: { id: string; type?: string; data: Record<string, unknown> } | null;
  onUpdate: (nodeId: string, values: Record<string, unknown>) => void;
  /** Reports when the content editor needs the full viewport to work in. */
  onWideChange?: (wide: boolean) => void;
  /** Which send_email pane is showing; driven by the drawer's Next/Previous. */
  emailStep: number;
  onEmailStepChange: (step: number) => void;
}

const toNum = (v: unknown): number => Number(v);

/**
 * Entity ids can arrive as strings from the API/graph state. AntD Select
 * matches option values by strict `===`, so coerce the tag/list/segment ids in
 * the step config to numbers (matching the numeric Select option values). Also
 * derives the send-email sender mode from the persisted fields.
 */
const normalizeStepData = (
  data: Record<string, unknown>
): Record<string, unknown> => {
  const next = { ...data };

  const ac = next.action_config;
  if (ac && typeof ac === 'object') {
    const nac = { ...(ac as Record<string, unknown>) };
    if (Array.isArray(nac.tag_ids)) nac.tag_ids = nac.tag_ids.map(toNum);
    if (Array.isArray(nac.list_ids)) nac.list_ids = nac.list_ids.map(toNum);
    if (nac.template_id != null) nac.template_id = toNum(nac.template_id);
    if (nac.email_provider_id != null) {
      nac.email_provider_id = toNum(nac.email_provider_id);
    }
    // Derive the sender mode when absent (older steps have no sender_type):
    // a custom From wins, else an explicit provider, else the global default.
    if (!nac.sender_type) {
      nac.sender_type = nac.from_email
        ? 'custom'
        : nac.email_provider_id != null
          ? 'provider'
          : 'global';
    }
    // Seed the editor mode explicitly rather than leaning on the nested
    // Form.Item initialValue: a step must reopen ON the editor it was saved in,
    // not silently default and hide its design.
    if (!nac.content_mode) {
      const structure = nac.json_structure as { mode?: string } | null;
      const stored = structure?.mode;
      // Only `builder` reopens Visual; anything else reopens as Rich Text,
      // including a step carrying no structure at all.
      nac.content_mode =
        stored === 'builder'
          ? 'builder'
          : stored
            ? 'richtext'
            : nac.json_structure
              ? 'builder'
              : 'richtext';
    }
    next.action_config = nac;
  }

  const cc = next.condition_config;
  if (cc && typeof cc === 'object') {
    const ncc = { ...(cc as Record<string, unknown>) };
    if (ncc.tag_id != null) ncc.tag_id = toNum(ncc.tag_id);
    if (ncc.list_id != null) ncc.list_id = toNum(ncc.list_id);
    if (ncc.segment_id != null) ncc.segment_id = toNum(ncc.segment_id);
    next.condition_config = ncc;
  }

  return next;
};

const StepConfigPanel = ({
  form,
  node,
  onUpdate,
  onWideChange,
  emailStep,
  onEmailStepChange,
}: StepConfigPanelProps) => {
  const actionType = Form.useWatch('action_type', form);
  const conditionType = Form.useWatch('condition_type', form);
  const senderType = (Form.useWatch(['action_config', 'sender_type'], form) ??
    'global') as SenderType;
  const contentMode = Form.useWatch(['action_config', 'content_mode'], form);

  const proActive = isProActive();
  const [tags, setTags] = useState<Tag[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [providers, setProviders] = useState<EmailProvider[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldOption[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [loadingSegments, setLoadingSegments] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  // Settings → Global Email identity, shown as the resolved From line when the
  // step sends with the account default (mirrors the campaign summary).
  const [globalSender, setGlobalSender] = useState<{
    from_name: string;
    from_email: string;
  }>({ from_name: '', from_email: '' });
  const defaultProvider = providers.find((p) => p.is_default) ?? null;

  // The saved block tree for this step's email, handed to the content editor to
  // hydrate the visual builder. Read from the node rather than the form because
  // it is never registered as a Form.Item.
  const initialStructure = useMemo(() => {
    const ac = node?.data?.action_config;
    return ac && typeof ac === 'object'
      ? ((ac as Record<string, unknown>).json_structure ?? null)
      : null;
  }, [node]);

  useEffect(() => {
    if (node) {
      // Reset first: setFieldsValue only shallow-merges, so without this a
      // newly selected step would keep the previous step's nested
      // action_config/condition_config values.
      form.resetFields();
      form.setFieldsValue(normalizeStepData(node.data));
    }
  }, [node, form]);

  // The visual builder is unusable in a narrow drawer, so ask the host to widen
  // while it is the editor on show.
  const needsWide =
    actionType === 'send_email' &&
    emailStep === 1 &&
    (contentMode ?? 'builder') === 'builder';
  useEffect(() => {
    onWideChange?.(needsWide);
  }, [needsWide, onWideChange]);

  useEffect(() => {
    fetchTags();
    fetchLists();
    fetchProviders();
    fetchCustomFields();
    fetchGlobalSender();
    // Segments are a Pro-only route; skip the fetch when Pro is inactive so we
    // don't 404 and flash a "Failed to load segments" error for a feature the
    // Free build cannot use anyway.
    if (proActive) {
      fetchSegments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTags = async () => {
    try {
      const response = await api.tags.getAll();
      setTags(response.data || []);
    } catch (error) {
      message.error(__('Failed to fetch tags', 'kelune-crm'));
    }
  };

  const fetchLists = async () => {
    try {
      const response = await api.lists.getAll();
      setLists(response.data || []);
    } catch (error) {
      message.error(__('Failed to fetch lists', 'kelune-crm'));
    }
  };

  const fetchSegments = async () => {
    try {
      setLoadingSegments(true);
      const response = await api.segments.getAll();
      setSegments(response.data || []);
    } catch (error) {
      console.error('Failed to fetch segments:', error);
    } finally {
      setLoadingSegments(false);
    }
  };

  const fetchProviders = async () => {
    try {
      const response = await api.emailProviders.getAll();
      // The response interceptor already unwraps the { success, data } envelope,
      // so response.data IS the provider array.
      setProviders((response.data as EmailProvider[]) || []);
    } catch (error) {
      console.error('Failed to fetch email providers:', error);
    }
  };

  const fetchGlobalSender = async () => {
    try {
      const response = await api.settings.getAll();
      const s = (response.data ?? {}) as Record<string, unknown>;
      setGlobalSender({
        from_name: String(s.email_from_name ?? ''),
        from_email: String(s.email_from_email ?? ''),
      });
    } catch (error) {
      console.error('Failed to fetch global sender:', error);
    }
  };

  const fetchCustomFields = async () => {
    try {
      setLoadingFields(true);
      const response = await api.get<CustomFieldOption[]>('/custom-fields', {
        params: { per_page: 100, orderby: 'field_order', order: 'ASC' },
      });
      setCustomFields(response.data || []);
    } catch (error) {
      console.error('Failed to fetch custom fields:', error);
    } finally {
      setLoadingFields(false);
    }
  };

  // Default contact fields + custom fields as "Label (key)" select options.
  const fieldOptions = [
    {
      label: __('Default Fields', 'kelune-crm'),
      options: STANDARD_FIELDS.map((f) => ({
        value: f.key,
        label: `${f.label} (${f.key})`,
      })),
    },
    ...(customFields.length > 0
      ? [
          {
            label: __('Custom Fields', 'kelune-crm'),
            options: customFields.map((f) => ({
              value: f.field_key,
              label: `${f.field_label} (${f.field_key})`,
            })),
          },
        ]
      : []),
  ];

  const renderFieldSelect = (name: (string | number)[]) => (
    <Form.Item
      label={__('Field', 'kelune-crm')}
      name={name}
      rules={[
        {
          required: true,
          message: __('Please select a field', 'kelune-crm'),
        },
      ]}
    >
      <Select
        showSearch
        placeholder={__('Select field', 'kelune-crm')}
        loading={loadingFields}
        optionFilterProp="label"
        options={fieldOptions}
      />
    </Form.Item>
  );

  // Collapse the sender-mode choice into the persisted sender fields so the
  // backend (ActionProcessor::sendEmail) sees a clean config: global uses
  // wp_mail with no From override, provider sends through a driver, custom
  // supplies its own From. Mirrors the campaign sender exactly.
  const normalizeOnSave = (
    values: Record<string, unknown>
  ): Record<string, unknown> => {
    if (values.action_type !== 'send_email') return values;
    const ac = { ...(values.action_config as Record<string, unknown>) };
    const mode = (ac.sender_type as SenderType) || 'global';

    if (mode === 'global') {
      delete ac.email_provider_id;
      ac.from_name = '';
      ac.from_email = '';
      ac.reply_to = '';
    } else if (mode === 'provider') {
      ac.from_name = '';
      ac.from_email = '';
      ac.reply_to = '';
    } else {
      delete ac.email_provider_id;
    }

    return { ...values, action_config: ac };
  };

  const handleSave = () => {
    if (!node) return;
    // getFieldsValue(true), not (): the visual builder's block tree lives under
    // action_config.json_structure, which is written via setFields and has no
    // Form.Item. Plain getFieldsValue() returns only registered fields, so it
    // silently drops the tree.
    const values = form.getFieldsValue(true);
    onUpdate(node.id, normalizeOnSave(values));
  };

  /**
   * Commit the chosen action type.
   *
   * Re-picking the step's OWN saved action (after Replace) restores its stored
   * config — otherwise it would blank out values the user never changed. Picking
   * a different action starts clean, since each action stores different keys.
   * Also seeds the label with the action's title so a new step reads as something
   * on the canvas rather than an untitled box.
   */
  const handleActionTypeSelect = (value: string) => {
    if (node && value === node.data.action_type) {
      form.setFieldsValue(normalizeStepData(node.data));
      onEmailStepChange(0);
      return;
    }
    const picked = findActionType(value);
    form.setFieldsValue({
      action_type: value,
      action_config: {},
      label: form.getFieldValue('label') || picked?.title || value,
    });
    onEmailStepChange(0);
  };

  // Step 3 of the send_email action: recap the email before saving the step.
  const renderEmailReview = () => {
    const label = (form.getFieldValue('label') as string) || '-';
    const subject =
      (form.getFieldValue(['action_config', 'subject']) as string) || '-';
    const previewText =
      (form.getFieldValue(['action_config', 'preview_text']) as string) || '';
    const body =
      (form.getFieldValue(['action_config', 'body']) as string) || '';

    // The sender the email will send with, per mode, as two lines: a mode title
    // and the resolved From name/email beneath it (mirrors the campaign summary).
    const identityLine = (name?: string, email?: string): string =>
      email ? `${name ? `${name} ` : ''}<${email}>` : '-';
    const senderSummary = ((): { title: string; identity: string } => {
      if (senderType === 'custom') {
        return {
          title: __('Custom sender', 'kelune-crm'),
          identity: identityLine(
            form.getFieldValue(['action_config', 'from_name']) as string,
            form.getFieldValue(['action_config', 'from_email']) as string
          ),
        };
      }
      if (senderType === 'provider') {
        const p = providers.find(
          (prov) =>
            Number(prov.id) ===
            Number(form.getFieldValue(['action_config', 'email_provider_id']))
        );
        return {
          title: p
            ? `${p.name}${p.is_default ? ` ${__('(default)', 'kelune-crm')}` : ''}`
            : __('Selected provider', 'kelune-crm'),
          identity: p ? identityLine(p.sender_name, p.sender_email) : '-',
        };
      }
      return {
        title: __('Global Email (account default)', 'kelune-crm'),
        identity: identityLine(globalSender.from_name, globalSender.from_email),
      };
    })();

    return (
      <div>
        <Card
          size="small"
          title={__('Email Summary', 'kelune-crm')}
          style={{ marginBottom: 24 }}
        >
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <strong>{__('Step Label:', 'kelune-crm')}</strong>
              <div>{label}</div>
            </Col>
            <Col span={24}>
              <strong>{__('Sender:', 'kelune-crm')}</strong>
              <div>{senderSummary.title}</div>
              <div>{senderSummary.identity}</div>
            </Col>
            <Col span={24}>
              <strong>{__('Subject:', 'kelune-crm')}</strong>
              <div>{subject}</div>
            </Col>
            {previewText ? (
              <Col span={24}>
                <strong>{__('Preview Text:', 'kelune-crm')}</strong>
                <div>{previewText}</div>
              </Col>
            ) : null}
            <Col span={24}>
              <strong>{__('Email Content:', 'kelune-crm')}</strong>
              <div style={{ marginTop: 4 }}>
                <Space>
                  <Button
                    icon={<EyeOutlined />}
                    disabled={!body}
                    onClick={() => setPreviewVisible(true)}
                  >
                    {__('Preview', 'kelune-crm')}
                  </Button>
                  <SendStepTestEmail form={form} />
                </Space>
              </div>
            </Col>
          </Row>
        </Card>

        <EmailPreviewModal
          open={previewVisible}
          html={body}
          onCancel={() => setPreviewVisible(false)}
        />
      </div>
    );
  };

  const renderActionConfig = () => {
    switch (actionType) {
      case 'send_email':
        return (
          <>
            {/* Same Steps bar as the campaign wizard — titles and icons, driven
                by the drawer footer's Next/Previous rather than by clicking. */}
            <Steps current={emailStep} style={{ marginBottom: 24 }}>
              {EMAIL_STEPS.map((step) => (
                <Step key={step.title} title={step.title} icon={step.icon} />
              ))}
            </Steps>

            {/* Both panes stay mounted and are toggled with `display`, not
                unmounted: the visual builder holds its live canvas in local
                state and only commits on its own Save, so remounting on every
                step switch would throw away in-progress design work. */}
            <div style={{ display: emailStep === 0 ? 'block' : 'none' }}>
              {/* Provenance only — which template seeded the content. Never
                  shown as a bound value, because it is not one. */}
              <Form.Item name={['action_config', 'template_id']} hidden>
                <Input type="hidden" />
              </Form.Item>
              <Form.Item label={__('Label', 'kelune-crm')} name="label">
                <Input placeholder={__('Step label', 'kelune-crm')} />
              </Form.Item>
              <Form.Item
                label={__('Email Subject', 'kelune-crm')}
                name={['action_config', 'subject']}
                rules={[
                  {
                    required: true,
                    message: __('Please enter a subject', 'kelune-crm'),
                  },
                ]}
              >
                <Input placeholder={__('Email subject', 'kelune-crm')} />
              </Form.Item>

              <Form.Item
                label={__('Preview Text', 'kelune-crm')}
                name={['action_config', 'preview_text']}
                tooltip={__('This appears in the inbox preview', 'kelune-crm')}
              >
                <Input placeholder={__('Preview text', 'kelune-crm')} />
              </Form.Item>

              <Divider
                orientation="left"
                orientationMargin="0"
                style={formSectionDivider}
              >
                {__('Sender', 'kelune-crm')}
              </Divider>

              <Form.Item
                label={__('Emails Sender', 'kelune-crm')}
                name={['action_config', 'sender_type']}
                initialValue="global"
                tooltip={__(
                  'Choose the From identity this email is sent with.',
                  'kelune-crm'
                )}
              >
                <Select
                  onChange={(val) => {
                    // Switching into provider mode preselects the default provider
                    // so the required select is never left empty.
                    if (
                      val === 'provider' &&
                      !form.getFieldValue([
                        'action_config',
                        'email_provider_id',
                      ]) &&
                      defaultProvider
                    ) {
                      form.setFieldValue(
                        ['action_config', 'email_provider_id'],
                        Number(defaultProvider.id)
                      );
                    }
                  }}
                  options={[
                    {
                      value: 'global',
                      label: __('Global Email', 'kelune-crm'),
                    },
                    {
                      value: 'provider',
                      label: __('Email Provider', 'kelune-crm'),
                    },
                    {
                      value: 'custom',
                      label: __('Custom', 'kelune-crm'),
                    },
                  ]}
                />
              </Form.Item>

              {senderType === 'global' && (
                <Typography.Paragraph
                  type="secondary"
                  style={{ marginTop: -8 }}
                >
                  {__('Sends using your', 'kelune-crm')}{' '}
                  <Typography.Text strong>
                    {__('Settings → Global Email', 'kelune-crm')}
                  </Typography.Text>{' '}
                  {__('identity', 'kelune-crm')}
                  {globalSender.from_email ? (
                    <>
                      {' '}
                      (
                      <Typography.Text strong>
                        {globalSender.from_name
                          ? `${globalSender.from_name} <${globalSender.from_email}>`
                          : globalSender.from_email}
                      </Typography.Text>
                      )
                    </>
                  ) : (
                    ''
                  )}{' '}
                  {__(
                    'through WordPress’ mailer (wp_mail) — whatever SMTP plugin or server your site uses handles delivery. Choose',
                    'kelune-crm'
                  )}{' '}
                  <Typography.Text strong>
                    {__('Email Provider', 'kelune-crm')}
                  </Typography.Text>{' '}
                  {__(
                    'to send through a specific connection instead.',
                    'kelune-crm'
                  )}
                </Typography.Paragraph>
              )}

              {senderType === 'provider' && (
                <Form.Item
                  label={__('Email Provider', 'kelune-crm')}
                  name={['action_config', 'email_provider_id']}
                  rules={[
                    {
                      required: true,
                      message: __(
                        'Please choose an email provider',
                        'kelune-crm'
                      ),
                    },
                  ]}
                  tooltip={
                    providers.length === 0
                      ? __(
                          'No providers configured — add one under Settings → Email Providers.',
                          'kelune-crm'
                        )
                      : __(
                          "The email is sent from this provider's verified sender.",
                          'kelune-crm'
                        )
                  }
                  style={{ marginBottom: 0 }}
                >
                  <Select
                    placeholder={
                      providers.length === 0
                        ? __('No providers configured yet', 'kelune-crm')
                        : __('Select a provider', 'kelune-crm')
                    }
                    notFoundContent={__(
                      'No email providers configured',
                      'kelune-crm'
                    )}
                    options={providers.map((p) => ({
                      value: Number(p.id),
                      label: `${p.name} — ${p.sender_email}${
                        p.is_default ? ` ${__('(default)', 'kelune-crm')}` : ''
                      }`,
                    }))}
                  />
                </Form.Item>
              )}

              {senderType === 'custom' && (
                <>
                  <Typography.Paragraph
                    type="secondary"
                    style={{ marginTop: -8 }}
                  >
                    {__(
                      'Sends with this From identity through WordPress’ mailer (wp_mail) — your SMTP plugin or server handles delivery. Use a From address your mail setup is allowed to send, or messages may bounce.',
                      'kelune-crm'
                    )}
                  </Typography.Paragraph>
                  <Form.Item
                    label={__('From Name', 'kelune-crm')}
                    name={['action_config', 'from_name']}
                  >
                    <Input placeholder={__('Your Company', 'kelune-crm')} />
                  </Form.Item>
                  <Form.Item
                    label={__('From Email', 'kelune-crm')}
                    name={['action_config', 'from_email']}
                    rules={[
                      {
                        required: true,
                        message: __('Please enter a From email', 'kelune-crm'),
                      },
                      {
                        type: 'email',
                        message: __('Enter a valid email', 'kelune-crm'),
                      },
                    ]}
                  >
                    <Input placeholder="you@example.com" />
                  </Form.Item>
                  <Form.Item
                    label={__('Reply-To Email', 'kelune-crm')}
                    name={['action_config', 'reply_to']}
                    rules={[
                      {
                        type: 'email',
                        message: __('Enter a valid email', 'kelune-crm'),
                      },
                    ]}
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      placeholder={__('Where replies should go', 'kelune-crm')}
                    />
                  </Form.Item>
                </>
              )}
            </div>

            <div style={{ display: emailStep === 1 ? 'block' : 'none' }}>
              <EmailContentEditor
                form={form}
                modeName={['action_config', 'content_mode']}
                contentName={['action_config', 'body']}
                structureName={['action_config', 'json_structure']}
                templateIdName={['action_config', 'template_id']}
                initialStructure={initialStructure}
                templateName={
                  (form.getFieldValue('label') as string) ||
                  __('Automation Email', 'kelune-crm')
                }
                builderRequiredMessage={__(
                  'Add at least one block in the visual builder before saving this step',
                  'kelune-crm'
                )}
              />
            </div>

            {/* Review — mirrors the campaign wizard's summary: recap the email
                identity in one column and offer a preview before saving. There is
                no recipient/schedule/send here (the action fires per enrolled
                contact at automation runtime), so those campaign rows are absent. */}
            {emailStep === 2 && renderEmailReview()}
          </>
        );

      case 'add_list':
      case 'remove_list':
        return (
          <Form.Item
            label={__('Lists', 'kelune-crm')}
            name={['action_config', 'list_ids']}
            rules={[
              {
                required: true,
                message: __('Please select at least one list', 'kelune-crm'),
              },
            ]}
            style={{ marginBottom: 0 }}
          >
            <ListSelect placeholder={__('Select lists', 'kelune-crm')} />
          </Form.Item>
        );

      case 'add_tag':
      case 'remove_tag':
        return (
          <Form.Item
            label={__('Tags', 'kelune-crm')}
            name={['action_config', 'tag_ids']}
            rules={[
              {
                required: true,
                message: __('Please select at least one tag', 'kelune-crm'),
              },
            ]}
            style={{ marginBottom: 0 }}
          >
            <TagSelect placeholder={__('Select tags', 'kelune-crm')} />
          </Form.Item>
        );

      case 'update_field':
        return (
          <>
            {renderFieldSelect(['action_config', 'field'])}
            <Form.Item
              label={__('New Value', 'kelune-crm')}
              name={['action_config', 'value']}
              style={{ marginBottom: 0 }}
            >
              <Input placeholder={__('New value', 'kelune-crm')} />
            </Form.Item>
          </>
        );

      case 'webhook':
        return (
          <>
            <Form.Item
              label={__('Webhook URL', 'kelune-crm')}
              name={['action_config', 'url']}
              rules={[
                {
                  required: true,
                  message: __('Please enter a webhook URL', 'kelune-crm'),
                },
                {
                  type: 'url',
                  message: __('Enter a valid URL', 'kelune-crm'),
                },
              ]}
            >
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item
              label={__('Method', 'kelune-crm')}
              name={['action_config', 'method']}
              initialValue="POST"
              style={{ marginBottom: 0 }}
            >
              <Select>
                <Option value="POST">POST</Option>
                <Option value="PUT">PUT</Option>
                <Option value="PATCH">PATCH</Option>
                <Option value="DELETE">DELETE</Option>
                <Option value="GET">GET</Option>
              </Select>
            </Form.Item>
          </>
        );

      default:
        return null;
    }
  };

  const renderConditionConfig = () => {
    switch (conditionType) {
      case 'field_value':
        return (
          <>
            {renderFieldSelect(['condition_config', 'field'])}
            <Form.Item
              label={__('Operator', 'kelune-crm')}
              name={['condition_config', 'operator']}
              initialValue="equals"
              rules={[
                {
                  required: true,
                  message: __('Please select an operator', 'kelune-crm'),
                },
              ]}
            >
              <Select>
                <Option value="equals">{__('Equals', 'kelune-crm')}</Option>
                <Option value="not_equals">
                  {__('Not Equals', 'kelune-crm')}
                </Option>
                <Option value="contains">{__('Contains', 'kelune-crm')}</Option>
                <Option value="not_contains">
                  {__('Not Contains', 'kelune-crm')}
                </Option>
                <Option value="greater_than">
                  {__('Greater Than', 'kelune-crm')}
                </Option>
                <Option value="less_than">
                  {__('Less Than', 'kelune-crm')}
                </Option>
              </Select>
            </Form.Item>
            <Form.Item
              label={__('Value', 'kelune-crm')}
              name={['condition_config', 'value']}
              style={{ marginBottom: 0 }}
            >
              <Input placeholder={__('Comparison value', 'kelune-crm')} />
            </Form.Item>
          </>
        );

      case 'has_tag':
      case 'not_has_tag':
        return (
          <Form.Item
            label={__('Tag', 'kelune-crm')}
            name={['condition_config', 'tag_id']}
            rules={[
              {
                required: true,
                message: __('Please select a tag', 'kelune-crm'),
              },
            ]}
            style={{ marginBottom: 0 }}
          >
            <Select placeholder={__('Select tag', 'kelune-crm')}>
              {tags.map((tag) => (
                <Option key={tag.id} value={Number(tag.id)}>
                  {tag.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        );

      case 'in_list':
      case 'not_in_list':
        return (
          <Form.Item
            label={__('List', 'kelune-crm')}
            name={['condition_config', 'list_id']}
            rules={[
              {
                required: true,
                message: __('Please select a list', 'kelune-crm'),
              },
            ]}
            style={{ marginBottom: 0 }}
          >
            <Select placeholder={__('Select list', 'kelune-crm')}>
              {lists.map((list) => (
                <Option key={list.id} value={Number(list.id)}>
                  {list.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        );

      case 'in_segment':
      case 'not_in_segment':
        return (
          <Form.Item
            label={__('Segment', 'kelune-crm')}
            name={['condition_config', 'segment_id']}
            rules={[
              {
                required: true,
                message: __('Please select a segment', 'kelune-crm'),
              },
            ]}
            style={{ marginBottom: 0 }}
          >
            <Select
              placeholder={__('Select segment', 'kelune-crm')}
              loading={loadingSegments}
            >
              {segments.map((segment) => (
                <Option key={segment.id} value={Number(segment.id)}>
                  {segment.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        );

      default:
        return null;
    }
  };

  if (!node) return null;

  // A brand-new action step has no type yet: choose what it does before there is
  // anything to configure. The label and Save button would both be premature, so
  // the picker replaces the fields — but it renders INSIDE the Form, because
  // `form` is only connected to a mounted Form element.
  const isPickingAction = node.type === 'action' && !actionType;

  return (
    <>
      <Form form={form} layout="vertical" onFinish={handleSave}>
        {isPickingAction && (
          <>
            <Paragraph type="secondary">
              {__(
                'Choose what this step should do. This cannot be changed later — use Replace to swap it for a different action.',
                'kelune-crm'
              )}
            </Paragraph>
            <ActionTypePicker onSelect={handleActionTypeSelect} />
          </>
        )}

        <div style={{ display: isPickingAction ? 'none' : 'block' }}>
          {/* A send_email action renders its own Label inside the Basic Info
              pane, directly above Email Subject; every other step type shows it
              up front. */}
          {actionType !== 'send_email' && (
            <Form.Item label={__('Label', 'kelune-crm')} name="label">
              <Input placeholder={__('Step label', 'kelune-crm')} />
            </Form.Item>
          )}

          {node.type === 'action' && (
            <>
              {/* The type is fixed once chosen — the drawer header names it
                and offers Replace, so the body does not repeat it. Each action
                stores a different action_config shape, so swapping in place
                would strand the previous action's keys in the saved JSON
                blob. */}
              <Form.Item name="action_type" hidden>
                <Input type="hidden" />
              </Form.Item>
              {renderActionConfig()}
            </>
          )}

          {node.type === 'condition' && (
            <>
              <Form.Item
                label={__('Condition Type', 'kelune-crm')}
                name="condition_type"
                rules={[
                  {
                    required: true,
                    message: __('Please select a condition type', 'kelune-crm'),
                  },
                ]}
              >
                <Select
                  placeholder={__('Select condition type', 'kelune-crm')}
                  // Segment conditions depend on Pro segments, so without Pro
                  // they show as locked rather than being selectable.
                  options={[
                    {
                      value: 'field_value',
                      label: __('Field Value', 'kelune-crm'),
                    },
                    {
                      value: 'in_list',
                      label: __('In List', 'kelune-crm'),
                    },
                    {
                      value: 'not_in_list',
                      label: __('Not In List', 'kelune-crm'),
                    },
                    {
                      value: 'has_tag',
                      label: __('Has Tag', 'kelune-crm'),
                    },
                    {
                      value: 'not_has_tag',
                      label: __('Does Not Have Tag', 'kelune-crm'),
                    },
                    {
                      value: 'in_segment',
                      label: __('In Segment', 'kelune-crm'),
                    },
                    {
                      value: 'not_in_segment',
                      label: __('Not In Segment', 'kelune-crm'),
                    },
                    {
                      value: 'email_opened',
                      label: __('Email Opened', 'kelune-crm'),
                    },
                    {
                      value: 'email_clicked',
                      label: __('Email Clicked', 'kelune-crm'),
                    },
                  ].map((o) => {
                    const locked =
                      !proActive && PRO_CONDITION_TYPES.has(o.value);
                    return {
                      value: o.value,
                      disabled: locked,
                      label: locked ? (
                        <Flex align="center" gap={8}>
                          {o.label}
                          <ProTag />
                        </Flex>
                      ) : (
                        o.label
                      ),
                    };
                  })}
                />
              </Form.Item>
              {renderConditionConfig()}
            </>
          )}

          {node.type === 'delay' && (
            <Form.Item
              label={__('Delay Duration', 'kelune-crm')}
              required
              style={{ marginBottom: 0 }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <Form.Item
                  name="delay_value"
                  initialValue={1}
                  noStyle
                  rules={[
                    {
                      required: true,
                      message: __('Please enter a duration', 'kelune-crm'),
                    },
                  ]}
                >
                  <InputNumber min={1} style={{ flex: 1 }} />
                </Form.Item>
                <Form.Item
                  name="delay_type"
                  initialValue="days"
                  noStyle
                  rules={[
                    {
                      required: true,
                      message: __('Please select a unit', 'kelune-crm'),
                    },
                  ]}
                >
                  <Select
                    style={{ width: 120 }}
                    options={[
                      {
                        value: 'minutes',
                        label: __('Minutes', 'kelune-crm'),
                      },
                      {
                        value: 'hours',
                        label: __('Hours', 'kelune-crm'),
                      },
                      { value: 'days', label: __('Days', 'kelune-crm') },
                      {
                        value: 'weeks',
                        label: __('Weeks', 'kelune-crm'),
                      },
                    ]}
                  />
                </Form.Item>
              </div>
            </Form.Item>
          )}
        </div>

        {/* Enter saves only where Save is the drawer footer's primary action:
            while the email wizard still has steps left, that button is Next. */}
        {!isPickingAction &&
          (actionType !== 'send_email' ||
            emailStep === EMAIL_STEPS.length - 1) && <SubmitOnEnter />}
      </Form>
    </>
  );
};

export default StepConfigPanel;
