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
  const fieldOptions = Form.useWatch('field_options', form) || {};

  // Render choice editor for select, radio, checkbox
  const renderChoicesEditor = () => {
    const choices = fieldOptions.choices || [];

    const handleAddChoice = () => {
      const newChoices = [...choices, ''];
      form.setFieldValue('field_options', {
        ...fieldOptions,
        choices: newChoices,
      });
    };

    const handleRemoveChoice = (index: number) => {
      const newChoices = choices.filter((_: unknown, i: number) => i !== index);
      form.setFieldValue('field_options', {
        ...fieldOptions,
        choices: newChoices,
      });
    };

    const handleChangeChoice = (index: number, value: string) => {
      const newChoices = [...choices];
      newChoices[index] = value;
      form.setFieldValue('field_options', {
        ...fieldOptions,
        choices: newChoices,
      });
    };

    return (
      <div>
        <Divider
          orientation="left"
          orientationMargin="0"
          style={formSectionDivider}
        >
          {__('Choices', 'kelune-crm')}
        </Divider>
        <Form.Item
          label={__('Options', 'kelune-crm')}
          required
          tooltip={__(
            'Add at least one option for users to choose from',
            'kelune-crm'
          )}
        >
          <Space direction="vertical" style={{ width: '100%' }}>
            {choices.map((choice: string, index: number) => (
              <Space key={index} style={{ width: '100%' }}>
                <Input
                  placeholder={sprintf(
                    // translators: %d: option number
                    __('Option %d', 'kelune-crm'),
                    index + 1
                  )}
                  value={choice}
                  onChange={(e) => handleChangeChoice(index, e.target.value)}
                  style={{ width: 300 }}
                />
                {choices.length > 1 && (
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleRemoveChoice(index)}
                  />
                )}
              </Space>
            ))}
            <Button
              type="dashed"
              onClick={handleAddChoice}
              icon={<PlusOutlined />}
              style={{ width: '100%' }}
            >
              {__('Add Choice', 'kelune-crm')}
            </Button>
          </Space>
        </Form.Item>
      </div>
    );
  };

  // Render number field options
  const renderNumberOptions = () => {
    return (
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
          tooltip={__('Optional minimum allowed value', 'kelune-crm')}
        >
          <InputNumber
            placeholder={__('Enter minimum', 'kelune-crm')}
            value={fieldOptions.min}
            onChange={(value) => {
              form.setFieldValue('field_options', {
                ...fieldOptions,
                min: value,
              });
            }}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          label={__('Maximum Value', 'kelune-crm')}
          tooltip={__('Optional maximum allowed value', 'kelune-crm')}
        >
          <InputNumber
            placeholder={__('Enter maximum', 'kelune-crm')}
            value={fieldOptions.max}
            onChange={(value) => {
              form.setFieldValue('field_options', {
                ...fieldOptions,
                max: value,
              });
            }}
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item
          label={__('Step', 'kelune-crm')}
          tooltip={__(
            'Increment value (e.g., 0.01 for decimals)',
            'kelune-crm'
          )}
        >
          <InputNumber
            placeholder={__('Enter step value', 'kelune-crm')}
            value={fieldOptions.step || 1}
            onChange={(value) => {
              form.setFieldValue('field_options', {
                ...fieldOptions,
                step: value,
              });
            }}
            style={{ width: '100%' }}
            min={0.01}
          />
        </Form.Item>
      </div>
    );
  };

  // Render text field options
  const renderTextOptions = () => {
    return (
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
          tooltip={__('Hint text shown when field is empty', 'kelune-crm')}
        >
          <Input
            placeholder={__('Enter placeholder text', 'kelune-crm')}
            value={fieldOptions.placeholder}
            onChange={(e) => {
              form.setFieldValue('field_options', {
                ...fieldOptions,
                placeholder: e.target.value,
              });
            }}
          />
        </Form.Item>

        <Form.Item
          label={__('Maximum Length', 'kelune-crm')}
          tooltip={__('Optional character limit', 'kelune-crm')}
        >
          <InputNumber
            placeholder={__('Enter max length', 'kelune-crm')}
            value={fieldOptions.maxLength}
            onChange={(value) => {
              form.setFieldValue('field_options', {
                ...fieldOptions,
                maxLength: value,
              });
            }}
            style={{ width: '100%' }}
            min={1}
          />
        </Form.Item>
      </div>
    );
  };

  // Render help text for all types
  const renderHelpText = () => {
    return (
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
          tooltip={__(
            'Additional guidance displayed below the field',
            'kelune-crm'
          )}
        >
          <TextArea
            rows={2}
            placeholder={__('Enter help text', 'kelune-crm')}
            value={fieldOptions.help_text}
            onChange={(e) => {
              form.setFieldValue('field_options', {
                ...fieldOptions,
                help_text: e.target.value,
              });
            }}
          />
        </Form.Item>
      </div>
    );
  };

  // Render appropriate configuration based on field type
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
