import { useState } from 'react';
import {
  ArrowRightOutlined,
  DeleteOutlined,
  MinusCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Row,
  Space,
  Typography,
  message,
} from 'antd';
import type { FormInstance } from 'antd';
import type { AxiosResponse } from 'axios';
import { __ } from '@wordpress/i18n';
import type { ID } from '@/types/models';
import { getErrorMessage } from '@/utils/getErrorMessage';
import ActionConfirm from '@/components/common/ActionConfirm';

const { Title, Paragraph } = Typography;

/** A single editable row in the wizard's list/tag creator. */
export interface SetupItem {
  /** Existing record id, or '0'/0 for a not-yet-created row. */
  id?: ID | string;
  /** The list/tag name. */
  name?: string;
}

/** The minimal API surface the step needs — satisfied by api.lists / api.tags. */
interface ItemsApi {
  create: (data: { name: string }) => Promise<AxiosResponse<unknown>>;
  update: (id: ID, data: { name: string }) => Promise<AxiosResponse<unknown>>;
  delete: (id: ID) => Promise<AxiosResponse<unknown>>;
}

interface ItemsStepProps {
  form: FormInstance;
  existingData: SetupItem[];
  api: ItemsApi;
  title: string;
  description: string;
  /** Placeholder for an empty row, e.g. "List 1" — receives the row number. */
  placeholder: (index: number) => string;
  addLabel: string;
  requiredMessage: string;
  savedMessage: string;
  setIsLoading: (value: boolean) => void;
  nextStep: () => void;
  prevStep: () => void;
  skipSetup: () => void;
  /** Refetch the page's list/tag data so a later Back shows what was stored. */
  reloadData: () => Promise<void>;
}

/**
 * Shared step body for the Lists and Tags wizard screens: a Form.List of name
 * inputs where existing records show a confirm-delete button and new rows show a
 * remove button. On save it upserts every non-empty row (create when it has no
 * id, update otherwise), then advances. Mirrors the support-genix category/tag
 * setup steps.
 */
const ItemsStep = ({
  form,
  existingData,
  api,
  title,
  description,
  placeholder,
  addLabel,
  requiredMessage,
  savedMessage,
  setIsLoading,
  nextStep,
  prevStep,
  skipSetup,
  reloadData,
}: ItemsStepProps) => {
  const [errorMessage, setErrorMessage] = useState('');

  const onFormFinish = async (values: { items?: SetupItem[] }) => {
    const items = (values.items ?? []).filter((item) =>
      (item?.name ?? '').trim()
    );

    if (items.length === 0) {
      setErrorMessage(requiredMessage);
      return;
    }

    setErrorMessage('');
    setIsLoading(true);
    try {
      await Promise.all(
        items.map((item) => {
          const id = Number(item.id) || 0;
          const name = (item.name ?? '').trim();
          return id ? api.update(id, { name }) : api.create({ name });
        })
      );
      message.success(savedMessage);
      // Refetch so the page's data reflects the just-created/updated records
      // (new rows now carry real ids) before we advance — a later Back shows
      // exactly what is stored in the database.
      await reloadData();
      nextStep();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Something went wrong', 'kelune-crm'))
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = async (id: ID, remove: () => void) => {
    setIsLoading(true);
    try {
      await api.delete(id);
      remove();
      // Keep the page's data in sync so Back never resurrects a deleted row.
      await reloadData();
      message.success(__('Deleted successfully', 'kelune-crm'));
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete', 'kelune-crm'))
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
          style={{
            fontSize: '26px',
            textAlign: 'center',
            margin: '0 0 8px 0',
          }}
        >
          {title}
        </Title>
        <Row justify="center">
          <Col flex="none" style={{ width: '500px', maxWidth: '100%' }}>
            <Paragraph
              style={{
                fontSize: '16px',
                color: 'rgba(0, 0, 0, 0.45)',
                textAlign: 'center',
                padding: 0,
                margin: 0,
              }}
            >
              {description}
            </Paragraph>
          </Col>
        </Row>
      </Col>
      <Col span={24}>
        <Form
          form={form}
          name={`createSetup-${title}`}
          layout="vertical"
          onFinish={onFormFinish}
          initialValues={{ items: existingData }}
          autoComplete="off"
        >
          <Card
            size="small"
            style={{ border: 'none' }}
            styles={{
              header: { background: '#fafafa' },
              body: { padding: 0, borderRadius: 0 },
            }}
          >
            <Row justify="center">
              <Col flex="none" style={{ width: '500px', maxWidth: '100%' }}>
                <Row gutter={16}>
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
                    <Form.List name="items">
                      {(fields, { add, remove }) => (
                        <>
                          {fields.map((field, index) => {
                            const itemId = Number(
                              form.getFieldValue('items')?.[field.name]?.id || 0
                            );

                            return (
                              <Row
                                key={field.key}
                                gutter={8}
                                align="top"
                                style={{ marginBottom: '24px' }}
                              >
                                <Col flex="auto">
                                  <Form.Item
                                    name={[field.name, 'id']}
                                    style={{ margin: 0 }}
                                    hidden
                                  >
                                    <Input />
                                  </Form.Item>
                                  <Form.Item
                                    name={[field.name, 'name']}
                                    style={{ margin: 0 }}
                                  >
                                    <Input
                                      placeholder={placeholder(index + 1)}
                                    />
                                  </Form.Item>
                                </Col>
                                <Col flex="none">
                                  {itemId ? (
                                    <ActionConfirm
                                      action="delete"
                                      onConfirm={() =>
                                        handleRemove(itemId, () =>
                                          remove(field.name)
                                        )
                                      }
                                    >
                                      <Button
                                        danger
                                        icon={<DeleteOutlined />}
                                      />
                                    </ActionConfirm>
                                  ) : (
                                    <Button
                                      danger
                                      icon={<MinusCircleOutlined />}
                                      onClick={() => remove(field.name)}
                                      style={{ borderColor: '#d9d9d9' }}
                                    />
                                  )}
                                </Col>
                              </Row>
                            );
                          })}
                          <Form.Item style={{ textAlign: 'center', margin: 0 }}>
                            <Button
                              type="dashed"
                              onClick={() => add({ id: '0', name: '' })}
                              icon={<PlusOutlined />}
                            >
                              {addLabel}
                            </Button>
                          </Form.Item>
                        </>
                      )}
                    </Form.List>
                  </Col>
                </Row>
              </Col>
            </Row>
          </Card>
          <Divider style={{ margin: '32px 0 24px 0' }} />
          <Row gutter={16} justify="space-between">
            <Col flex="none">
              <Space>
                <Button
                  color="default"
                  variant="outlined"
                  htmlType="button"
                  onClick={skipSetup}
                >
                  {__('Skip All', 'kelune-crm')}
                </Button>
                <Button
                  color="default"
                  variant="text"
                  htmlType="button"
                  onClick={prevStep}
                >
                  {__('Back', 'kelune-crm')}
                </Button>
              </Space>
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
                  {__('Save & Next', 'kelune-crm')}
                </Button>
              </Space>
            </Col>
          </Row>
        </Form>
      </Col>
    </Row>
  );
};

export default ItemsStep;
