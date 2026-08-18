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
  Typography,
  Alert,
} from 'antd';
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
  sendCampaign,
  scheduleCampaign,
} from '../../store/slices/campaignsSlice';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../../store/slices/globalLoadingSlice';
import api from '../../services/api';
import { toUtc, fromUtc } from '../../utils/time';
import EmailContentEditor from '../common/EmailContentEditor';
import EmailPreviewModal from '../common/EmailPreviewModal';
import { isProActive } from '../../hooks/useFeature';
import type {
  Campaign,
  Segment,
  ContactList,
  Tag as TagType,
  EmailProvider,
} from '@/types/models';
import { getErrorMessage } from '@/utils/getErrorMessage';

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

const { Step } = Steps;
const { TextArea } = Input;
const { Option } = Select;

interface CampaignFormProps {
  visible: boolean;
  onCancel: () => void;
  editingCampaign?: Campaign | null;
}

const CampaignForm = ({
  visible,
  onCancel,
  editingCampaign = null,
}: CampaignFormProps) => {
  const dispatch = useDispatch();
  const [form] = Form.useForm();
  // Dynamic segments are a Pro feature; when Pro is absent the segment routes
  // do not exist, so Free must not fetch or offer them.
  const proActive = isProActive();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [segments, setSegments] = useState<Segment[]>([]);
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
  // The persisted campaign id, seeded from editingCampaign on open. The wizard's
  // footer Save is the only writer, so every save updates that same row instead
  // of duplicating.
  const [savedId, setSavedId] = useState<number | string | undefined>(
    editingCampaign?.id
  );

  // Which editor the Content step uses. Owned by EmailContentEditor; mirrored
  // here only so the drawer can widen for the visual builder.
  const contentMode = Form.useWatch('content_mode', form) as
    | 'builder'
    | 'richtext'
    | undefined;

  // Which sender identity the campaign uses (drives the sender section fields).
  const senderType = (Form.useWatch('sender_type', form) ??
    'global') as SenderType;

  // Watched so the footer submit button flips between "Send Now" and "Schedule"
  // the instant the schedule date is picked or cleared (getFieldValue would not
  // re-render on change).
  const scheduledAt = Form.useWatch('scheduled_at', form);

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
    if (visible) {
      fetchTargetingOptions();
      setSavedId(editingCampaign?.id);
      if (editingCampaign) {
        // Coerce id arrays to numbers so they match the numeric Select option
        // values (the API may serialise ids as strings).
        const toIds = (v: unknown): number[] =>
          Array.isArray(v) ? v.map(Number) : [];
        // Derive the sender mode from the persisted fields (there is no stored
        // sender_type column): a custom From wins, else an explicit provider,
        // else the account default. Each mode writes a distinct field signature
        // on save, so this round-trips unambiguously.
        const derivedSenderType: SenderType = editingCampaign.from_email
          ? 'custom'
          : editingCampaign.email_provider_id != null
            ? 'provider'
            : 'global';
        // Convert scheduled_at string to dayjs object for DatePicker
        const formValues = {
          ...editingCampaign,
          // Only `builder` reopens Visual; every other/legacy value (incl. the
          // removed html/text modes) reopens as Rich Text, its body carried in.
          content_mode:
            editingCampaign.content_mode === 'builder' ? 'builder' : 'richtext',
          sender_type: derivedSenderType,
          email_provider_id:
            editingCampaign.email_provider_id != null
              ? Number(editingCampaign.email_provider_id)
              : undefined,
          target_segments: toIds(editingCampaign.target_segments),
          target_lists: toIds(editingCampaign.target_lists),
          target_tags: toIds(editingCampaign.target_tags),
          exclude_segments: toIds(editingCampaign.exclude_segments),
          exclude_lists: toIds(editingCampaign.exclude_lists),
          exclude_tags: toIds(editingCampaign.exclude_tags),
          // Stored UTC → local dayjs so the picker edits in the viewer's timezone.
          scheduled_at: fromUtc(editingCampaign.scheduled_at),
        };
        form.setFieldsValue(formValues);
      } else {
        // Reset for new campaign
        form.resetFields();
        setCurrentStep(0);
      }
    }
  }, [visible, editingCampaign, form, fetchTargetingOptions]);

  const calculateRecipients = async () => {
    if (editingCampaign?.id) {
      try {
        const response = await api.campaigns.getRecipientCount(
          editingCampaign.id
        );
        setRecipientCount(response.data.count);
      } catch (error) {
        console.error('Failed to calculate recipients', error);
      }
    }
  };

  const handleNext = async () => {
    try {
      // Validate only fields in current step
      let fieldsToValidate: string[] = [];

      if (currentStep === 0) {
        // Step 1: Basic Info. The sender fields validated depend on the chosen
        // sender mode — a custom From needs a valid From Email, a provider send
        // needs a provider selected; the account default needs neither.
        fieldsToValidate = ['name', 'subject'];
        if (senderType === 'custom') {
          fieldsToValidate.push('from_email');
        } else if (senderType === 'provider') {
          fieldsToValidate.push('email_provider_id');
        }
      } else if (currentStep === 1) {
        // Step 2: Content
        fieldsToValidate = ['email_content'];
      } else if (currentStep === 2) {
        // Step 3: Recipients. No AntD field rules here (targeting is spread
        // across several multi-selects), so gate advancement on at least one
        // targeting rule — surfaced here rather than only at the final Send.
        fieldsToValidate = [];
        if (!hasRecipients(form.getFieldsValue(true))) {
          message.error(recipientRequiredMessage);
          return;
        }
      }

      if (fieldsToValidate.length > 0) {
        await form.validateFields(fieldsToValidate);
      }

      setCurrentStep(currentStep + 1);

      if (currentStep === 2) {
        calculateRecipients();
      }
    } catch {
      message.error(
        currentStep === 1
          ? __('Email content cannot be empty.', 'kelune-crm')
          : __('Please fill in all required fields in this step.', 'kelune-crm')
      );
    }
  };

  const handlePrevious = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (saveAsDraft = true) => {
    try {
      setLoading(true);

      // Get all form values
      const values = form.getFieldsValue(true);

      // For sending (not draft), validate all required fields
      if (!saveAsDraft) {
        await form.validateFields();
      }

      if (!values.name) {
        message.error(
          __(
            'Campaign name is required. Please go back to Step 1 and fill in all fields.',
            'kelune-crm'
          )
        );
        setLoading(false);
        return;
      }

      // Create a copy of values for API submission (don't mutate form state),
      // collapsing the sender_type choice into the persisted sender fields.
      const campaignData = applySenderFields({ ...values });

      // Local picker value → UTC string for the backend (which stores/compares
      // in UTC). A pre-existing string is left as-is (defensive; the picker
      // always yields a dayjs).
      if (dayjs.isDayjs(campaignData.scheduled_at)) {
        campaignData.scheduled_at = toUtc(campaignData.scheduled_at);
      } else if (
        campaignData.scheduled_at &&
        typeof campaignData.scheduled_at !== 'string'
      ) {
        campaignData.scheduled_at = null;
      }

      const isScheduling = !saveAsDraft && !!campaignData.scheduled_at;
      const isSendingNow = !saveAsDraft && !campaignData.scheduled_at;

      // A real send needs at least one targeting rule, otherwise it reaches
      // nobody. Drafts may be saved without recipients.
      if (!saveAsDraft && !hasRecipients(campaignData)) {
        message.error(recipientRequiredMessage);
        setCurrentStep(2);
        setLoading(false);
        return;
      }

      // Persist as draft/scheduled first; the dedicated send/schedule
      // endpoints own the status transition and queueing.
      campaignData.status = isScheduling ? 'scheduled' : 'draft';

      // Prefer savedId over the editingCampaign prop so re-saving an already
      // persisted campaign updates that row instead of creating a duplicate.
      let campaignId: number | string | undefined =
        savedId ?? editingCampaign?.id;
      if (campaignId) {
        await dispatch(
          updateCampaign({ id: campaignId, data: campaignData })
        ).unwrap();
      } else {
        const created = await dispatch(createCampaign(campaignData)).unwrap();
        campaignId = created?.id;
      }

      if (isScheduling && campaignId) {
        await dispatch(
          scheduleCampaign({
            id: campaignId,
            scheduled_at: campaignData.scheduled_at as string,
          })
        ).unwrap();
        message.success(__('Campaign scheduled successfully', 'kelune-crm'));
      } else if (isSendingNow && campaignId) {
        await dispatch(sendCampaign(campaignId)).unwrap();
        message.success(__('Campaign queued for sending', 'kelune-crm'));
      } else {
        message.success(
          editingCampaign || savedId
            ? __('Campaign updated successfully', 'kelune-crm')
            : __('Campaign saved as draft', 'kelune-crm')
        );
      }

      // Reset and close modal
      form.resetFields();
      setCurrentStep(0);
      onCancel();
    } catch (error) {
      message.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  // Collapse the sender_type choice into the persisted sender fields. Only the
  // fields the chosen mode owns are kept; the rest are sent as empty strings so
  // the backend's isset()-guarded update actually clears any stale values (a
  // null would be skipped). email_provider_id is empty in default/custom modes,
  // so the send resolves the default provider for transport. The transient
  // sender_type key is dropped — it is UI-only and not a campaign column.
  const applySenderFields = (
    data: Record<string, unknown>
  ): Record<string, unknown> => {
    const mode = (data.sender_type as SenderType) || 'global';
    const next = { ...data };
    delete next.sender_type;

    if (mode === 'provider') {
      next.from_name = '';
      next.from_email = '';
      next.reply_to = '';
      next.email_provider_id = data.email_provider_id ?? '';
    } else if (mode === 'custom') {
      next.from_name = data.from_name ?? '';
      next.from_email = data.from_email ?? '';
      next.reply_to = data.reply_to ?? '';
      next.email_provider_id = '';
    } else {
      next.from_name = '';
      next.from_email = '';
      next.reply_to = '';
      next.email_provider_id = '';
    }

    return next;
  };

  // True when the campaign targets at least one segment, list, or tag.
  const hasRecipients = (data: Record<string, unknown>): boolean => {
    const groups = ['target_segments', 'target_lists', 'target_tags'];
    return groups.some((key) => {
      const value = data[key];
      return Array.isArray(value) && value.length > 0;
    });
  };

  // Kept generic (no Pro-only "segment" term, no enumerated field list) so the
  // copy reads the same whether or not Pro is active, while still telling the
  // user what to do.
  const recipientRequiredMessage = __(
    'Select at least one recipient target before continuing.',
    'kelune-crm'
  );

  const handleSendTest = async (testEmail: string) => {
    dispatch(startGlobalLoading());
    try {
      const values = form.getFieldsValue(true);

      if (!values.name) {
        message.error(
          __(
            'Add a campaign name in Step 1 before sending a test.',
            'kelune-crm'
          )
        );
        return;
      }
      if (!values.email_content) {
        message.error(__('Email content cannot be empty.', 'kelune-crm'));
        return;
      }

      // Persist the current edits FIRST so the test reflects the latest content:
      // the backend test send reads the saved campaign row, so unsaved edits
      // would otherwise be ignored. Mirrors the draft save in handleSubmit but
      // without flipping status or requiring recipients (a test needs neither).
      const campaignData = applySenderFields({ ...values });
      // Local picker value → UTC string for the backend (see handleSubmit).
      if (dayjs.isDayjs(campaignData.scheduled_at)) {
        campaignData.scheduled_at = toUtc(campaignData.scheduled_at);
      } else if (
        campaignData.scheduled_at &&
        typeof campaignData.scheduled_at !== 'string'
      ) {
        campaignData.scheduled_at = null;
      }

      // Reuse the persisted row (savedId) so a test never spawns a duplicate.
      let campaignId: number | string | undefined =
        savedId ?? editingCampaign?.id;
      if (campaignId) {
        await dispatch(
          updateCampaign({ id: campaignId, data: campaignData })
        ).unwrap();
      } else {
        const created = await dispatch(createCampaign(campaignData)).unwrap();
        campaignId = created?.id;
        setSavedId(campaignId);
      }

      if (!campaignId) {
        message.error(
          __('Could not save the campaign to send a test.', 'kelune-crm')
        );
        return;
      }

      await api.campaigns.sendTest(campaignId, testEmail);
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

      <Divider style={{ margin: '24px 0' }} />

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
        style={{ margin: '24px 0' }}
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

  // Builder is the default editor; treat an uninitialised mode as builder so the
  // wizard opens wide on the visual editor. The other three modes edit the raw
  // `email_content` HTML/text directly.
  const editorMode = contentMode ?? 'builder';
  const isBuilderMode = editorMode === 'builder';

  // Step 2: Email Content. The editor itself is shared with the automation
  // send_email step so the two cannot drift; this form only supplies the field
  // paths. The builder syncs its design into the form on every edit, and the
  // wizard's own Save persists it — no separate mid-edit save.
  const renderEmailContent = () => (
    <EmailContentEditor
      form={form}
      modeName="content_mode"
      contentName="email_content"
      structureName="json_structure"
      templateIdName="template_id"
      initialStructure={editingCampaign?.json_structure ?? null}
      templateName={
        form.getFieldValue('name') || __('Campaign Email', 'kelune-crm')
      }
    />
  );

  // Step 3: Recipients
  const renderRecipients = () => (
    <div>
      <Card
        size="small"
        title={__('Target Recipients', 'kelune-crm')}
        style={{ marginBottom: 24 }}
      >
        {proActive && (
          <Form.Item
            name="target_segments"
            label={__('Target Segments', 'kelune-crm')}
            tooltip={__('Send to contacts in these segments', 'kelune-crm')}
          >
            <Select
              mode="multiple"
              placeholder={__('Select segments', 'kelune-crm')}
            >
              {segments.map((segment) => (
                <Option key={segment.id} value={Number(segment.id)}>
                  {segment.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        )}

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
          style={{ marginBottom: 0 }}
        >
          <Select mode="multiple" placeholder={__('Select tags', 'kelune-crm')}>
            {tags.map((tag) => (
              <Option key={tag.id} value={Number(tag.id)}>
                {tag.name}
              </Option>
            ))}
          </Select>
        </Form.Item>
      </Card>

      <Card size="small" title={__('Exclude Recipients', 'kelune-crm')}>
        {proActive && (
          <Form.Item
            name="exclude_segments"
            label={__('Exclude Segments', 'kelune-crm')}
            tooltip={__(
              "Don't send to contacts in these segments",
              'kelune-crm'
            )}
          >
            <Select
              mode="multiple"
              placeholder={__('Select segments to exclude', 'kelune-crm')}
            >
              {segments.map((segment) => (
                <Option key={segment.id} value={Number(segment.id)}>
                  {segment.name}
                </Option>
              ))}
            </Select>
          </Form.Item>
        )}

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

        <Form.Item
          name="exclude_tags"
          label={__('Exclude Tags', 'kelune-crm')}
          style={{ marginBottom: 0 }}
        >
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
      </Card>
    </div>
  );

  // Step 4: Review & Send
  const renderReview = () => {
    // Get ALL field values including those from previous steps
    const values = form.getFieldsValue(true);
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
              <strong>{__('Email Content:', 'kelune-crm')}</strong>
              <div style={{ marginTop: 4 }}>
                <Space>
                  <Button
                    icon={<EyeOutlined />}
                    disabled={!values.email_content}
                    onClick={() => setPreviewVisible(true)}
                  >
                    {__('Preview', 'kelune-crm')}
                  </Button>
                  <Button
                    icon={<SendOutlined />}
                    disabled={!values.email_content}
                    onClick={() => setTestEmailVisible(true)}
                  >
                    {__('Send Test', 'kelune-crm')}
                  </Button>
                </Space>
              </div>
            </Col>
          </Row>
        </Card>

        <Card size="small" title={__('Send Options', 'kelune-crm')}>
          <Alert
            type="info"
            style={{ border: 'none', marginBottom: 12 }}
            message={sprintf(
              // translators: 1: current local date and time, 2: browser timezone name.
              __('Your current time: %1$s (%2$s)', 'kelune-crm'),
              nowLabel,
              browserTimezone
            )}
          />
          <Form.Item
            name="scheduled_at"
            label={__('Schedule Send', 'kelune-crm')}
            style={{ marginBottom: 0 }}
          >
            <DatePicker
              showTime
              format="YYYY-MM-DD HH:mm:ss"
              style={{ width: '100%' }}
              placeholder={__(
                'Send immediately if not scheduled',
                'kelune-crm'
              )}
            />
          </Form.Item>
        </Card>

        <Modal
          destroyOnHidden
          centered
          title={__('Send Test Email', 'kelune-crm')}
          open={testEmailVisible}
          onCancel={() => setTestEmailVisible(false)}
          footer={null}
        >
          <Form
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
            >
              <Input placeholder="test@example.com" />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" block>
                {__('Send Test', 'kelune-crm')}
              </Button>
            </Form.Item>
          </Form>
        </Modal>

        <EmailPreviewModal
          open={previewVisible}
          html={String(values.email_content ?? '')}
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
      title: __('Content', 'kelune-crm'),
      icon: <SendOutlined />,
      content: renderEmailContent(),
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

  return (
    <Drawer
      destroyOnHidden
      placement="right"
      push={false}
      title={
        editingCampaign
          ? __('Edit Campaign', 'kelune-crm')
          : __('Create New Campaign', 'kelune-crm')
      }
      open={visible}
      onClose={() => {
        form.resetFields();
        setCurrentStep(0);
        onCancel();
      }}
      // The visual builder needs room, so the drawer widens to full viewport only
      // on the Content step while the builder is the active editor; every other
      // step (and the HTML editor) uses a comfortable form width.
      width={isBuilderMode && currentStep === 1 ? '100%' : 800}
      footer={
        <Space>
          {currentStep < steps.length - 1 ? (
            <Button type="primary" onClick={handleNext}>
              {__('Next', 'kelune-crm')}
            </Button>
          ) : (
            <>
              <Button
                type="primary"
                onClick={() => handleSubmit(false)}
                loading={loading}
                icon={<SendOutlined />}
              >
                {scheduledAt
                  ? __('Schedule', 'kelune-crm')
                  : __('Send Now', 'kelune-crm')}
              </Button>
              <Button onClick={() => handleSubmit(true)} loading={loading}>
                {__('Save as Draft', 'kelune-crm')}
              </Button>
            </>
          )}
          {currentStep > 0 && (
            <Button onClick={handlePrevious}>
              {__('Previous', 'kelune-crm')}
            </Button>
          )}
        </Space>
      }
    >
      <Steps current={currentStep} style={{ marginBottom: 24 }}>
        {steps.map((step, index) => (
          <Step key={index} title={step.title} icon={step.icon} />
        ))}
      </Steps>

      <Form form={form} layout="vertical" preserve={true}>
        <div style={{ minHeight: 400 }}>{steps[currentStep].content}</div>
      </Form>
    </Drawer>
  );
};

export default CampaignForm;
