import React, { useState } from 'react';
import { Button, Modal, Form, Input, message } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import type { FormInstance } from 'antd';
import ModalFooter from '../common/ModalFooter';
import api from '../../services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import SubmitOnEnter from '../common/SubmitOnEnter';

interface SendStepTestEmailProps {
  /** The step form whose action_config (subject/body/preview/sender) is tested. */
  form: FormInstance;
}

/**
 * "Send Test" control for a send_email automation step, shown in the step
 * drawer's header on the Review step. Posts the step's live action_config to a
 * stateless endpoint so an unsaved step can be previewed in a real inbox — the
 * automation equivalent of the campaign wizard's Send Test.
 */
const SendStepTestEmail = ({ form }: SendStepTestEmailProps) => {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [modalForm] = Form.useForm();

  const handleSend = async (values: { test_email: string }) => {
    const actionConfig = (form.getFieldValue('action_config') ?? {}) as Record<
      string,
      unknown
    >;
    if (!actionConfig.body) {
      message.warning(
        __('Add email content before sending a test.', 'kelune-crm')
      );
      return;
    }
    setSending(true);
    try {
      await api.automations.testEmail(values.test_email, actionConfig);
      message.success(__('Test email sent successfully', 'kelune-crm'));
      setOpen(false);
      modalForm.resetFields();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to send test email', 'kelune-crm'))
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button icon={<SendOutlined />} onClick={() => setOpen(true)}>
        {__('Send Test', 'kelune-crm')}
      </Button>

      <Modal
        destroyOnHidden
        centered
        title={__('Send Test Email', 'kelune-crm')}
        open={open}
        onCancel={() => setOpen(false)}
        footer={
          <ModalFooter
            okText={__('Send Test', 'kelune-crm')}
            onOk={() => modalForm.submit()}
            confirmLoading={sending}
            onCancel={() => setOpen(false)}
          />
        }
      >
        <Form layout="vertical" form={modalForm} onFinish={handleSend}>
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
    </>
  );
};

export default SendStepTestEmail;
