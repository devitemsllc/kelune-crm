import { Col, Row, Typography } from 'antd';
import { __ } from '@wordpress/i18n';
import { useLicense } from '@hooks/useLicense';
import LicenseForm from './LicenseForm';
import LicenseInfo from './LicenseInfo';

const { Title, Paragraph } = Typography;

interface LicenseStepProps {
  setIsLoading: (value: boolean) => void;
  nextStep: () => void;
}

/**
 * Setup wizard, first step when the Pro add-on is active: activate the license
 * before configuring anything. There is no skip — an unlicensed Pro install has
 * nothing but this screen anyway.
 */
const LicenseStep = ({ setIsLoading, nextStep }: LicenseStepProps) => {
  const { isLicenseActive, isLicenseValid } = useLicense();

  return (
    <Row>
      <Col span={24} style={{ marginBottom: '32px' }}>
        <Title
          level={5}
          style={{ fontSize: '26px', textAlign: 'center', margin: '0 0 8px 0' }}
        >
          {__('Welcome to Kelune CRM Pro', 'kelune-crm')}
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
            'Activate your license to unlock the Pro features and receive updates. This quick setup wizard will then guide you through the basic configuration.',
            'kelune-crm'
          )}
        </Paragraph>
      </Col>
      <Col span={24}>
        {isLicenseActive() && isLicenseValid() ? (
          <LicenseInfo nextStep={nextStep} />
        ) : (
          <LicenseForm setIsLoading={setIsLoading} nextStep={nextStep} />
        )}
      </Col>
    </Row>
  );
};

export default LicenseStep;
