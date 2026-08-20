import { ArrowRightOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Col,
  Divider,
  Form,
  Input,
  Row,
  Space,
  Typography,
  message,
} from 'antd';
import { __ } from '@wordpress/i18n';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

// Temporarily suppressed for the initial WordPress.org plugin review; the
// detection (window.kelunecrm.permalinks_plain) and the notice itself stay
// wired up — flip this to true to surface the pretty-permalink nudge again.
const SHOW_PERMALINK_NOTICE = false;

interface WelcomeStepProps {
  setIsLoading: (value: boolean) => void;
  nextStep: () => void;
  skipSetup: () => void;
}

/** Business-identity fields seeded from the settings blob shipped at boot. */
const initialIdentity = () => {
  const settings = window.kelunecrm?.settings ?? {};
  return {
    business_name:
      typeof settings.business_name === 'string' ? settings.business_name : '',
    business_address:
      typeof settings.business_address === 'string'
        ? settings.business_address
        : '',
  };
};

/**
 * Wizard step 1 — welcome + the three core business-identity settings (logo,
 * name, address). Saving persists them via the settings endpoint (partial merge)
 * before advancing.
 */
const WelcomeStep = ({
  setIsLoading,
  nextStep,
  skipSetup,
}: WelcomeStepProps) => {
  const [form] = Form.useForm();

  const onFinish = async (values: Record<string, unknown>) => {
    setIsLoading(true);
    try {
      await api.settings.update(values);
      message.success(__('Settings saved successfully', 'kelune-crm'));
      nextStep();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to save settings', 'kelune-crm'))
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Row>
      <Col span={24} style={{ marginBottom: '32px' }}>
        <Title
          level={5}
          style={{ fontSize: '26px', textAlign: 'center', margin: '0 0 8px 0' }}
        >
          {__('Welcome to Kelune CRM', 'kelune-crm')}
        </Title>
        <Paragraph
          style={{
            fontSize: '16px',
            color: 'rgba(0, 0, 0, 0.45)',
            textAlign: 'center',
            padding: '0 16px',
            margin: 0,
          }}
        >
          {__(
            'Thank you for choosing Kelune CRM. This quick setup wizard will guide you through the basic configuration to get your CRM ready.',
            'kelune-crm'
          )}
        </Paragraph>
      </Col>
      <Col span={24}>
        <Form
          form={form}
          name="setupWelcome"
          layout="vertical"
          onFinish={onFinish}
          initialValues={initialIdentity()}
          autoComplete="off"
        >
          <Row justify="center">
            <Col flex="none" style={{ width: '500px', maxWidth: '100%' }}>
              {SHOW_PERMALINK_NOTICE && window.kelunecrm?.permalinks_plain ? (
                <Alert
                  type="warning"
                  style={{ marginBottom: 24, border: 'none' }}
                  message={
                    <span>
                      {__(
                        'Your permalink structure is set to Plain. Some features require pretty permalinks to work properly. Please',
                        'kelune-crm'
                      )}{' '}
                      <a
                        href={`${window.kelunecrm?.admin_url ?? '/wp-admin/'}options-permalink.php`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {__('update your permalink settings', 'kelune-crm')}
                      </a>{' '}
                      {__('before continuing.', 'kelune-crm')}
                    </span>
                  }
                />
              ) : null}

              <Form.Item
                label={__('Business Name', 'kelune-crm')}
                name="business_name"
                rules={[
                  {
                    required: true,
                    message: __(
                      'Please enter your business name',
                      'kelune-crm'
                    ),
                  },
                ]}
                tooltip={__(
                  'Used in your email footer and on public pages.',
                  'kelune-crm'
                )}
              >
                <Input />
              </Form.Item>

              <Form.Item
                label={__('Business Full Address', 'kelune-crm')}
                name="business_address"
                style={{ marginBottom: 0 }}
                tooltip={__(
                  'A postal address in marketing emails is required by anti-spam law in most countries. Insert it with the {{business_address}} merge tag.',
                  'kelune-crm'
                )}
              >
                <TextArea rows={3} />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '32px 0 24px 0' }} />

          <Row gutter={16} justify="space-between">
            <Col flex="none">
              <Button
                color="default"
                variant="outlined"
                htmlType="button"
                onClick={skipSetup}
              >
                {__('Skip All', 'kelune-crm')}
              </Button>
            </Col>
            <Col flex="none">
              <Space>
                <Button
                  color="primary"
                  variant="text"
                  htmlType="button"
                  onClick={nextStep}
                >
                  {__('Skip', 'kelune-crm')}
                </Button>
                <Button
                  icon={<ArrowRightOutlined />}
                  iconPosition="end"
                  type="primary"
                  htmlType="submit"
                >
                  {__('Next', 'kelune-crm')}
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Col>
    </Row>
  );
};

export default WelcomeStep;
