import React from 'react';
import {
  Drawer,
  Form,
  Input,
  Select,
  Button,
  Switch,
  message,
  Space,
} from 'antd';
import { __ } from '@wordpress/i18n';
import api from '../../services/api';
import FieldTypeConfig from './FieldTypeConfig';
import { getErrorMessage } from '@/utils/getErrorMessage';

const { Option } = Select;

/** Custom field definition row (GET /custom-fields). */
interface CustomField {
  id: number;
  field_label?: string;
  field_key?: string;
  field_type?: string;
  field_options?: Record<string, unknown>;
  field_default?: unknown;
  field_required?: number;
}

interface CustomFieldFormProps {
  visible: boolean;
  onCancel: () => void;
  editingField?: CustomField | null;
  onSuccess: () => void;
}

const CustomFieldForm = ({
  visible,
  onCancel,
  editingField,
  onSuccess,
}: CustomFieldFormProps) => {
  const [form] = Form.useForm();

  React.useEffect(() => {
    if (visible) {
      if (editingField) {
        form.setFieldsValue({
          field_label: editingField.field_label,
          field_key: editingField.field_key,
          field_type: editingField.field_type,
          field_options: editingField.field_options || {},
          field_default: editingField.field_default,
          field_required: editingField.field_required === 1,
        });
      } else {
        form.resetFields();
      }
    }
  }, [visible, editingField, form]);

  // Auto-generate field key from label
  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const label = e.target.value;
    if (!editingField) {
      // Only auto-generate for new fields
      const key = label
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '_');
      form.setFieldValue('field_key', key);
    }
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      // Convert field_required boolean to integer
      values.field_required = values.field_required ? 1 : 0;

      if (editingField) {
        await api.put(`/custom-fields/${editingField.id}`, values);
        message.success(__('Custom field updated successfully', 'kelune-crm'));
      } else {
        await api.post('/custom-fields', values);
        message.success(__('Custom field created successfully', 'kelune-crm'));
      }

      form.resetFields();
      onSuccess();
    } catch (error) {
      message.error(getErrorMessage(error));
      console.error('Failed to save custom field:', error);
    }
  };

  const fieldTypes = [
    { value: 'text', label: __('Single Line Text', 'kelune-crm') },
    { value: 'textarea', label: __('Multi-line Text', 'kelune-crm') },
    { value: 'number', label: __('Number', 'kelune-crm') },
    { value: 'email', label: __('Email', 'kelune-crm') },
    { value: 'url', label: __('URL', 'kelune-crm') },
    { value: 'phone', label: __('Phone', 'kelune-crm') },
    { value: 'select', label: __('Select (Dropdown)', 'kelune-crm') },
    { value: 'radio', label: __('Radio Buttons', 'kelune-crm') },
    { value: 'checkbox', label: __('Checkboxes', 'kelune-crm') },
    { value: 'date', label: __('Date', 'kelune-crm') },
    { value: 'datetime', label: __('Date and Time', 'kelune-crm') },
  ];

  return (
    <Drawer
      destroyOnHidden
      title={
        editingField
          ? __('Edit Custom Field', 'kelune-crm')
          : __('Create Custom Field', 'kelune-crm')
      }
      open={visible}
      onClose={onCancel}
      width={640}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          field_type: 'text',
          field_required: false,
          field_options: {},
        }}
      >
        <Form.Item
          label={__('Field Type', 'kelune-crm')}
          name="field_type"
          rules={[
            {
              required: true,
              message: __('Please select field type', 'kelune-crm'),
            },
          ]}
        >
          <Select placeholder={__('Select field type', 'kelune-crm')}>
            {fieldTypes.map((type) => (
              <Option key={type.value} value={type.value}>
                {type.label}
              </Option>
            ))}
          </Select>
        </Form.Item>

        <Form.Item
          label={__('Field Label', 'kelune-crm')}
          name="field_label"
          rules={[
            {
              required: true,
              message: __('Please enter field label', 'kelune-crm'),
            },
          ]}
          tooltip={__('This is the display name shown to users', 'kelune-crm')}
        >
          <Input
            placeholder={__('e.g., Company Name', 'kelune-crm')}
            onChange={handleLabelChange}
          />
        </Form.Item>

        <Form.Item
          label={__('Field Key', 'kelune-crm')}
          name="field_key"
          rules={[
            {
              required: true,
              message: __('Please enter field key', 'kelune-crm'),
            },
            {
              pattern: /^[a-z0-9_]+$/,
              message: __(
                'Only lowercase letters, numbers, and underscores allowed',
                'kelune-crm'
              ),
            },
          ]}
          tooltip={
            editingField
              ? __('Field key cannot be changed after creation', 'kelune-crm')
              : __(
                  'Used internally to identify this field (auto-generated)',
                  'kelune-crm'
                )
          }
        >
          <Input
            placeholder={__('e.g., company_name', 'kelune-crm')}
            disabled={!!editingField}
          />
        </Form.Item>

        <FieldTypeConfig form={form} />

        <Form.Item
          label={__('Default Value', 'kelune-crm')}
          name="field_default"
          tooltip={__('Optional default value for this field', 'kelune-crm')}
        >
          <Input placeholder={__('Enter default value', 'kelune-crm')} />
        </Form.Item>

        <Form.Item
          label={__('Required Field', 'kelune-crm')}
          name="field_required"
          valuePropName="checked"
          tooltip={__(
            'If enabled, this field must be filled when creating/editing contacts',
            'kelune-crm'
          )}
        >
          <Switch />
        </Form.Item>

        <Form.Item style={{ marginBottom: 0 }}>
          <Space>
            <Button type="primary" htmlType="submit">
              {editingField
                ? __('Update', 'kelune-crm')
                : __('Create', 'kelune-crm')}
            </Button>
            <Button onClick={onCancel}>{__('Cancel', 'kelune-crm')}</Button>
          </Space>
        </Form.Item>
      </Form>
    </Drawer>
  );
};

export default CustomFieldForm;
