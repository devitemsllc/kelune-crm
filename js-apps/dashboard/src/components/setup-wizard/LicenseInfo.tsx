import { ArrowRightOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Input,
  Row,
  Typography,
} from 'antd';
import { __ } from '@wordpress/i18n';
import { useLicense } from '@hooks/useLicense';

const { Paragraph } = Typography;

const DOCS_URL = 'https://kelunecrm.com/docs/';

interface LicenseInfoProps {
  nextStep: () => void;
}

/**
 * Setup wizard, license step — the already-licensed state. Confirms the key on
 * file and moves on; anything more belongs on the Manage License page.
 */
const LicenseInfo = ({ nextStep }: LicenseInfoProps) => {
  const { getLicense } = useLicense();

  return (
    <>
      <Card
        size="small"
        style={{ border: 'none' }}
        styles={{ body: { padding: 0, borderRadius: 0 } }}
      >
        <Row justify="center">
          <Col flex="none" style={{ width: '440px', maxWidth: '100%' }}>
            <Alert
              message={__('License Activated & Valid', 'kelune-crm')}
              type="success"
              style={{
                textAlign: 'center',
                margin: '0 0 8px 0',
                border: 'none',
              }}
            />
            <Input
              readOnly
              value={getLicense()?.license_key ?? ''}
              style={{
                background: '#f9f9f9',
                color: 'rgba(0, 0, 0, 0.75)',
                textAlign: 'center',
                padding: '11px',
              }}
            />
            <Paragraph
              style={{
                color: 'rgba(0, 0, 0, 0.45)',
                textAlign: 'center',
                margin: '8px 0 0 0',
              }}
            >
              {__(
                'You can manage your license settings after completing the setup.',
                'kelune-crm'
              )}
            </Paragraph>
          </Col>
        </Row>
      </Card>
      <Divider style={{ margin: '32px 0 24px 0' }} />
      <Row gutter={16} justify="space-between">
        <Col flex="none">
          <Button href={DOCS_URL} target="_blank" rel="noopener noreferrer">
            {__('Help & Docs', 'kelune-crm')}
          </Button>
        </Col>
        <Col flex="none">
          <Button
            icon={<ArrowRightOutlined />}
            iconPosition="end"
            type="primary"
            onClick={nextStep}
          >
            {__('Continue Setup', 'kelune-crm')}
          </Button>
        </Col>
      </Row>
    </>
  );
};

export default LicenseInfo;
