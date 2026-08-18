import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from '@store/hooks';
import {
  Modal,
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
  Alert,
} from 'antd';
import {
  ThunderboltOutlined,
  SettingOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import {
  createAutomation,
  updateAutomation,
  fetchAutomations,
} from '../../store/slices/automationsSlice';
import api from '../../services/api';
import type { Automation, Tag, ContactList } from '@/types/models';
import { getErrorMessage } from '@/utils/getErrorMessage';

const { Step } = Steps;
const { TextArea } = Input;
const { Option } = Select;

// Trigger types the backend accepts (Automation::validate) and actually fires.
// Kept in sync with the backend valid-trigger list and Automations.tsx
// TRIGGER_META.
const TRIGGER_OPTIONS: { value: string; label: string }[] = [
  {
    value: 'contact_created',
    label: __('Contact Created', 'kelune-crm'),
  },
  {
    value: 'contact_updated',
    label: __('Contact Updated', 'kelune-crm'),
  },
  { value: 'tag_added', label: __('Tag Added', 'kelune-crm') },
  { value: 'tag_removed', label: __('Tag Removed', 'kelune-crm') },
  { value: 'list_added', label: __('Added to List', 'kelune-crm') },
  {
    value: 'list_removed',
    label: __('Removed from List', 'kelune-crm'),
  },
  { value: 'manual', label: __('Manual Enrollment', 'kelune-crm') },
];

const TRIGGER_LABELS: Record<string, string> = Object.fromEntries(
  TRIGGER_OPTIONS.map((t) => [t.value, t.label])
);

// Convert a re-entry wait amount + unit into days (backend stores days).
const toDays = (value: unknown, unit: string | undefined): number | null => {
  const amount = Number(value);
  if (!value || Number.isNaN(amount)) return null;
  switch (unit) {
    case 'minutes':
      return amount / 1440;
    case 'hours':
      return amount / 24;
    case 'weeks':
      return amount * 7;
    case 'days':
    default:
      return amount;
  }
};

interface AutomationFormProps {
  visible: boolean;
  onCancel: () => void;
  editingAutomation?: Automation | null;
}

const AutomationForm = ({
  visible,
  onCancel,
  editingAutomation = null,
}: AutomationFormProps) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Live trigger type drives which config field renders. Form.useWatch keeps it
  // reactive — reading form.getFieldValue() in render does not re-render when
  // the value changes.
  const triggerType = Form.useWatch('trigger_type', form) as string | undefined;

  const [tags, setTags] = useState<Tag[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);

  // Load the entities the trigger config selects need (tag/list triggers). Each
  // source is loaded independently (allSettled) so one failing route never
  // wipes the other.
  const fetchTriggerOptions = useCallback(async () => {
    const [tagsRes, listsRes] = await Promise.allSettled([
      api.tags.getAll(),
      api.lists.getAll(),
    ]);

    if (tagsRes.status === 'fulfilled') setTags(tagsRes.value.data || []);
    if (listsRes.status === 'fulfilled') setLists(listsRes.value.data || []);
  }, []);

  useEffect(() => {
    if (!visible) return;
    fetchTriggerOptions();

    if (editingAutomation) {
      // Reset first: setFieldsValue only shallow-merges, so without this the
      // previously edited automation's nested trigger_config would leak into
      // the next one.
      form.resetFields();

      const entryConditions =
        (editingAutomation.entry_conditions as Record<string, unknown>) || {};
      // Re-entry policy lives under its own `reentry` key; fall back to the old
      // flat keys so automations saved before the split still populate.
      const reentry =
        (entryConditions.reentry as Record<string, unknown>) || entryConditions;
      const allowReentry = reentry.allow ?? entryConditions.allow_reentry;
      const triggerConfig =
        (editingAutomation.trigger_config as Record<string, unknown>) || {};

      // Ids can arrive as strings — coerce to numbers so the Select options
      // (numeric values) match and show the label rather than the raw id.
      const num = (v: unknown): number | undefined =>
        v == null || v === '' ? undefined : Number(v);

      form.setFieldsValue({
        ...editingAutomation,
        status: editingAutomation.status || 'draft',
        trigger_config: {
          ...triggerConfig,
          tag_id: num(triggerConfig.tag_id),
          list_id: num(triggerConfig.list_id),
          segment_id: num(triggerConfig.segment_id),
          campaign_id: num(triggerConfig.campaign_id),
        },
        settings: {
          allow_reentry:
            allowReentry === true ||
            allowReentry === 'true' ||
            allowReentry === 1 ||
            allowReentry === '1',
          reentry_wait_value:
            reentry.wait_value ??
            reentry.reentry_wait_value ??
            reentry.wait_days ??
            '',
          reentry_wait_unit:
            (reentry.wait_unit as string) ||
            (reentry.reentry_wait_unit as string) ||
            'days',
        },
      });
      setCurrentStep(0);
    } else {
      form.resetFields();
      setCurrentStep(0);
    }
  }, [visible, editingAutomation, form, fetchTriggerOptions]);

  const handleNext = async () => {
    try {
      let fieldsToValidate: string[][] = [];

      if (currentStep === 0) {
        fieldsToValidate = [['name'], ['trigger_type']];
      } else if (currentStep === 1) {
        fieldsToValidate = [['description']];
      }

      await form.validateFields(fieldsToValidate);
      setCurrentStep(currentStep + 1);
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const handlePrev = () => {
    setCurrentStep(currentStep - 1);
  };

  // Persist the automation, then either open the visual builder or close. A new
  // automation always continues to the builder ("Build Workflow"); an edit only
  // does so via the dedicated Build Workflow button — plain Update just closes.
  const handleSubmit = async (forceBuilder: boolean) => {
    try {
      await form.validateFields([['name'], ['trigger_type']]);

      const values = form.getFieldsValue(true);
      setLoading(true);

      const data = {
        name: values.name || '',
        description: values.description || '',
        trigger_type: values.trigger_type || '',
        trigger_config: values.trigger_config || {},
        // Re-entry policy is nested under `reentry` so it never collides with
        // the entry filter rules the backend reads from `conditions`. Any
        // existing filter list on the edited automation is preserved untouched.
        entry_conditions: {
          reentry: {
            allow: values.settings?.allow_reentry || false,
            wait_value: values.settings?.reentry_wait_value || null,
            wait_unit: values.settings?.reentry_wait_unit || 'days',
            wait_days: toDays(
              values.settings?.reentry_wait_value,
              values.settings?.reentry_wait_unit
            ),
          },
          conditions: Array.isArray(
            (editingAutomation?.entry_conditions as Record<string, unknown>)
              ?.conditions
          )
            ? (editingAutomation?.entry_conditions as Record<string, unknown>)
                .conditions
            : [],
        },
        status: values.status || 'draft',
      };

      if (!data.name || !data.trigger_type) {
        throw new Error(__('Please fill in all required fields', 'kelune-crm'));
      }

      let automationId: string | number | undefined;
      if (editingAutomation) {
        await dispatch(
          updateAutomation({ id: editingAutomation.id, data })
        ).unwrap();
        automationId = editingAutomation.id;
        message.success(__('Automation updated successfully', 'kelune-crm'));
      } else {
        const created = await dispatch(createAutomation(data)).unwrap();
        automationId = created?.id;
        message.success(__('Automation created successfully', 'kelune-crm'));
      }

      form.resetFields();
      setCurrentStep(0);
      onCancel();

      if ((forceBuilder || !editingAutomation) && automationId != null) {
        navigate(`/automations/builder/${automationId}`);
      } else {
        dispatch(fetchAutomations({}));
      }
    } catch (error) {
      console.error('Submit error:', error);
      message.error(
        getErrorMessage(error) || __('Failed to save automation', 'kelune-crm')
      );
    } finally {
      setLoading(false);
    }
  };

  // Config field(s) for the selected trigger. Reactive via `triggerType` so the
  // right field appears the instant the trigger type changes or an automation
  // is loaded for editing. Backed by real entities, not placeholder options.
  const renderTriggerFields = () => {
    switch (triggerType) {
      case 'tag_added':
      case 'tag_removed':
        return (
          <Form.Item
            label={__('Tag', 'kelune-crm')}
            name={['trigger_config', 'tag_id']}
            rules={[
              {
                required: true,
                message: __('Please select a tag', 'kelune-crm'),
              },
            ]}
            tooltip={__(
              'Only contacts whose tag change matches this tag are enrolled.',
              'kelune-crm'
            )}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={__('Select tag', 'kelune-crm')}
              options={tags.map((t) => ({
                value: Number(t.id),
                label: t.name,
              }))}
            />
          </Form.Item>
        );

      case 'list_added':
      case 'list_removed':
        return (
          <Form.Item
            label={__('List', 'kelune-crm')}
            name={['trigger_config', 'list_id']}
            rules={[
              {
                required: true,
                message: __('Please select a list', 'kelune-crm'),
              },
            ]}
            tooltip={__(
              'Only contacts whose list change matches this list are enrolled.',
              'kelune-crm'
            )}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={__('Select list', 'kelune-crm')}
              options={lists.map((l) => ({
                value: Number(l.id),
                label: l.name,
              }))}
            />
          </Form.Item>
        );

      default:
        return null;
    }
  };

  const steps = [
    {
      title: __('Trigger', 'kelune-crm'),
      icon: <ThunderboltOutlined />,
      content: (
        <>
          <Form.Item
            label={__('Automation Name', 'kelune-crm')}
            name="name"
            rules={[
              {
                required: true,
                message: __('Please enter automation name', 'kelune-crm'),
              },
            ]}
          >
            <Input
              placeholder={__('e.g., Welcome New Subscribers', 'kelune-crm')}
            />
          </Form.Item>

          <Form.Item label={__('Description', 'kelune-crm')} name="description">
            <TextArea
              rows={3}
              placeholder={__(
                'Describe what this automation does...',
                'kelune-crm'
              )}
            />
          </Form.Item>

          <Form.Item
            label={__('Trigger Type', 'kelune-crm')}
            name="trigger_type"
            rules={[
              {
                required: true,
                message: __('Please select a trigger', 'kelune-crm'),
              },
            ]}
          >
            <Select
              placeholder={__('Select trigger', 'kelune-crm')}
              options={TRIGGER_OPTIONS}
              onChange={() => form.setFieldsValue({ trigger_config: {} })}
            />
          </Form.Item>

          {renderTriggerFields()}
        </>
      ),
    },
    {
      title: __('Settings', 'kelune-crm'),
      icon: <SettingOutlined />,
      content: (
        <>
          <Form.Item
            label={__('Allow Re-entry', 'kelune-crm')}
            name={['settings', 'allow_reentry']}
            tooltip={__(
              'Allow contacts to enter this automation multiple times',
              'kelune-crm'
            )}
          >
            <Select>
              <Option value={false}>
                {__('No - Run once per contact', 'kelune-crm')}
              </Option>
              <Option value={true}>
                {__('Yes - Allow multiple entries', 'kelune-crm')}
              </Option>
            </Select>
          </Form.Item>

          {/* Wait Between Entries only applies when re-entry is allowed —
              hidden for run-once, where there is no second entry to delay. */}
          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) =>
              prev.settings?.allow_reentry !== cur.settings?.allow_reentry
            }
          >
            {({ getFieldValue }) =>
              getFieldValue(['settings', 'allow_reentry']) ? (
                <Form.Item
                  label={__('Wait Between Entries', 'kelune-crm')}
                  tooltip={__(
                    'How long to wait before allowing re-entry',
                    'kelune-crm'
                  )}
                >
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Form.Item
                      name={['settings', 'reentry_wait_value']}
                      noStyle
                      style={{ flex: 1 }}
                    >
                      <Input
                        type="number"
                        min={0}
                        placeholder={__('Amount', 'kelune-crm')}
                        style={{ flex: 1 }}
                      />
                    </Form.Item>
                    <Form.Item name={['settings', 'reentry_wait_unit']} noStyle>
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
                          {
                            value: 'days',
                            label: __('Days', 'kelune-crm'),
                          },
                          {
                            value: 'weeks',
                            label: __('Weeks', 'kelune-crm'),
                          },
                        ]}
                      />
                    </Form.Item>
                  </div>
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </>
      ),
    },
    {
      title: __('Review', 'kelune-crm'),
      icon: <CheckCircleOutlined />,
      content: (
        <>
          <Alert
            message={__(
              'Review the automation configuration below before saving. Make sure the name and trigger are correct — they define when contacts get enrolled. Once saved, you can add and arrange the workflow steps in the visual builder.',
              'kelune-crm'
            )}
            type="success"
            style={{ marginBottom: 24, border: 'none' }}
          />

          <Card
            title={__('Automation Summary', 'kelune-crm')}
            size="small"
            style={{ marginBottom: 24 }}
          >
            <Row gutter={[16, 16]}>
              <Col span={12}>
                <strong>{__('Name:', 'kelune-crm')}</strong>
              </Col>
              <Col span={12}>{form.getFieldValue('name') || '-'}</Col>

              <Col span={12}>
                <strong>{__('Trigger:', 'kelune-crm')}</strong>
              </Col>
              <Col span={12}>
                {TRIGGER_LABELS[form.getFieldValue('trigger_type')] ||
                  form.getFieldValue('trigger_type') ||
                  '-'}
              </Col>

              <Col span={12}>
                <strong>{__('Description:', 'kelune-crm')}</strong>
              </Col>
              <Col span={12}>{form.getFieldValue('description') || '-'}</Col>

              <Col span={12}>
                <strong>{__('Status:', 'kelune-crm')}</strong>
              </Col>
              <Col span={12}>
                {editingAutomation ? (
                  <span style={{ textTransform: 'capitalize' }}>
                    {editingAutomation.status || __('Draft', 'kelune-crm')}
                  </span>
                ) : (
                  __('Draft', 'kelune-crm')
                )}
              </Col>
            </Row>
          </Card>
        </>
      ),
    },
  ];

  const isLastStep = currentStep === steps.length - 1;
  const modalFooter = (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Space>
        {!isLastStep && (
          <Button type="primary" onClick={handleNext}>
            {__('Next', 'kelune-crm')}
          </Button>
        )}
        {isLastStep && (
          <Button
            type="primary"
            onClick={() => handleSubmit(false)}
            loading={loading}
          >
            {editingAutomation
              ? __('Update Automation', 'kelune-crm')
              : __('Create Automation', 'kelune-crm')}
          </Button>
        )}
        {currentStep > 0 && (
          <Button onClick={handlePrev}>{__('Previous', 'kelune-crm')}</Button>
        )}
        <Button onClick={onCancel}>{__('Cancel', 'kelune-crm')}</Button>
      </Space>
      {isLastStep && (
        <Button
          type="primary"
          ghost
          onClick={() => handleSubmit(true)}
          loading={loading}
        >
          {__('Build Workflow', 'kelune-crm')}
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      centered
      title={
        editingAutomation
          ? __('Edit Automation', 'kelune-crm')
          : __('Create New Automation', 'kelune-crm')
      }
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={800}
      destroyOnHidden
    >
      <Steps current={currentStep} style={{ marginBottom: 24 }}>
        {steps.map((step) => (
          <Step key={step.title} title={step.title} icon={step.icon} />
        ))}
      </Steps>

      <Form
        form={form}
        layout="vertical"
        preserve={true}
        initialValues={{
          name: '',
          description: '',
          trigger_type: undefined,
          trigger_config: {},
          entry_conditions: {},
          status: 'draft',
          settings: {
            allow_reentry: false,
            reentry_wait_unit: 'days',
          },
        }}
      >
        {steps[currentStep].content}

        {modalFooter}
      </Form>
    </Modal>
  );
};

export default AutomationForm;
