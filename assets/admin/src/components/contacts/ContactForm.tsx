import React, { useState, useEffect } from 'react';
import {
  Form,
  Input,
  Select,
  Button,
  Row,
  Col,
  Space,
  Divider,
  Typography,
  message,
  DatePicker,
  InputNumber,
  Checkbox,
  Radio,
  Popconfirm,
  Tooltip,
} from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import dayjs from 'dayjs';
import api from '../../services/api';
import { CONTACT_STATUS_OPTIONS } from './contactStatus';
import { timeDiff, timeFormat } from '../../utils/time';
import { ListSelect, TagSelect } from '@/components/common/AudienceSelect';
import type { Contact, Tag, ContactList, Note } from '@/types/models';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

/** Custom field definition as returned by GET /custom-fields. */
interface CustomFieldDef {
  id: number;
  field_key: string;
  field_label: string;
  field_type: string;
  field_required?: number;
  field_options?: {
    choices?: string[];
    options?: string[];
  };
  field_default?: unknown;
  field_order?: number;
}

interface ContactFormProps {
  contact?: Contact | null;
  onSubmit: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}

const ContactForm = ({ contact, onSubmit, onCancel }: ContactFormProps) => {
  const [form] = Form.useForm();
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [customFieldsLoaded, setCustomFieldsLoaded] = useState(false);
  const [deletedNoteIds, setDeletedNoteIds] = useState<number[]>([]);

  useEffect(() => {
    fetchCustomFields();
  }, []);

  useEffect(() => {
    // A date value seeded before its definition is known stays a string, and
    // the DatePicker that mounts on it throws on render.
    if (contact && customFieldsLoaded) {
      // Don't set notes field - it's for adding new notes only
      const { notes: _notes, custom_fields, ...rest } = contact;
      const contactData: Record<string, unknown> = { ...rest };

      // Set tag IDs if contact has tags. Normalise to Number so the values
      // match the (numeric) Select option values — PHP may send ids as strings.
      if (contact.tags && Array.isArray(contact.tags)) {
        contactData.tag_ids = contact.tags.map((tag: Tag) => Number(tag.id));
      }

      // Set list IDs if contact has lists (normalised to Number, see above).
      if (contact.lists && Array.isArray(contact.lists)) {
        contactData.list_ids = contact.lists.map((list: ContactList) =>
          Number(list.id)
        );
      }

      // Set custom field values with custom_field__ prefix
      if (custom_fields && typeof custom_fields === 'object') {
        Object.keys(custom_fields).forEach((fieldKey) => {
          const value = custom_fields[fieldKey];

          // Find the custom field definition to check its type
          const fieldDef = customFields.find((f) => f.field_key === fieldKey);

          // Convert date/datetime strings to dayjs objects for DatePicker
          if (
            fieldDef &&
            (fieldDef.field_type === 'date' ||
              fieldDef.field_type === 'datetime')
          ) {
            if (value && typeof value === 'string') {
              contactData[`custom_field__${fieldKey}`] = dayjs(value);
            } else {
              contactData[`custom_field__${fieldKey}`] = value;
            }
          } else {
            contactData[`custom_field__${fieldKey}`] = value;
          }
        });
      }

      form.setFieldsValue(contactData);
    }
  }, [contact, form, customFields, customFieldsLoaded]);

  const fetchCustomFields = async () => {
    try {
      const response = await api.get<CustomFieldDef[]>('/custom-fields', {
        params: { per_page: 100 },
      });
      setCustomFields(response.data || []);
    } catch (error) {
      console.error('Failed to fetch custom fields:', error);
    } finally {
      // Also on failure: the standard fields still need seeding.
      setCustomFieldsLoaded(true);
    }
  };

  const handleDeleteNote = (noteId: number) => {
    setDeletedNoteIds([...deletedNoteIds, noteId]);
    message.success(
      __('Note will be deleted when you save the contact', 'kelune-crm')
    );
  };

  const handleSubmit = (values: Record<string, unknown>) => {
    // Extract custom fields from form values
    const customFieldsData: Record<string, unknown> = {};
    const standardFields = { ...values };

    Object.keys(values).forEach((key) => {
      if (key.startsWith('custom_field__')) {
        const fieldKey = key.replace('custom_field__', '');
        let value = values[key];

        // Find the custom field definition to check its type
        const fieldDef = customFields.find((f) => f.field_key === fieldKey);

        // Convert dayjs objects to strings for date/datetime fields
        if (
          fieldDef &&
          (fieldDef.field_type === 'date' || fieldDef.field_type === 'datetime')
        ) {
          if (dayjs.isDayjs(value)) {
            // Format date: YYYY-MM-DD, datetime: YYYY-MM-DD HH:mm:ss
            value =
              fieldDef.field_type === 'date'
                ? value.format('YYYY-MM-DD')
                : value.format('YYYY-MM-DD HH:mm:ss');
          }
        }

        customFieldsData[fieldKey] = value;
        delete standardFields[key];
      }
    });

    // Add custom_fields object to the data
    if (Object.keys(customFieldsData).length > 0) {
      standardFields.custom_fields = customFieldsData;
    }

    // Add deleted note IDs if any
    if (deletedNoteIds.length > 0) {
      standardFields.deleted_note_ids = deletedNoteIds;
    }

    onSubmit(standardFields);
  };

  const renderCustomField = (field: CustomFieldDef) => {
    switch (field.field_type) {
      case 'text':
        return <Input placeholder={field.field_label} />;

      case 'textarea':
        return <TextArea rows={3} placeholder={field.field_label} />;

      case 'number':
        return (
          <InputNumber
            style={{ width: '100%' }}
            placeholder={field.field_label}
          />
        );

      case 'email':
        return <Input type="email" placeholder={field.field_label} />;

      case 'url':
        return <Input type="url" placeholder={field.field_label} />;

      case 'phone':
        return <Input type="tel" placeholder={field.field_label} />;

      case 'date':
        return <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />;

      case 'datetime':
        return (
          <DatePicker
            showTime
            style={{ width: '100%' }}
            format="YYYY-MM-DD HH:mm:ss"
          />
        );

      case 'select': {
        const selectOptions =
          field.field_options?.choices || field.field_options?.options || [];
        return (
          <Select
            placeholder={sprintf(
              // translators: %s is the custom field label.
              __('Select %s', 'kelune-crm'),
              field.field_label
            )}
            allowClear
          >
            {selectOptions.map((option: string, index: number) => (
              <Option key={index} value={option}>
                {option}
              </Option>
            ))}
          </Select>
        );
      }

      case 'radio': {
        const radioOptions =
          field.field_options?.choices || field.field_options?.options || [];
        return (
          <Radio.Group>
            <Space direction="vertical">
              {radioOptions.map((option: string, index: number) => (
                <Radio key={index} value={option}>
                  {option}
                </Radio>
              ))}
            </Space>
          </Radio.Group>
        );
      }

      case 'checkbox': {
        const checkboxOptions =
          field.field_options?.choices || field.field_options?.options || [];
        return (
          <Checkbox.Group>
            <Space direction="vertical">
              {checkboxOptions.map((option: string, index: number) => (
                <Checkbox key={index} value={option}>
                  {option}
                </Checkbox>
              ))}
            </Space>
          </Checkbox.Group>
        );
      }

      default:
        return <Input placeholder={field.field_label} />;
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        status: 'active',
        source: 'manual',
      }}
    >
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="first_name"
            label={__('First Name', 'kelune-crm')}
            rules={[
              {
                required: true,
                message: __('Please enter first name', 'kelune-crm'),
              },
            ]}
          >
            <Input placeholder={__('John', 'kelune-crm')} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name="last_name"
            label={__('Last Name', 'kelune-crm')}
            rules={[
              {
                required: true,
                message: __('Please enter last name', 'kelune-crm'),
              },
            ]}
          >
            <Input placeholder={__('Doe', 'kelune-crm')} />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item
        name="email"
        label={__('Email', 'kelune-crm')}
        rules={[
          {
            required: true,
            message: __('Please enter email', 'kelune-crm'),
          },
          {
            type: 'email',
            message: __('Please enter valid email', 'kelune-crm'),
          },
        ]}
      >
        <Input placeholder={__('john@example.com', 'kelune-crm')} />
      </Form.Item>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="phone" label={__('Phone', 'kelune-crm')}>
            <Input placeholder={__('+1 234 567 8900', 'kelune-crm')} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="company" label={__('Company', 'kelune-crm')}>
            <Input placeholder={__('ACME Inc.', 'kelune-crm')} />
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="address_line1" label={__('Address', 'kelune-crm')}>
        <Input placeholder={__('123 Main St', 'kelune-crm')} />
      </Form.Item>

      <Row gutter={16}>
        <Col span={8}>
          <Form.Item name="city" label={__('City', 'kelune-crm')}>
            <Input placeholder={__('New York', 'kelune-crm')} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="state" label={__('State', 'kelune-crm')}>
            <Input placeholder={__('NY', 'kelune-crm')} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item name="postal_code" label={__('Postal Code', 'kelune-crm')}>
            <Input placeholder={__('10001', 'kelune-crm')} />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="status" label={__('Status', 'kelune-crm')}>
            <Select options={CONTACT_STATUS_OPTIONS} />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="source" label={__('Source', 'kelune-crm')}>
            <Select>
              <Option value="manual">{__('Manual', 'kelune-crm')}</Option>
              <Option value="import">{__('Import', 'kelune-crm')}</Option>
              <Option value="form">{__('Form', 'kelune-crm')}</Option>
              <Option value="api">{__('API', 'kelune-crm')}</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Form.Item name="tag_ids" label={__('Tags', 'kelune-crm')}>
        <TagSelect />
      </Form.Item>

      <Form.Item name="list_ids" label={__('Lists', 'kelune-crm')}>
        <ListSelect />
      </Form.Item>

      {contact?.notes && contact.notes.length > 0 && (
        <>
          <Divider
            orientation="left"
            orientationMargin="0"
            style={{ margin: '24px 0' }}
          >
            {__('Existing Notes', 'kelune-crm')}
          </Divider>
          <div
            style={{ marginBottom: 24, maxHeight: '200px', overflowY: 'auto' }}
          >
            {contact.notes
              .filter((note: Note) => !deletedNoteIds.includes(note.id))
              .map((note: Note, index: number, arr: Note[]) => (
                <div
                  key={note.id || index}
                  style={{
                    marginBottom: index < arr.length - 1 ? 12 : 0,
                    padding: 12,
                    background: '#f5f5f5',
                    borderRadius: 4,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ marginBottom: 4 }}>
                      <Text>{note.content}</Text>
                    </div>
                    <div style={{ fontSize: 12, color: '#999' }}>
                      {note.created_at ? (
                        <Tooltip title={timeFormat(note.created_at)}>
                          <span>{timeDiff(note.created_at)}</span>
                        </Tooltip>
                      ) : (
                        '-'
                      )}
                    </div>
                  </div>
                  <Popconfirm
                    title={__('Delete this note?', 'kelune-crm')}
                    onConfirm={() => handleDeleteNote(note.id)}
                    okText={__('Yes', 'kelune-crm')}
                    cancelText={__('No', 'kelune-crm')}
                  >
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      style={{ marginLeft: 8 }}
                    />
                  </Popconfirm>
                </div>
              ))}
          </div>
        </>
      )}

      <Form.Item name="notes" label={__('Add New Note', 'kelune-crm')}>
        <TextArea
          rows={3}
          placeholder={__('Add a new note...', 'kelune-crm')}
        />
      </Form.Item>

      {customFields.length > 0 && (
        <>
          <Divider
            orientation="left"
            orientationMargin="0"
            style={{ margin: '24px 0' }}
          >
            {__('Custom Fields', 'kelune-crm')}
          </Divider>
          {customFields.map((field) => {
            const fieldKey = `custom_field__${field.field_key}`;
            const rules =
              field.field_required === 1
                ? [
                    {
                      required: true,
                      message: sprintf(
                        // translators: %s is the custom field label.
                        __('%s is required', 'kelune-crm'),
                        field.field_label
                      ),
                    },
                  ]
                : [];

            return (
              <Form.Item
                key={field.id}
                name={fieldKey}
                label={field.field_label}
                rules={rules}
              >
                {renderCustomField(field)}
              </Form.Item>
            );
          })}
        </>
      )}

      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">
            {contact
              ? __('Update Contact', 'kelune-crm')
              : __('Create Contact', 'kelune-crm')}
          </Button>
          <Button onClick={onCancel}>{__('Cancel', 'kelune-crm')}</Button>
        </Space>
      </Form.Item>
    </Form>
  );
};

export default ContactForm;
