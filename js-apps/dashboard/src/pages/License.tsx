import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  FileTextOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  Flex,
  Layout,
  Popconfirm,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd';
import { __ } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import { setLicense } from '@store/slices/licenseSlice';
import useScreens from '@hooks/useScreens';
import { useLicense } from '@hooks/useLicense';
import api from '@/services/api';
import ActivateForm from '@components/license/ActivateForm';
import { getErrorMessage } from '@utils/getErrorMessage';
import { calendarFormat } from '@utils/time';

const { Content } = Layout;
const { Text, Title } = Typography;

const HELP_URL = 'https://kelunecrm.com';
const DOCS_URL = 'https://kelunecrm.com/docs/';

interface LicenseRow {
  key: string;
  label: string;
  value: ReactNode;
}

/**
 * Manage License. Shows the activation form until a valid license is stored,
 * then the license detail table with a deactivate action. Reached at #/license,
 * and the only route available while Pro is active but unlicensed.
 */
const License = () => {
  const dispatch = useDispatch();
  const screens = useScreens();
  const { token } = theme.useToken();
  const { getLicense, isLicenseActive } = useLicense();
  const [isLoading, setIsLoading] = useState(false);

  const { colorBgContainer, borderRadiusLG } = token;

  const data = getLicense();
  const isActive = isLicenseActive();

  const handleDeactivate = async () => {
    setIsLoading(true);
    try {
      const response = await api.license.deactivate();
      dispatch(setLicense(response.data));
      message.success(__('Successfully deactivated.', 'kelune-crm'));
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('The license could not be deactivated.', 'kelune-crm')
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const tableCols = [
    {
      dataIndex: 'label',
      key: 'label',
      render: (value: string, record: LicenseRow) => (
        <Space direction="vertical">
          <Text style={{ fontWeight: 500 }}>{value}</Text>
          {screens.xs || screens.sm ? (
            <Text type="secondary">{record.value}</Text>
          ) : null}
        </Space>
      ),
    },
    {
      dataIndex: 'value',
      key: 'value',
      responsive: ['md' as const],
    },
  ];

  const tableBody: LicenseRow[] = data
    ? [
        {
          key: '1',
          label: __('License Status', 'kelune-crm'),
          value: data.is_valid ? (
            <Tag color="#87d068">{__('Valid', 'kelune-crm')}</Tag>
          ) : (
            <Tag color="#ff5500">{__('Invalid', 'kelune-crm')}</Tag>
          ),
        },
        {
          key: '2',
          label: __('License Type', 'kelune-crm'),
          value: data.license_title || '',
        },
        {
          key: '3',
          label: __('License Expired on', 'kelune-crm'),
          value: calendarFormat(data.expire_date),
        },
        {
          key: '4',
          label: __('Support Expired on', 'kelune-crm'),
          value: calendarFormat(data.support_end),
        },
        {
          key: '5',
          label: __('Your License Key', 'kelune-crm'),
          value: data.license_key || '',
        },
      ]
    : [];

  return (
    <Layout
      style={{
        background: 'transparent',
        minHeight: screens.wps ? 'calc(100vh - 265px)' : 'calc(100vh - 210px)',
        padding: '16px 0',
      }}
    >
      <Content style={{ padding: '0 16px' }}>
        <Flex
          justify="center"
          align="center"
          style={{
            minHeight: screens.wps
              ? 'calc(100vh - 297px)'
              : 'calc(100vh - 242px)',
          }}
        >
          <Layout
            style={{
              padding: '24px',
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              maxWidth: '782px',
              width: '100%',
            }}
          >
            <Content>
              <Row
                gutter={16}
                justify="space-between"
                align="middle"
                style={{ paddingBottom: '8px', marginBottom: '8px' }}
              >
                <Col style={{ paddingBottom: '8px' }}>
                  <Title level={5} style={{ fontSize: '18px', margin: 0 }}>
                    {isActive
                      ? __('License Details', 'kelune-crm')
                      : __('Enter License', 'kelune-crm')}
                  </Title>
                </Col>
                <Col style={{ paddingBottom: '8px' }}>
                  <Space>
                    <Tooltip
                      title={
                        <Space align="center">
                          <QuestionCircleOutlined />
                          <span>{__('Learn more', 'kelune-crm')}</span>
                        </Space>
                      }
                    >
                      <Button
                        icon={<QuestionCircleOutlined />}
                        href={HELP_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    </Tooltip>
                    <Tooltip
                      title={
                        <Space align="center">
                          <FileTextOutlined />
                          <span>{__('Documentation', 'kelune-crm')}</span>
                        </Space>
                      }
                    >
                      <Button
                        icon={<FileTextOutlined />}
                        href={DOCS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    </Tooltip>
                  </Space>
                </Col>
              </Row>
              <Row>
                <Col span={24}>
                  <Card
                    size="small"
                    styles={{ body: { padding: '20px 24px 24px 24px' } }}
                  >
                    <Spin spinning={isLoading} style={{ maxHeight: 'unset' }}>
                      {isActive ? (
                        <>
                          <Table<LicenseRow>
                            columns={tableCols}
                            dataSource={tableBody}
                            pagination={false}
                            bordered={false}
                            showHeader={false}
                            size="small"
                            className="kelune-crm-cc-license-table"
                          />
                          <Popconfirm
                            title={__('Deactivate license', 'kelune-crm')}
                            description={__(
                              'Are you sure want to deactivate license?',
                              'kelune-crm'
                            )}
                            onConfirm={handleDeactivate}
                            okText={__('Yes', 'kelune-crm')}
                            cancelText={__('No', 'kelune-crm')}
                            icon={
                              <InfoCircleOutlined
                                style={{ color: '#ff4d4f' }}
                              />
                            }
                            overlayStyle={{ maxWidth: '300px' }}
                          >
                            <Button
                              color="danger"
                              variant="solid"
                              style={{ marginTop: '24px' }}
                            >
                              {__('Deactivate License', 'kelune-crm')}
                            </Button>
                          </Popconfirm>
                        </>
                      ) : (
                        <ActivateForm setIsLoading={setIsLoading} />
                      )}
                    </Spin>
                  </Card>
                </Col>
              </Row>
            </Content>
          </Layout>
        </Flex>
      </Content>
    </Layout>
  );
};

export default License;
