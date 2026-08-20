import React, { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';
import { __ } from '@wordpress/i18n';
import ModalFooter from '../common/ModalFooter';
import SubmitOnEnter from '../common/SubmitOnEnter';
import TriggerFields from './TriggerFields';
import { buildEntryConditions } from './triggerTypes';
import type { EnrollmentSettings } from './triggerTypes';
import type { Automation } from '@/types/models';

const { TextArea } = Input;

/**
 * The payload the host persists. Editing sends the name and description alone,
 * so the trigger and re-entry policy the drawer owns survive the partial update.
 */
export interface AutomationInfoValues {
  name: string;
  description: string;
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  entry_conditions?: Record<string, unknown>;
}

interface AutomationInfoModalProps {
  open: boolean;
  /** The automation being edited; omit for the create flow. */
  automation?: Automation | null;
  onCancel: () => void;
  onSubmit: (values: AutomationInfoValues) => void | Promise<void>;
}

interface FormValues {
  name?: string;
  description?: string;
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  settings?: EnrollmentSettings;
}

/**
 * An automation's name and description. Creating also collects the trigger,
 * because the record cannot be created without one; from then on the trigger
 * and its enrolment rules are edited on the canvas, in the trigger drawer.
 */
const AutomationInfoModal = ({
  open,
  automation = null,
  onCancel,
  onSubmit,
}: AutomationInfoModalProps) => {
  const [form] = Form.useForm<FormValues>();
  const isEditing = Boolean(automation);

  useEffect(() => {
    if (!open) return;
    form.resetFields();

    if (!automation) return;

    form.setFieldsValue({
      name: automation.name ?? '',
      description: automation.description ?? '',
    });
  }, [open, automation, form]);

  const handleSubmit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    const base = {
      name: values.name ?? '',
      description: values.description ?? '',
    };

    await onSubmit(
      isEditing
        ? base
        : {
            ...base,
            trigger_type: values.trigger_type ?? '',
            trigger_config: values.trigger_config ?? {},
            entry_conditions: buildEntryConditions(values.settings),
          }
    );
  };

  return (
    <Modal
      destroyOnHidden
      centered
      width={600}
      title={
        isEditing
          ? __('Edit Automation Info', 'kelune-crm')
          : __('Create Automation', 'kelune-crm')
      }
      open={open}
      onCancel={onCancel}
      footer={
        <ModalFooter
          onCancel={onCancel}
          onOk={handleSubmit}
          okText={
            isEditing ? __('Update', 'kelune-crm') : __('Create', 'kelune-crm')
          }
        />
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          name: '',
          description: '',
          trigger_type: undefined,
          trigger_config: {},
          settings: { allow_reentry: false, reentry_wait_unit: 'days' },
        }}
      >
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

        <Form.Item
          label={__('Description', 'kelune-crm')}
          name="description"
          style={isEditing ? { marginBottom: 0 } : undefined}
        >
          <TextArea
            rows={3}
            placeholder={__(
              'Describe what this automation does...',
              'kelune-crm'
            )}
          />
        </Form.Item>

        {/* The backend refuses a create without a trigger, so enrolment is set
            up once here. Editing it afterwards belongs to the canvas. */}
        {!isEditing && <TriggerFields form={form} />}

        <SubmitOnEnter />
      </Form>
    </Modal>
  );
};

export default AutomationInfoModal;
