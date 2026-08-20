import { Button, Col, Flex, Image, Row, Typography } from 'antd';
import { __ } from '@wordpress/i18n';
import congratsImage from '@/assets/img/congrats.png';

const { Title } = Typography;

interface FinishedStepProps {
  /** Leave the wizard and land on the dashboard. */
  onDone: () => void;
}

/** Wizard step 4 — congratulations screen. */
const FinishedStep = ({ onDone }: FinishedStepProps) => {
  return (
    <Row>
      <Col span={24} style={{ textAlign: 'center', marginBottom: '24px' }}>
        <Image src={congratsImage} preview={false} />
      </Col>
      <Col span={24}>
        <Title
          level={5}
          style={{
            fontSize: '22px',
            fontWeight: 400,
            color: 'rgba(0, 0, 0, 0.75)',
            textAlign: 'center',
            margin: '0 0 16px 0',
          }}
        >
          {__('Your setup has been successfully completed!', 'kelune-crm')}
        </Title>
        <Flex gap="8px 0" align="center" justify="center" vertical wrap>
          <Button
            type="primary"
            className="kelune-crm-cc-btn-anchor-primary"
            style={{ padding: '9px 25px', height: '42px' }}
            href="#/dashboard"
            onClick={onDone}
          >
            {__('Go to Dashboard', 'kelune-crm')}
          </Button>
        </Flex>
      </Col>
    </Row>
  );
};

export default FinishedStep;
