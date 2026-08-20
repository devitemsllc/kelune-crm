import React, { useEffect } from 'react';
import { Form, Input, Modal } from 'antd';
import { __ } from '@wordpress/i18n';
import ModalFooter from '../common/ModalFooter';
import SubmitOnEnter from '../common/SubmitOnEnter';
import type { EmailTemplate } from '@/types/models';

export interface TemplateInfoValues {
  name: string;
  description?: string;
}

interface TemplateInfoModalProps {
  open: boolean;
  /** The template whose info is edited; omit for the create flow. */
  template?: EmailTemplate | null;
  onCancel: () => void;
  onSubmit: (values: TemplateInfoValues) => void | Promise<void>;
}

// A template's name + description: collected once when creating from the list,
// and edited later from the builder's Settings action. Persisting is the host's
// job — this only validates and hands back the values.
const TemplateInfoModal = ({
  open,
  template = null,
  onCancel,
  onSubmit,
}: TemplateInfoModalProps) => {
  const [form] = Form.useForm<TemplateInfoValues>();

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (template) {
      form.setFieldsValue({
        name: template.name ?? '',
        description: template.description ?? '',
      });
    }
  }, [open, template, form]);

  const handleSubmit = async () => {
    let values: TemplateInfoValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    await onSubmit(values);
  };

  return (
    <Modal
      destroyOnHidden
      centered
      title={
        template
          ? __('Edit Template Info', 'kelune-crm')
          : __('Create Template', 'kelune-crm')
      }
      open={open}
      onCancel={onCancel}
      footer={
        <ModalFooter
          onCancel={onCancel}
          onOk={handleSubmit}
          okText={
            template ? __('Update', 'kelune-crm') : __('Create', 'kelune-crm')
          }
        />
      }
    >
      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          label={__('Template Name', 'kelune-crm')}
          name="name"
          rules={[
            {
              required: true,
              message: __('Please enter template name', 'kelune-crm'),
            },
            {
              min: 3,
              message: __('Name must be at least 3 characters', 'kelune-crm'),
            },
          ]}
        >
          <Input placeholder={__('e.g., Welcome Email', 'kelune-crm')} />
        </Form.Item>
        <Form.Item
          label={__('Description', 'kelune-crm')}
          name="description"
          style={{ marginBottom: 0 }}
        >
          <Input.TextArea
            rows={3}
            placeholder={__('Describe this template', 'kelune-crm')}
          />
        </Form.Item>
        <SubmitOnEnter />
      </Form>
    </Modal>
  );
};

export default TemplateInfoModal;
