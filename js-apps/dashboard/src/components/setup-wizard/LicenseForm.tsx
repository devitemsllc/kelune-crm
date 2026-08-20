import { useState } from 'react';
import { ArrowRightOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Row,
  Typography,
  message,
} from 'antd';
import { __ } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import { setLicense } from '@store/slices/licenseSlice';
import api from '@/services/api';
import { licenseEmail } from '@utils/license';
import { getErrorMessage } from '@utils/getErrorMessage';

const { Paragraph } = Typography;

const DOCS_URL = 'https://kelunecrm.com/docs/';

interface LicenseFormProps {
  setIsLoading: (value: boolean) => void;
  nextStep: () => void;
}

interface LicenseFormValues {
  license_key?: string;
}

/**
 * Setup wizard, license step — the unlicensed state. The email is not asked for
 * here: the site admin address carries the activation, and it can be changed
 * later on the Manage License page. Activating advances the wizard.
 */
const LicenseForm = ({ setIsLoading, nextStep }: LicenseFormProps) => {
  const dispatch = useDispatch();
  const [form] = Form.useForm<LicenseFormValues>();
  const [errorMessage, setErrorMessage] = useState('');

  const onFinish = async (values: LicenseFormValues) => {
    setIsLoading(true);
    try {
      const response = await api.license.activate(
        values.license_key?.trim() ?? '',
        licenseEmail()
      );
      setErrorMessage('');
      dispatch(setLicense(response.data));
      message.success(__('Successfully activated.', 'kelune-crm'));
      nextStep();
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
      name="setupLicenseForm"
      layout="vertical"
      autoComplete="off"
      onFinish={onFinish}
      initialValues={{ license_key: '' }}
    >
      <Card
        size="small"
        style={{ border: 'none' }}
        styles={{ body: { padding: 0, borderRadius: 0 } }}
      >
        <Row justify="center">
          <Col flex="none" style={{ width: '440px', maxWidth: '100%' }}>
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
                <Alert
                  message={__('Enter Your License Key', 'kelune-crm')}
                  type="info"
                  style={{
                    textAlign: 'center',
                    margin: '0 0 8px 0',
                    border: 'none',
                  }}
                />
                <Form.Item
                  name="license_key"
                  rules={[{ required: true, whitespace: true, message: '' }]}
                  style={{ textAlign: 'center', margin: 0 }}
                >
                  <Input
                    placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                    style={{ textAlign: 'center', padding: '11px' }}
                  />
                </Form.Item>
                <Paragraph
                  style={{
                    color: 'rgba(0, 0, 0, 0.45)',
                    textAlign: 'center',
                    margin: '8px 0 0 0',
                  }}
                >
                  {__(
                    'Please enter your license key to activate.',
                    'kelune-crm'
                  )}
                </Paragraph>
              </Col>
            </Row>
          </Col>
        </Row>
      </Card>
      <Divider style={{ margin: '32px 0 24px 0' }} />
      <Row gutter={16} justify="space-between">
        <Col flex="none">
          <Button
            htmlType="button"
            href={DOCS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {__('Help & Docs', 'kelune-crm')}
          </Button>
        </Col>
        <Col flex="none">
          <Button
            icon={<ArrowRightOutlined />}
            iconPosition="end"
            type="primary"
            htmlType="submit"
          >
            {__('Activate & Continue', 'kelune-crm')}
          </Button>
        </Col>
      </Row>
    </Form>
  );
};

export default LicenseForm;
