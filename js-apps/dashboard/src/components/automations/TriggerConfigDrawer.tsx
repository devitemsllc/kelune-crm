import React, { useEffect } from 'react';
import { Drawer, Form } from 'antd';
import { __ } from '@wordpress/i18n';
import ModalFooter from '../common/ModalFooter';
import SubmitOnEnter from '../common/SubmitOnEnter';
import TriggerFields from './TriggerFields';
import { buildEntryConditions } from './triggerTypes';
import type { EnrollmentSettings } from './triggerTypes';
import type { Automation } from '@/types/models';

/** The record fields this drawer owns: what enrols contacts, and how often. */
export interface TriggerValues {
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  entry_conditions: Record<string, unknown>;
}

interface TriggerConfigDrawerProps {
  open: boolean;
  automation?: Automation | null;
  onClose: () => void;
  onSubmit: (values: TriggerValues) => void | Promise<void>;
}

interface FormValues {
  trigger_type?: string;
  trigger_config?: Record<string, unknown>;
  settings?: EnrollmentSettings;
}

// Ids can arrive as strings — coerce so the numeric Select options match and the
// control shows the label rather than the raw id.
const num = (value: unknown): number | undefined =>
  value == null || value === '' ? undefined : Number(value);

/**
 * The canvas trigger node's editor, opened the same way every other step is.
 * It owns enrolment end to end — what fires it and whether a contact may run
 * through more than once — so the trigger has exactly one editor once the
 * automation exists.
 */
const TriggerConfigDrawer = ({
  open,
  automation = null,
  onClose,
  onSubmit,
}: TriggerConfigDrawerProps) => {
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (!open) return;
    // Reset first: setFieldsValue only shallow-merges, so a previous trigger's
    // nested config would otherwise leak into the next one.
    form.resetFields();

    const config =
      (automation?.trigger_config as Record<string, unknown>) || {};
    const entryConditions =
      (automation?.entry_conditions as Record<string, unknown>) || {};
    const reentry =
      (entryConditions.reentry as Record<string, unknown>) || entryConditions;

    form.setFieldsValue({
      trigger_type: automation?.trigger_type,
      trigger_config: {
        ...config,
        tag_id: num(config.tag_id),
        list_id: num(config.list_id),
      },
      settings: {
        allow_reentry: Boolean(reentry.allow),
        reentry_wait_value: (reentry.wait_value as number | string) ?? '',
        reentry_wait_unit: (reentry.wait_unit as string) || 'days',
      },
    });
  }, [open, automation, form]);

  const handleSubmit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    await onSubmit({
      trigger_type: values.trigger_type ?? '',
      trigger_config: values.trigger_config ?? {},
      entry_conditions: buildEntryConditions(
        values.settings,
        (automation?.entry_conditions as Record<string, unknown>) || {}
      ),
    });
  };

  return (
    <Drawer
      destroyOnHidden
      title={__('Trigger', 'kelune-crm')}
      placement="right"
      width={720}
      open={open}
      onClose={onClose}
      footer={
        <ModalFooter
          okText={__('Save', 'kelune-crm')}
          onOk={handleSubmit}
          onCancel={onClose}
        />
      }
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          trigger_config: {},
          settings: { allow_reentry: false, reentry_wait_unit: 'days' },
        }}
      >
        <TriggerFields form={form} />
        <SubmitOnEnter />
      </Form>
    </Drawer>
  );
};

export default TriggerConfigDrawer;
