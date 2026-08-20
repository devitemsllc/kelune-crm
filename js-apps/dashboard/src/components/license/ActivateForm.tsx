import { useState } from 'react';
import { Alert, Button, Col, Form, Input, Row, Space, message } from 'antd';
import { __ } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import { setLicense } from '@store/slices/licenseSlice';
import api from '@/services/api';
import { licenseEmail } from '@utils/license';
import { getErrorMessage } from '@utils/getErrorMessage';

interface ActivateFormProps {
  setIsLoading: (value: boolean) => void;
}

interface ActivateFormValues {
  license_key?: string;
  license_email?: string;
}

/**
 * License activation form on the Manage License page. A rejected key is shown
 * inline (the server's own wording is the useful part), while a successful
 * activation drops the whole form and re-renders the page as the info table.
 */
const ActivateForm = ({ setIsLoading }: ActivateFormProps) => {
  const dispatch = useDispatch();
  const [form] = Form.useForm<ActivateFormValues>();
  const [errorMessage, setErrorMessage] = useState('');

  // Nothing to submit until a key is typed.
  const keyValue = Form.useWatch('license_key', form);

  const onFinish = async (values: ActivateFormValues) => {
    setIsLoading(true);
    try {
      const response = await api.license.activate(
        values.license_key?.trim() ?? '',
        values.license_email?.trim() ?? ''
      );
      setErrorMessage('');
      dispatch(setLicense(response.data));
      message.success(__('Successfully activated.', 'kelune-crm'));
    } catch (error) {
      setErrorMessage(
        getErrorMessage(
          error,
          __('The license key could not be activated.', 'kelune-crm')
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Form
      form={form}
      name="licenseActivateForm"
      layout="vertical"
      autoComplete="off"
      onFinish={onFinish}
      initialValues={{ license_key: '', license_email: licenseEmail() }}
    >
      <Row>
        {errorMessage ? (
          <Col span={24}>
            <Alert
              message={errorMessage}
              type="error"
              closable
              afterClose={() => setErrorMessage('')}
              style={{ marginBottom: '24px', border: 'none' }}
            />
          </Col>
        ) : null}
        <Col span={24}>
          <Form.Item
            label={__('License Code', 'kelune-crm')}
            name="license_key"
            rules={[
              {
                required: true,
                whitespace: true,
                message: __('License code is required.', 'kelune-crm'),
              },
            ]}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Form.Item
            label={__('Email Address', 'kelune-crm')}
            name="license_email"
            rules={[
              {
                required: true,
                whitespace: true,
                message: __('Email address is required.', 'kelune-crm'),
              },
              {
                type: 'email',
                message: __('Enter a valid email address.', 'kelune-crm'),
              },
            ]}
          >
            <Input />
          </Form.Item>
        </Col>
        <Col span={24}>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              disabled={!keyValue?.trim()}
            >
              {__('Activate License', 'kelune-crm')}
            </Button>
          </Space>
        </Col>
      </Row>
    </Form>
  );
};

export default ActivateForm;
