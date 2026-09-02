import React from 'react';
import { Form, Input, InputNumber, Space, Button, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import type { FormInstance } from 'antd';
import { formSectionDivider } from '@/utils/formStyles';

const { TextArea } = Input;

interface FieldTypeConfigProps {
  form: FormInstance;
}

const FieldTypeConfig = ({ form }: FieldTypeConfigProps) => {
  const fieldType = Form.useWatch('field_type', form);

  // Choice editor for select, radio and checkbox.
  const renderChoicesEditor = () => (
    <div>
      <Divider
        orientation="left"
        orientationMargin="0"
        style={formSectionDivider}
      >
        {__('Choices', 'kelune-crm')}
      </Divider>
      <Form.List
        name={['field_options', 'choices']}
        rules={[
          {
            validator: async (_, choices?: string[]) => {
              const filled = (choices || []).filter(
                (choice) => (choice ?? '').trim() !== ''
              );
              if (filled.length === 0) {
                throw new Error(__('Add at least one option', 'kelune-crm'));
              }
            },
          },
        ]}
      >
        {(fields, { add, remove }, { errors }) => (
          <Form.Item
            label={__('Options', 'kelune-crm')}
            required
            tooltip={__(
              'Add at least one option for users to choose from',
              'kelune-crm'
            )}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {fields.map((field, index) => (
                <div
                  key={field.key}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}
                >
                  <Form.Item
                    name={field.name}
                    rules={[
                      {
                        required: true,
                        whitespace: true,
                        message: __(
                          'Enter an option or remove it',
                          'kelune-crm'
                        ),
                      },
                    ]}
                    style={{ flex: 1, marginBottom: 0 }}
                  >
                    <Input
                      placeholder={sprintf(
                        // translators: %d: option number
                        __('Option %d', 'kelune-crm'),
                        index + 1
                      )}
                    />
                  </Form.Item>
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => remove(field.name)}
                  />
                </div>
              ))}
              <Button
                type="dashed"
                onClick={() => add('')}
                icon={<PlusOutlined />}
                style={{ width: '100%' }}
              >
                {__('Add Choice', 'kelune-crm')}
              </Button>
              <Form.ErrorList errors={errors} />
            </Space>
          </Form.Item>
        )}
      </Form.List>
    </div>
  );

  const renderNumberOptions = () => (
    <div>
      <Divider
        orientation="left"
        orientationMargin="0"
        style={formSectionDivider}
      >
        {__('Number Options', 'kelune-crm')}
      </Divider>
      <Form.Item
        label={__('Minimum Value', 'kelune-crm')}
        name={['field_options', 'min']}
        tooltip={__('Optional minimum allowed value', 'kelune-crm')}
      >
        <InputNumber
          placeholder={__('Enter minimum', 'kelune-crm')}
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item
        label={__('Maximum Value', 'kelune-crm')}
        name={['field_options', 'max']}
        tooltip={__('Optional maximum allowed value', 'kelune-crm')}
      >
        <InputNumber
          placeholder={__('Enter maximum', 'kelune-crm')}
          style={{ width: '100%' }}
        />
      </Form.Item>

      <Form.Item
        label={__('Step', 'kelune-crm')}
        name={['field_options', 'step']}
        initialValue={1}
        tooltip={__('Increment value (e.g., 0.01 for decimals)', 'kelune-crm')}
      >
        <InputNumber
          placeholder={__('Enter step value', 'kelune-crm')}
          style={{ width: '100%' }}
          min={0.01}
        />
      </Form.Item>
    </div>
  );

  const renderTextOptions = () => (
    <div>
      <Divider
        orientation="left"
        orientationMargin="0"
        style={formSectionDivider}
      >
        {__('Text Options', 'kelune-crm')}
      </Divider>
      <Form.Item
        label={__('Placeholder', 'kelune-crm')}
        name={['field_options', 'placeholder']}
        tooltip={__('Hint text shown when field is empty', 'kelune-crm')}
      >
        <Input placeholder={__('Enter placeholder text', 'kelune-crm')} />
      </Form.Item>

      <Form.Item
        label={__('Maximum Length', 'kelune-crm')}
        name={['field_options', 'max_length']}
        tooltip={__('Optional character limit', 'kelune-crm')}
      >
        <InputNumber
          placeholder={__('Enter max length', 'kelune-crm')}
          style={{ width: '100%' }}
          min={1}
        />
      </Form.Item>
    </div>
  );

  const renderHelpText = () => (
    <div>
      <Divider
        orientation="left"
        orientationMargin="0"
        style={formSectionDivider}
      >
        {__('Additional Options', 'kelune-crm')}
      </Divider>
      <Form.Item
        label={__('Help Text', 'kelune-crm')}
        name={['field_options', 'help_text']}
        tooltip={__(
          'Additional guidance displayed below the field',
          'kelune-crm'
        )}
      >
        <TextArea rows={2} placeholder={__('Enter help text', 'kelune-crm')} />
      </Form.Item>
    </div>
  );

  const renderConfig = () => {
    if (!fieldType) return null;

    switch (fieldType) {
      case 'select':
      case 'radio':
      case 'checkbox':
        return (
          <>
            {renderChoicesEditor()}
            {renderHelpText()}
          </>
        );

      case 'number':
        return (
          <>
            {renderNumberOptions()}
            {renderHelpText()}
          </>
        );

      case 'text':
      case 'textarea':
        return (
          <>
            {renderTextOptions()}
            {renderHelpText()}
          </>
        );

      case 'email':
      case 'url':
      case 'phone':
      case 'date':
      case 'datetime':
        return renderHelpText();

      default:
        return null;
    }
  };

  return <div>{renderConfig()}</div>;
};

export default FieldTypeConfig;
