import React from 'react';
import { __ } from '@wordpress/i18n';
import { Collapse, Form, InputNumber, ColorPicker, Select } from 'antd';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/utils/emailHtml';
import type { TemplateSettings } from '@/utils/emailHtml';
import { BoxInput } from './emailBuilderControls';

const { Option } = Select;

interface TemplateSettingsPanelProps {
  settings: TemplateSettings;
  onChange: (patch: Partial<TemplateSettings>) => void;
}

const FONT_OPTIONS = [
  { value: 'Arial, sans-serif', label: 'Arial' },
  { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: "'Times New Roman', serif", label: 'Times New Roman' },
  { value: "'Courier New', monospace", label: 'Courier New' },
  { value: 'Verdana, sans-serif', label: 'Verdana' },
  { value: 'Tahoma, sans-serif', label: 'Tahoma' },
];

// Shown in the Settings tab when no block is selected. Edits the template-level
// design (content container width/background/font, and the outer page).
const TemplateSettingsPanel = ({
  settings,
  onChange,
}: TemplateSettingsPanelProps) => {
  const containerItems = (
    <>
      <Form.Item label={__('Content Width', 'kelune-crm')}>
        <InputNumber
          value={settings.contentWidth}
          onChange={(value) => onChange({ contentWidth: value || 700 })}
          min={320}
          max={900}
          step={10}
          controls={false}
          addonAfter="px"
          style={{ width: '100%' }}
        />
      </Form.Item>
      <Form.Item label={__('Content Background', 'kelune-crm')}>
        <ColorPicker
          value={settings.contentBackground}
          onChange={(color) =>
            onChange({ contentBackground: color.toHexString() })
          }
          onClear={() =>
            onChange({
              contentBackground: DEFAULT_TEMPLATE_SETTINGS.contentBackground,
            })
          }
          allowClear
          showText
        />
      </Form.Item>
      <Form.Item label={__('Base Font', 'kelune-crm')}>
        <Select
          value={settings.fontFamily}
          onChange={(value) => onChange({ fontFamily: value })}
        >
          {FONT_OPTIONS.map((f) => (
            <Option key={f.value} value={f.value}>
              {f.label}
            </Option>
          ))}
        </Select>
      </Form.Item>
      <Form.Item
        label={__('Padding', 'kelune-crm')}
        style={{ marginBottom: 0 }}
      >
        <BoxInput
          value={settings.contentPadding}
          onChange={(value) => onChange({ contentPadding: value })}
        />
      </Form.Item>
    </>
  );

  const mainItems = (
    <>
      <Form.Item label={__('Page Background', 'kelune-crm')}>
        <ColorPicker
          value={settings.backgroundColor}
          onChange={(color) =>
            onChange({ backgroundColor: color.toHexString() })
          }
          onClear={() =>
            onChange({
              backgroundColor: DEFAULT_TEMPLATE_SETTINGS.backgroundColor,
            })
          }
          allowClear
          showText
        />
      </Form.Item>
      <Form.Item
        label={__('Padding', 'kelune-crm')}
        style={{ marginBottom: 0 }}
      >
        <BoxInput
          value={settings.pagePadding}
          onChange={(value) => onChange({ pagePadding: value })}
        />
      </Form.Item>
    </>
  );

  return (
    // Layout only; the host page owns the form element.
    <Form component="div" layout="vertical">
      <Collapse
        className="kelune-crm-cc-tpl-collapse"
        size="small"
        bordered={false}
        defaultActiveKey={['container', 'main']}
        style={{ borderRadius: 0 }}
        items={[
          {
            key: 'container',
            label: __('Container', 'kelune-crm'),
            children: containerItems,
          },
          {
            key: 'main',
            label: __('Main', 'kelune-crm'),
            children: mainItems,
          },
        ]}
      />
    </Form>
  );
};

export default TemplateSettingsPanel;
