import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch } from '@store/hooks';
import {
  Modal,
  Drawer,
  Form,
  Input,
  Select,
  Button,
  Steps,
  Space,
  message,
  Row,
  Col,
  Card,
  Divider,
  DatePicker,
  Radio,
  Typography,
  Alert,
  Flex,
  Tooltip,
} from 'antd';
import type { RadioChangeEvent } from 'antd';
import {
  MailOutlined,
  UserOutlined,
  SendOutlined,
  CheckCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { __, _n, sprintf } from '@wordpress/i18n';
import {
  createCampaign,
  updateCampaign,
} from '../../store/slices/campaignsSlice';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../../store/slices/globalLoadingSlice';
import api from '../../services/api';
import { toUtc, fromUtc } from '../../utils/time';
import { onEnterKey } from '../../utils/onEnterKey';
import { formFieldDivider, formSectionDivider } from '../../utils/formStyles';
import EmailPreviewModal from '../common/EmailPreviewModal';
import ModalFooter from '../common/ModalFooter';
import { buildDefaultTemplateContent } from '../email-templates/blockDefaults';
import { isProActive } from '../../hooks/useFeature';
import { ProTag } from '../common/ProTag';
import ProUpgradeModal from '../common/ProUpgradeModal';
import { proLockTitle } from '../../utils/pro';
import type {
  Campaign,
  Segment,
  ContactList,
  Tag as TagType,
  EmailProvider,
} from '@/types/models';
import { getErrorMessage } from '@/utils/getErrorMessage';
import SubmitOnEnter from '../common/SubmitOnEnter';

// The three ways a campaign resolves its From identity. Mirrors the backend
// cascade in EmailService::dispatch (custom → provider → global default):
//  - global   → no override; send with Settings → Global Email through the
//               default provider connection.
//  - provider → send from a chosen provider connection's verified sender.
//  - custom   → an explicit From Name / From Email / Reply-To on this campaign.
type SenderType = 'global' | 'provider' | 'custom';

interface GlobalSender {
  from_name: string;
  from_email: string;
  reply_to: string;
}

const { TextArea } = Input;
const { Option } = Select;

// Collapse the sender_type choice into the persisted sender fields. Only the
// fields the chosen mode owns are kept; the rest are sent as empty strings so
// the backend's isset()-guarded update actually clears any stale values (a
// null would be skipped). email_provider_id is empty in default/custom modes,
// so the send resolves the default provider for transport.
const applySenderFields = (
  values: Record<string, unknown>
): Record<string, unknown> => {
  const mode = (values.sender_type as SenderType) || 'global';

  if (mode === 'provider') {
    return {
      from_name: '',
      from_email: '',
      reply_to: '',
      email_provider_id: values.email_provider_id ?? '',
    };
  }
  if (mode === 'custom') {
    return {
      from_name: values.from_name ?? '',
      from_email: values.from_email ?? '',
      reply_to: values.reply_to ?? '',
      email_provider_id: '',
    };
  }
  return {
    from_name: '',
    from_email: '',
    reply_to: '',
    email_provider_id: '',
  };
};

// The six targeting fields, normalised to id arrays.
const targetingPayload = (
  values: Record<string, unknown>
): Record<string, number[]> => {
  const ids = (value: unknown): number[] =>
    Array.isArray(value) ? value.map(Number).filter(Boolean) : [];
  return {
    target_lists: ids(values.target_lists),
    target_tags: ids(values.target_tags),
    target_segments: ids(values.target_segments),
    exclude_lists: ids(values.exclude_lists),
    exclude_tags: ids(values.exclude_tags),
    exclude_segments: ids(values.exclude_segments),
  };
};

// True when the campaign targets at least one list, tag, or segment.
const hasRecipients = (data: Record<string, unknown>): boolean =>
  ['target_lists', 'target_tags', 'target_segments'].some((key) => {
    const value = data[key];
    return Array.isArray(value) && value.length > 0;
  });

// Kept generic (no Pro-only "segment" term, no enumerated field list) so the
// copy reads the same whether or not Pro is active, while still telling the
// user what to do.
const recipientRequiredMessage = __(
  'Select at least one recipient target before continuing.',
  'kelune-crm'
);

interface LockedSegmentSelectProps {
  /** Injected by Form.Item — kept bound so a campaign configured while Pro was
   *  active does not lose its segments when saved from Free. */
  value?: number[];
  onChange?: (value: number[]) => void;
  onUpgradeClick: () => void;
}

/**
 * The Target/Exclude Segments field with Pro inactive. The Select is disabled
 * and therefore swallows clicks, so a transparent overlay sits on top to catch
 * them and open the upgrade modal — the field reads as locked but still answers.
 */
const LockedSegmentSelect = ({
  value,
  onChange,
  onUpgradeClick,
}: LockedSegmentSelectProps) => (
  <div style={{ position: 'relative' }}>
    <Select
      mode="multiple"
      disabled
      value={value}
      onChange={onChange}
      style={{ width: '100%' }}
      placeholder={__('Available in Kelune CRM Pro', 'kelune-crm')}
    />
    <div
      role="button"
      tabIndex={0}
      aria-label={proLockTitle(__('Segments', 'kelune-crm'))}
      onClick={onUpgradeClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onUpgradeClick();
        }
      }}
      style={{ position: 'absolute', inset: 0, cursor: 'pointer' }}
    />
  </div>
);

interface CampaignFormProps {
  visible: boolean;
  onCancel: () => void;
  /** The campaign being configured; omit for the create flow. */
  editingCampaign?: Campaign | null;
  /** Handed the new record so the host can continue to the content builder. */
  onCreated?: (campaign: Campaign) => void;
}

/**
 * A campaign's configuration: identity, recipients, and the send itself. The
 * email body is NOT edited here — that lives on the campaign builder route
 * (#/campaigns/builder/:id), so this drawer serves both the create flow (which
 * persists a draft and hands off to the builder) and the builder's Config action.
 */
const CampaignForm = ({
  visible,
  onCancel,
  editingCampaign = null,
  onCreated,
}: CampaignFormProps) => {
  const dispatch = useDispatch();
  const [form] = Form.useForm();
  const [testEmailForm] = Form.useForm();
  // Dynamic segments are a Pro feature; when Pro is absent the segment routes
  // do not exist, so Free must not fetch or offer them.
  const proActive = isProActive();
  const isEditing = Boolean(editingCampaign);
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [proUpgradeOpen, setProUpgradeOpen] = useState(false);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [tags, setTags] = useState<TagType[]>([]);
  const [recipientCount, setRecipientCount] = useState(0);
  const [testEmailVisible, setTestEmailVisible] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [providers, setProviders] = useState<EmailProvider[]>([]);
  // Global Email identity, shown as the resolved sender when "Account default"
  // is chosen so the user sees who the campaign actually sends as.
  const [globalSender, setGlobalSender] = useState<GlobalSender>({
    from_name: '',
    from_email: '',
    reply_to: '',
  });

  // Which sender identity the campaign uses (drives the sender section fields).
  const senderType = (Form.useWatch('sender_type', form) ??
    'global') as SenderType;

  // Whether the send waits for a chosen time; drives the send-time field.
  const sendMode = (Form.useWatch('send_mode', form) ?? 'immediate') as
    | 'immediate'
    | 'scheduled';

  // Live local-time clock shown above the schedule picker. The picker is read in
  // the viewer's browser timezone (converted to UTC on submit), so surfacing
  // "now" in that same timezone — named, so the anchor is unambiguous — tells the
  // user exactly what they're picking against.
  const browserTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [nowLabel, setNowLabel] = useState(() =>
    dayjs().format('MMMM D, YYYY h:mm:ss a')
  );
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowLabel(dayjs().format('MMMM D, YYYY h:mm:ss a'));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // The default provider connection used for transport when no provider is
  // explicitly chosen (Account default / Custom sender modes).
  const defaultProvider = providers.find((p) => p.is_default) ?? null;

  const fetchTargetingOptions = useCallback(async () => {
    // Each source is loaded independently: a single failing request (e.g. the
    // Pro-only segments route 404ing when Pro is inactive) must NOT wipe out the
    // others — a plain Promise.all would reject the whole batch and leave every
    // dropdown empty. Segments are only fetched when Pro is active.
    const [segmentsRes, listsRes, tagsRes, providersRes, settingsRes] =
      await Promise.allSettled([
        proActive ? api.segments.getAll() : Promise.resolve(null),
        api.lists.getAll(),
        api.tags.getAll(),
        api.emailProviders.getAll(),
        api.settings.getAll(),
      ]);

    setSegments(
      segmentsRes.status === 'fulfilled' && segmentsRes.value
        ? segmentsRes.value.data || []
        : []
    );
    if (listsRes.status === 'fulfilled') {
      setLists(listsRes.value.data || []);
    }
    if (tagsRes.status === 'fulfilled') {
      setTags(tagsRes.value.data || []);
    }
    if (providersRes.status === 'fulfilled') {
      // The response interceptor already unwraps the { success, data } envelope,
      // so response.data IS the provider array.
      setProviders((providersRes.value.data as EmailProvider[]) || []);
    }
    if (settingsRes.status === 'fulfilled') {
      const s = (settingsRes.value.data ?? {}) as Record<string, unknown>;
      setGlobalSender({
        from_name: String(s.email_from_name ?? ''),
        from_email: String(s.email_from_email ?? ''),
        reply_to: String(s.email_reply_to_email ?? ''),
      });
    }
  }, [proActive]);

  useEffect(() => {
    if (!visible) return;

    fetchTargetingOptions();
    setCurrentStep(0);
    setRecipientCount(0);
    form.resetFields();

    if (!editingCampaign) return;

    // Coerce id arrays to numbers so they match the numeric Select option
    // values (the API may serialise ids as strings).
    const toIds = (v: unknown): number[] =>
      Array.isArray(v) ? v.map(Number) : [];
    // Derive the sender mode from the persisted fields (there is no stored
    // sender_type column): a custom From wins, else an explicit provider, else
    // the account default. Each mode writes a distinct field signature on save,
    // so this round-trips unambiguously.
    const derivedSenderType: SenderType = editingCampaign.from_email
      ? 'custom'
      : editingCampaign.email_provider_id != null
        ? 'provider'
        : 'global';

    // Only the fields this drawer owns are seeded — the email body and its
    // editor state belong to the builder route and must not travel through here.
    form.setFieldsValue({
      name: editingCampaign.name ?? '',
      description: editingCampaign.description ?? '',
      subject: editingCampaign.subject ?? '',
      preview_text: editingCampaign.preview_text ?? '',
      sender_type: derivedSenderType,
      from_name: editingCampaign.from_name ?? '',
      from_email: editingCampaign.from_email ?? '',
      reply_to: editingCampaign.reply_to ?? '',
      email_provider_id:
        editingCampaign.email_provider_id != null
          ? Number(editingCampaign.email_provider_id)
          : undefined,
      target_lists: toIds(editingCampaign.target_lists),
      target_tags: toIds(editingCampaign.target_tags),
      target_segments: toIds(editingCampaign.target_segments),
      exclude_lists: toIds(editingCampaign.exclude_lists),
      exclude_tags: toIds(editingCampaign.exclude_tags),
      exclude_segments: toIds(editingCampaign.exclude_segments),
      // A stored send time IS the "at a scheduled time" choice — there is no
      // separate column for the mode, so the radio is recovered from it.
      send_mode: editingCampaign.scheduled_at ? 'scheduled' : 'immediate',
      // Stored UTC → local dayjs so the picker edits in the viewer's timezone.
      scheduled_at: fromUtc(editingCampaign.scheduled_at),
    });
  }, [visible, editingCampaign, form, fetchTargetingOptions]);

  // Count against the targeting rules as they stand in the form, so the Review
  // step reflects unsaved edits (and works before the record exists at all).
  const refreshRecipientCount = useCallback(async () => {
    const values = form.getFieldsValue(true);
    try {
      const response = await api.campaigns.previewRecipientCount(
        targetingPayload(values)
      );
      setRecipientCount(Number(response.data?.count ?? 0));
    } catch {
      setRecipientCount(0);
    }
  }, [form]);

  const handleNext = async () => {
    // Step 0 — Basic Info. Which sender fields are validated depends on the
    // chosen mode: a custom From needs a valid From Email, a provider send needs
    // a provider selected; the account default needs neither.
    if (currentStep === 0) {
      const fields = ['name', 'subject'];
      if (senderType === 'custom') {
        fields.push('from_email');
      } else if (senderType === 'provider') {
        fields.push('email_provider_id');
      }
      try {
        await form.validateFields(fields);
      } catch {
        message.error(
          __('Please fill in all required fields in this step.', 'kelune-crm')
        );
        return;
      }
      setCurrentStep(1);
      return;
    }

    // Step 1 — Recipients. No AntD field rules here (targeting is spread across
    // several multi-selects), so gate advancement on at least one targeting rule
    // rather than surfacing it only at the send.
    if (currentStep === 1) {
      if (!hasRecipients(form.getFieldsValue(true))) {
        message.error(recipientRequiredMessage);
        return;
      }
      setCurrentStep(2);
      refreshRecipientCount();
    }
  };

  const handlePrevious = () => {
    setCurrentStep(currentStep - 1);
  };

  // Everything the drawer persists, sender choice collapsed into the stored
  // fields and the schedule converted to UTC.
  const buildPayload = (): Record<string, unknown> => {
    const values = form.getFieldsValue(true);
    const payload: Record<string, unknown> = {
      name: values.name ?? '',
      description: values.description ?? '',
      subject: values.subject ?? '',
      preview_text: values.preview_text ?? '',
      ...applySenderFields(values),
      ...targetingPayload(values),
    };

    // "Send immediately" is the absence of a send time, so the mode collapses
    // into `scheduled_at` and no separate column is needed. Local picker value →
    // UTC string for the backend (which stores/compares in UTC); a pre-existing
    // string is left as-is (defensive; the picker always yields a dayjs).
    const scheduled =
      values.send_mode === 'scheduled' ? values.scheduled_at : null;
    if (dayjs.isDayjs(scheduled)) {
      payload.scheduled_at = toUtc(scheduled);
    } else if (typeof scheduled === 'string') {
      payload.scheduled_at = scheduled;
    } else {
      payload.scheduled_at = null;
    }

    return payload;
  };

  // Create: persist the draft with starter content so the builder opens on
  // ready-to-edit blocks, then hand the record to the host, which continues to
  // the builder route. Nothing is dispatched here — a campaign sends when it is
  // activated, which is a deliberate act of its own.
  const handleCreate = async () => {
    setLoading(true);
    try {
      const seed = buildDefaultTemplateContent();
      const created = await dispatch(
        createCampaign({
          ...buildPayload(),
          content_mode: 'builder',
          email_content: seed.html_content,
          json_structure: seed.json_structure,
        })
      ).unwrap();
      message.success(__('Campaign created successfully', 'kelune-crm'));
      form.resetFields();
      setCurrentStep(0);
      if (created) {
        onCreated?.(created);
      }
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  // Save the configuration of an existing campaign. Status is never part of the
  // payload: it changes only through activate/pause.
  const handleUpdate = async () => {
    if (!editingCampaign) return;
    setLoading(true);
    try {
      await dispatch(
        updateCampaign({ id: editingCampaign.id, data: buildPayload() })
      ).unwrap();
      message.success(__('Campaign updated successfully', 'kelune-crm'));
      onCancel();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async (testEmail: string) => {
    if (!editingCampaign) return;
    dispatch(startGlobalLoading());
    try {
      // Persist the current edits FIRST so the test reflects them: the backend
      // test send reads the saved campaign row.
      await dispatch(
        updateCampaign({ id: editingCampaign.id, data: buildPayload() })
      ).unwrap();
      await api.campaigns.sendTest(editingCampaign.id, testEmail);
      message.success(__('Test email sent successfully', 'kelune-crm'));
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to send test email', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  // Step 1: Basic Info
  const renderBasicInfo = () => (
    <div>
      <Form.Item
        name="name"
        label={__('Campaign Name', 'kelune-crm')}
        rules={[
          {
            required: true,
            message: __('Please enter campaign name', 'kelune-crm'),
          },
        ]}
      >
        <Input placeholder={__('e.g., Summer Sale 2026', 'kelune-crm')} />
      </Form.Item>

      <Form.Item name="description" label={__('Description', 'kelune-crm')}>
        <TextArea
          rows={3}
          placeholder={__('Internal description', 'kelune-crm')}
        />
      </Form.Item>

      <Divider style={formFieldDivider} />

      <Form.Item
        name="subject"
        label={__('Email Subject', 'kelune-crm')}
        rules={[
          {
            required: true,
            message: __('Please enter email subject', 'kelune-crm'),
          },
        ]}
      >
        <Input
          placeholder={__(
            'Subject line (supports merge tags: {{first_name}})',
            'kelune-crm'
          )}
        />
      </Form.Item>

      <Form.Item
        name="preview_text"
        label={__('Preview Text', 'kelune-crm')}
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
        name="sender_type"
        label={__('Emails Sender', 'kelune-crm')}
        initialValue="global"
        tooltip={__(
          'Choose the From identity your campaign is sent with.',
          'kelune-crm'
        )}
      >
        <Select
          onChange={(val) => {
            // Switching into provider mode preselects the default provider so
            // the required select is never left empty.
            if (
              val === 'provider' &&
              !form.getFieldValue('email_provider_id') &&
              defaultProvider
            ) {
              form.setFieldValue(
                'email_provider_id',
                Number(defaultProvider.id)
              );
            }
          }}
          options={[
            { value: 'global', label: __('Global Email', 'kelune-crm') },
            {
              value: 'provider',
              label: __('Email Provider', 'kelune-crm'),
            },
            { value: 'custom', label: __('Custom', 'kelune-crm') },
          ]}
        />
      </Form.Item>

      {senderType === 'global' && (
        <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
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
          {__('to send through a specific connection instead.', 'kelune-crm')}
        </Typography.Paragraph>
      )}

      {senderType === 'provider' && (
        <Form.Item
          name="email_provider_id"
          label={__('Email Provider', 'kelune-crm')}
          rules={[
            {
              required: true,
              message: __('Please choose an email provider', 'kelune-crm'),
            },
          ]}
          tooltip={
            providers.length === 0
              ? __(
                  'No email providers configured yet — add one under Settings → Email Providers.',
                  'kelune-crm'
                )
              : __(
                  "The campaign is sent from this provider's verified sender.",
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
            notFoundContent={__('No email providers configured', 'kelune-crm')}
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
          <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
            {__(
              'Sends with this From identity through WordPress’ mailer (wp_mail) — your SMTP plugin or server handles delivery. Use a From address your mail setup is allowed to send, or messages may bounce.',
              'kelune-crm'
            )}
          </Typography.Paragraph>
          <Form.Item name="from_name" label={__('From Name', 'kelune-crm')}>
            <Input placeholder={__('Your Company', 'kelune-crm')} />
          </Form.Item>
          <Form.Item
            name="from_email"
            label={__('From Email', 'kelune-crm')}
            rules={[
              {
                required: true,
                message: __('Please enter a From email', 'kelune-crm'),
              },
              {
                type: 'email',
                message: __('Please enter a valid email', 'kelune-crm'),
              },
            ]}
          >
            <Input placeholder="you@example.com" />
          </Form.Item>

          <Form.Item
            name="reply_to"
            label={__('Reply-To Email', 'kelune-crm')}
            rules={[
              {
                type: 'email',
                message: __('Please enter a valid email', 'kelune-crm'),
              },
            ]}
            style={{ marginBottom: 0 }}
          >
            <Input placeholder="support@example.com" />
          </Form.Item>
        </>
      )}
    </div>
  );

  // Segment targeting comes from the Pro add-on: without it the fields stay
  // Segment targeting comes from the Pro add-on: without it the fields stay
  // visible but locked, and both the label and the field open the upgrade modal.
  const segmentLabel = (text: string) =>
    proActive ? (
      text
    ) : (
      <Tooltip title={proLockTitle(text)}>
        <Flex
          align="center"
          gap={8}
          style={{ cursor: 'pointer' }}
          onClick={() => setProUpgradeOpen(true)}
        >
          {text}
          <ProTag />
        </Flex>
      </Tooltip>
    );

  const renderSegmentSelect = (placeholder: string) =>
    proActive ? (
      <Select mode="multiple" placeholder={placeholder}>
        {segments.map((segment) => (
          <Option key={segment.id} value={Number(segment.id)}>
            {segment.name}
          </Option>
        ))}
      </Select>
    ) : (
      <LockedSegmentSelect onUpgradeClick={() => setProUpgradeOpen(true)} />
    );

  // Step 2: Recipients
  const renderRecipients = () => (
    <div>
      <Card
        size="small"
        title={__('Target Recipients', 'kelune-crm')}
        style={{ marginBottom: 24 }}
      >
        <Form.Item
          name="target_lists"
          label={__('Target Lists', 'kelune-crm')}
          tooltip={__('Send to contacts in these lists', 'kelune-crm')}
        >
          <Select
            mode="multiple"
            placeholder={__('Select lists', 'kelune-crm')}
          >
            {lists.map((list) => (
              <Option key={list.id} value={Number(list.id)}>
                {list.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="target_tags"
          label={__('Target Tags', 'kelune-crm')}
          tooltip={__('Send to contacts with these tags', 'kelune-crm')}
        >
          <Select mode="multiple" placeholder={__('Select tags', 'kelune-crm')}>
            {tags.map((tag) => (
              <Option key={tag.id} value={Number(tag.id)}>
                {tag.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="target_segments"
          label={segmentLabel(__('Target Segments', 'kelune-crm'))}
          tooltip={__('Send to contacts in these segments', 'kelune-crm')}
          style={{ marginBottom: 0 }}
        >
          {renderSegmentSelect(__('Select segments', 'kelune-crm'))}
        </Form.Item>
      </Card>

      <Card size="small" title={__('Exclude Recipients', 'kelune-crm')}>
        <Form.Item
          name="exclude_lists"
          label={__('Exclude Lists', 'kelune-crm')}
        >
          <Select
            mode="multiple"
            placeholder={__('Select lists to exclude', 'kelune-crm')}
          >
            {lists.map((list) => (
              <Option key={list.id} value={Number(list.id)}>
                {list.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item name="exclude_tags" label={__('Exclude Tags', 'kelune-crm')}>
          <Select
            mode="multiple"
            placeholder={__('Select tags to exclude', 'kelune-crm')}
          >
            {tags.map((tag) => (
              <Option key={tag.id} value={Number(tag.id)}>
                {tag.name}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          name="exclude_segments"
          label={segmentLabel(__('Exclude Segments', 'kelune-crm'))}
          tooltip={__("Don't send to contacts in these segments", 'kelune-crm')}
          style={{ marginBottom: 0 }}
        >
          {renderSegmentSelect(__('Select segments to exclude', 'kelune-crm'))}
        </Form.Item>
      </Card>
    </div>
  );

  // Step 3: Review. Creating stops at the summary — there is no email body yet,
  // so preview, test send and scheduling belong to the configure flow, where the
  // record exists and the builder has been through.
  const renderReview = () => {
    const values = form.getFieldsValue(true);
    const emailContent = String(editingCampaign?.email_content ?? '');
    // The sender the campaign will actually send with, per mode, as two lines:
    // a mode title and the resolved From name/email beneath it.
    const senderSummary = ((): { title: string; identity: string } => {
      const mode = (values.sender_type as SenderType) || 'global';
      const identityLine = (name?: string, email?: string): string =>
        email ? `${name ? `${name} ` : ''}<${email}>` : '-';
      if (mode === 'custom') {
        return {
          title: __('Custom sender', 'kelune-crm'),
          identity: identityLine(values.from_name, values.from_email),
        };
      }
      if (mode === 'provider') {
        const p = providers.find(
          (prov) => Number(prov.id) === Number(values.email_provider_id)
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
    })();
    return (
      <div>
        <Card
          size="small"
          title={__('Campaign Summary', 'kelune-crm')}
          style={{ marginBottom: 24 }}
        >
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <strong>{__('Campaign Name:', 'kelune-crm')}</strong>
              <div>{values.name || '-'}</div>
            </Col>
            <Col span={24}>
              <strong>{__('Sender:', 'kelune-crm')}</strong>
              <div>{senderSummary.title}</div>
              <div>{senderSummary.identity}</div>
            </Col>
            <Col span={24}>
              <strong>{__('Subject:', 'kelune-crm')}</strong>
              <div>{values.subject || '-'}</div>
            </Col>
            {values.preview_text ? (
              <Col span={24}>
                <strong>{__('Preview Text:', 'kelune-crm')}</strong>
                <div>{values.preview_text}</div>
              </Col>
            ) : null}
            <Col span={24}>
              <strong>{__('Recipients:', 'kelune-crm')}</strong>
              <div>
                {sprintf(
                  // translators: %s: number of contacts
                  _n('%s contact', '%s contacts', recipientCount, 'kelune-crm'),
                  recipientCount > 0 ? recipientCount.toLocaleString() : '0'
                )}
              </div>
            </Col>
            <Col span={24}>
              <strong>{__('Sends:', 'kelune-crm')}</strong>
              <div>
                {sendMode === 'scheduled' && dayjs.isDayjs(values.scheduled_at)
                  ? sprintf(
                      // translators: %s: local date and time the campaign is set to send
                      __('At %s, once the campaign is activated', 'kelune-crm'),
                      values.scheduled_at.format('MMMM D, YYYY h:mm a')
                    )
                  : __('As soon as the campaign is activated', 'kelune-crm')}
              </div>
            </Col>
            {isEditing && (
              <Col span={24}>
                <strong>{__('Email Content:', 'kelune-crm')}</strong>
                <div style={{ marginTop: 4 }}>
                  <Space>
                    <Button
                      icon={<EyeOutlined />}
                      disabled={!emailContent}
                      onClick={() => setPreviewVisible(true)}
                    >
                      {__('Preview', 'kelune-crm')}
                    </Button>
                    <Button
                      icon={<SendOutlined />}
                      disabled={!emailContent}
                      onClick={() => setTestEmailVisible(true)}
                    >
                      {__('Send Test', 'kelune-crm')}
                    </Button>
                  </Space>
                </div>
              </Col>
            )}
          </Row>
        </Card>

        {/* Both options describe what happens once the campaign is activated —
            nothing here sends anything by itself. */}
        <Card size="small" title={__('Send Options', 'kelune-crm')}>
          <Form.Item
            name="send_mode"
            initialValue="immediate"
            style={{ marginBottom: sendMode === 'scheduled' ? 16 : 0 }}
          >
            <Radio.Group
              onChange={(e: RadioChangeEvent) => {
                // Leaving the scheduled option drops the date, so the stored
                // field always matches the chosen mode.
                if (e.target.value === 'immediate') {
                  form.setFieldValue('scheduled_at', null);
                }
              }}
            >
              <Space direction="vertical">
                <Radio value="immediate">
                  {__('Send immediately when activated', 'kelune-crm')}
                </Radio>
                <Radio value="scheduled">
                  {__(
                    'Send at a scheduled time after activation',
                    'kelune-crm'
                  )}
                </Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          {sendMode === 'scheduled' && (
            <>
              <Alert
                type="info"
                style={{ border: 'none', marginBottom: 12 }}
                message={sprintf(
                  // translators: %1$s: current local date and time, %2$s: browser timezone name
                  __('Your current time: %1$s (%2$s)', 'kelune-crm'),
                  nowLabel,
                  browserTimezone
                )}
              />
              <Form.Item
                name="scheduled_at"
                label={__('Send Time', 'kelune-crm')}
                rules={[
                  {
                    required: true,
                    message: __('Please pick a send time', 'kelune-crm'),
                  },
                ]}
                style={{ marginBottom: 0 }}
              >
                <DatePicker
                  showTime
                  format="YYYY-MM-DD HH:mm:ss"
                  style={{ width: '100%' }}
                  placeholder={__('Pick a date and time', 'kelune-crm')}
                />
              </Form.Item>
            </>
          )}
        </Card>

        <Modal
          destroyOnHidden
          centered
          title={__('Send Test Email', 'kelune-crm')}
          open={testEmailVisible}
          onCancel={() => setTestEmailVisible(false)}
          footer={
            <ModalFooter
              okText={__('Send Test', 'kelune-crm')}
              onOk={() => testEmailForm.submit()}
              onCancel={() => setTestEmailVisible(false)}
            />
          }
        >
          <Form
            form={testEmailForm}
            layout="vertical"
            onFinish={(values: { test_email: string }) => {
              handleSendTest(values.test_email);
              setTestEmailVisible(false);
            }}
          >
            <Form.Item
              name="test_email"
              label={__('Email Address', 'kelune-crm')}
              rules={[
                {
                  required: true,
                  message: __('Please enter email', 'kelune-crm'),
                },
                {
                  type: 'email',
                  message: __('Please enter a valid email', 'kelune-crm'),
                },
              ]}
              style={{ marginBottom: 0 }}
            >
              <Input placeholder="test@example.com" />
            </Form.Item>
            <SubmitOnEnter />
          </Form>
        </Modal>

        <EmailPreviewModal
          open={previewVisible}
          html={emailContent}
          onCancel={() => setPreviewVisible(false)}
        />
      </div>
    );
  };

  const steps = [
    {
      title: __('Basic Info', 'kelune-crm'),
      icon: <MailOutlined />,
      content: renderBasicInfo(),
    },
    {
      title: __('Recipients', 'kelune-crm'),
      icon: <UserOutlined />,
      content: renderRecipients(),
    },
    {
      title: __('Review', 'kelune-crm'),
      icon: <CheckCircleOutlined />,
      content: renderReview(),
    },
  ];

  const isLastStep = currentStep === steps.length - 1;

  const handleClose = () => {
    form.resetFields();
    setCurrentStep(0);
    onCancel();
  };

  // Next through the wizard, then the action that ends it. Neither one sends:
  // the campaign goes out when it is activated from the list or the builder.
  const primary = !isLastStep
    ? { text: __('Next', 'kelune-crm'), onOk: handleNext }
    : isEditing
      ? { text: __('Update', 'kelune-crm'), onOk: handleUpdate }
      : { text: __('Create', 'kelune-crm'), onOk: handleCreate };

  return (
    <Drawer
      destroyOnHidden
      placement="right"
      title={
        isEditing
          ? __('Configure Campaign', 'kelune-crm')
          : __('Create Campaign', 'kelune-crm')
      }
      open={visible}
      onClose={handleClose}
      width={800}
      footer={
        <ModalFooter
          onOk={primary.onOk}
          okText={primary.text}
          confirmLoading={loading}
          secondary={
            currentStep > 0 && (
              <Button onClick={handlePrevious}>
                {__('Previous', 'kelune-crm')}
              </Button>
            )
          }
          onCancel={handleClose}
        />
      }
    >
      <Steps
        current={currentStep}
        items={steps.map(({ title, icon }) => ({ title, icon }))}
        style={{ marginBottom: 24 }}
      />

      {/* Enter advances the wizard but never submits: the last step's action
          stays an explicit click. */}
      <Form
        form={form}
        layout="vertical"
        preserve={true}
        onKeyDown={isLastStep ? undefined : onEnterKey(handleNext)}
      >
        <div style={{ minHeight: 400 }}>{steps[currentStep].content}</div>
      </Form>

      <ProUpgradeModal
        open={proUpgradeOpen}
        onClose={() => setProUpgradeOpen(false)}
        title={__('Segments', 'kelune-crm')}
        description={__(
          'Upgrade to Kelune CRM Pro to target and exclude contacts by dynamic segment.',
          'kelune-crm'
        )}
      />
    </Drawer>
  );
};

export default CampaignForm;
