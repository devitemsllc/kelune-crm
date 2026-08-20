import React from 'react';
import { __ } from '@wordpress/i18n';
import {
  Collapse,
  Form,
  Input,
  Select,
  InputNumber,
  ColorPicker,
  Button,
  Space,
  message,
} from 'antd';
import type { CollapseProps } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import type { EmailBlock, EmailBlockStyles } from '@/types/models';
import RichTextEditor from '@/components/common/RichTextEditor';
import HtmlCodeEditor from '@/components/common/HtmlCodeEditor';
import { CONTACT_MERGE_TAGS } from '@/utils/mergeTags';
import { openMediaLibrary, isMediaLibraryAvailable } from '@/utils/wpMedia';
import {
  BoxInput,
  FontWeightSelect,
  PxInput,
  ResettableColor,
} from './emailBuilderControls';

const { Option } = Select;

// Shared width presets for image / button / divider. 'auto' means natural width
// (image: capped to container; button: hug text; divider: full width); the
// percentages are relative to the block's container.
const WIDTH_OPTIONS: { value: string; label: string }[] = [
  { value: 'auto', label: __('Auto', 'kelune-crm') },
  { value: '25%', label: '25%' },
  { value: '50%', label: '50%' },
  { value: '75%', label: '75%' },
  { value: '100%', label: '100%' },
];

interface BlockPropertiesProps {
  block: EmailBlock | null;
  onChange: (updates: Partial<EmailBlock>) => void;
}

const BlockProperties = ({ block, onChange }: BlockPropertiesProps) => {
  if (!block) {
    return (
      <div style={{ padding: 16, color: '#999' }}>
        {__('Select a block to edit properties', 'kelune-crm')}
      </div>
    );
  }

  const updateStyle = (key: string, value: string | number) => {
    onChange({ styles: { ...block.styles, [key]: value } });
  };

  // Merge several style keys at once (e.g. src + alt from a media pick).
  const updateStyles = (patch: Partial<EmailBlockStyles>) => {
    onChange({ styles: { ...block.styles, ...patch } });
  };

  const pickFromMediaLibrary = async () => {
    if (!isMediaLibraryAvailable()) {
      message.error(__('WordPress media library is unavailable', 'kelune-crm'));
      return;
    }
    const attachment = await openMediaLibrary({
      title: __('Select image', 'kelune-crm'),
      buttonText: __('Use this image', 'kelune-crm'),
      type: 'image',
    });
    if (!attachment) {
      return;
    }
    // Keep any alt the user already typed; otherwise seed it from the attachment.
    updateStyles({
      src: attachment.url,
      ...(block.styles?.alt ? {} : { alt: attachment.alt || attachment.title }),
    });
  };

  // --- Content-group fields (what the block says) ---------------------------
  const contentFields: Record<string, React.ReactNode> = {
    text: (
      <Form.Item
        label={__('Content', 'kelune-crm')}
        style={{ marginBottom: 0 }}
      >
        <RichTextEditor
          key={`text-${block.id}`}
          value={block.styles?.content || ''}
          onChange={(value) => updateStyle('content', value)}
          height={180}
          placeholders={CONTACT_MERGE_TAGS}
        />
      </Form.Item>
    ),
    html: (
      <Form.Item label={__('HTML', 'kelune-crm')} style={{ marginBottom: 0 }}>
        <HtmlCodeEditor
          value={block.styles?.html || ''}
          onChange={(value) => updateStyle('html', value)}
          height="240px"
        />
      </Form.Item>
    ),
    image: (
      <>
        <Form.Item label={__('Image', 'kelune-crm')}>
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            <Input
              value={block.styles?.src || ''}
              onChange={(e) => updateStyle('src', e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
            <Button
              size="small"
              icon={<PictureOutlined />}
              onClick={pickFromMediaLibrary}
            >
              {__('Media Library', 'kelune-crm')}
            </Button>
          </Space>
        </Form.Item>
        <Form.Item label={__('Alt', 'kelune-crm')}>
          <Input
            value={block.styles?.alt || ''}
            onChange={(e) => updateStyle('alt', e.target.value)}
            placeholder={__('Image description', 'kelune-crm')}
          />
        </Form.Item>
        <Form.Item label={__('Link', 'kelune-crm')} style={{ marginBottom: 0 }}>
          <Input
            value={block.styles?.link || ''}
            onChange={(e) => updateStyle('link', e.target.value)}
            placeholder="https://example.com"
          />
        </Form.Item>
      </>
    ),
    button: (
      <>
        <Form.Item label={__('Text', 'kelune-crm')}>
          <Input
            value={block.styles?.text || ''}
            onChange={(e) => updateStyle('text', e.target.value)}
            placeholder={__('Click Me', 'kelune-crm')}
          />
        </Form.Item>
        <Form.Item label={__('Link', 'kelune-crm')} style={{ marginBottom: 0 }}>
          <Input
            value={block.styles?.link || ''}
            onChange={(e) => updateStyle('link', e.target.value)}
            placeholder="https://example.com"
          />
        </Form.Item>
      </>
    ),
  };

  // --- Style-group fields (how the block looks) -----------------------------
  const styleFields: Record<string, React.ReactNode> = {
    text: (
      <>
        <Form.Item label={__('Font Size', 'kelune-crm')}>
          <PxInput
            value={block.styles?.fontSize}
            fallback={16}
            onChange={(value) => updateStyle('fontSize', value)}
          />
        </Form.Item>
        <Form.Item label={__('Font Weight', 'kelune-crm')}>
          <FontWeightSelect
            value={block.styles?.fontWeight}
            onChange={(value) => updateStyle('fontWeight', value)}
          />
        </Form.Item>
        <Form.Item label={__('Line Height', 'kelune-crm')}>
          <PxInput
            value={block.styles?.lineHeight}
            fallback={(parseFloat(block.styles?.fontSize || '16') || 16) + 10}
            onChange={(value) => updateStyle('lineHeight', value)}
          />
        </Form.Item>
        <Form.Item label={__('Color', 'kelune-crm')}>
          <ResettableColor
            value={block.styles?.color}
            defaultValue="#333333"
            onChange={(value) => updateStyle('color', value)}
          />
        </Form.Item>
        <Form.Item
          label={__('Align', 'kelune-crm')}
          style={{ marginBottom: 0 }}
        >
          <Select
            value={block.styles?.textAlign || 'left'}
            onChange={(value) => updateStyle('textAlign', value)}
          >
            <Option value="left">{__('Left', 'kelune-crm')}</Option>
            <Option value="center">{__('Center', 'kelune-crm')}</Option>
            <Option value="right">{__('Right', 'kelune-crm')}</Option>
            <Option value="justify">{__('Justify', 'kelune-crm')}</Option>
          </Select>
        </Form.Item>
      </>
    ),
    image: (
      <>
        <Form.Item label={__('Width', 'kelune-crm')}>
          <Select
            value={block.styles?.width || 'auto'}
            onChange={(value) => updateStyle('width', value)}
          >
            {WIDTH_OPTIONS.map((o) => (
              <Option key={o.value} value={o.value}>
                {o.label}
              </Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item
          label={__('Align', 'kelune-crm')}
          style={{ marginBottom: 0 }}
        >
          <Select
            value={block.styles?.textAlign || 'center'}
            onChange={(value) => updateStyle('textAlign', value)}
          >
            <Option value="left">{__('Left', 'kelune-crm')}</Option>
            <Option value="center">{__('Center', 'kelune-crm')}</Option>
            <Option value="right">{__('Right', 'kelune-crm')}</Option>
          </Select>
        </Form.Item>
      </>
    ),
    button: (
      <>
        <Form.Item label={__('Font Size', 'kelune-crm')}>
          <PxInput
            value={block.styles?.fontSize}
            fallback={16}
            onChange={(value) => updateStyle('fontSize', value)}
          />
        </Form.Item>
        <Form.Item label={__('Font Weight', 'kelune-crm')}>
          <FontWeightSelect
            value={block.styles?.fontWeight}
            onChange={(value) => updateStyle('fontWeight', value)}
          />
        </Form.Item>
        <Form.Item label={__('Line Height', 'kelune-crm')}>
          <PxInput
            value={block.styles?.lineHeight}
            fallback={(parseFloat(block.styles?.fontSize || '16') || 16) + 10}
            onChange={(value) => updateStyle('lineHeight', value)}
          />
        </Form.Item>
        <Form.Item label={__('Color', 'kelune-crm')}>
          <ResettableColor
            value={block.styles?.textColor}
            defaultValue="#FFFFFF"
            onChange={(value) => updateStyle('textColor', value)}
          />
        </Form.Item>
        <Form.Item label={__('Background', 'kelune-crm')}>
          <ResettableColor
            value={block.styles?.backgroundColor}
            defaultValue="#333333"
            onChange={(value) => updateStyle('backgroundColor', value)}
          />
        </Form.Item>
        <Form.Item label={__('Padding', 'kelune-crm')}>
          <BoxInput
            value={block.styles?.buttonPadding || '12px 24px'}
            onChange={(value) => updateStyle('buttonPadding', value)}
          />
        </Form.Item>
        <Form.Item label={__('Radius', 'kelune-crm')}>
          <PxInput
            value={block.styles?.borderRadius}
            fallback={4}
            onChange={(value) => updateStyle('borderRadius', value)}
          />
        </Form.Item>
        <Form.Item label={__('Width', 'kelune-crm')}>
          <Select
            value={block.styles?.width || 'auto'}
            onChange={(value) => updateStyle('width', value)}
          >
            {WIDTH_OPTIONS.map((o) => (
              <Option key={o.value} value={o.value}>
                {o.label}
              </Option>
            ))}
          </Select>
        </Form.Item>
        <Form.Item
          label={__('Align', 'kelune-crm')}
          style={{ marginBottom: 0 }}
        >
          <Select
            value={block.styles?.textAlign || 'center'}
            onChange={(value) => updateStyle('textAlign', value)}
          >
            <Option value="left">{__('Left', 'kelune-crm')}</Option>
            <Option value="center">{__('Center', 'kelune-crm')}</Option>
            <Option value="right">{__('Right', 'kelune-crm')}</Option>
          </Select>
        </Form.Item>
      </>
    ),
    divider: (
      <>
        <Form.Item label={__('Style', 'kelune-crm')}>
          <Select
            value={block.styles?.borderStyle || 'solid'}
            onChange={(value) => updateStyle('borderStyle', value)}
          >
            <Option value="solid">{__('Solid', 'kelune-crm')}</Option>
            <Option value="dashed">{__('Dashed', 'kelune-crm')}</Option>
            <Option value="dotted">{__('Dotted', 'kelune-crm')}</Option>
          </Select>
        </Form.Item>
        <Form.Item label={__('Color', 'kelune-crm')}>
          <ResettableColor
            value={block.styles?.borderColor}
            defaultValue="#DDDDDD"
            onChange={(value) => updateStyle('borderColor', value)}
          />
        </Form.Item>
        <Form.Item label={__('Height', 'kelune-crm')}>
          <PxInput
            value={block.styles?.borderWidth}
            fallback={1}
            onChange={(value) => updateStyle('borderWidth', value)}
          />
        </Form.Item>
        <Form.Item
          label={__('Width', 'kelune-crm')}
          style={{ marginBottom: 0 }}
        >
          <Select
            value={block.styles?.width || 'auto'}
            onChange={(value) => updateStyle('width', value)}
          >
            {WIDTH_OPTIONS.map((o) => (
              <Option key={o.value} value={o.value}>
                {o.label}
              </Option>
            ))}
          </Select>
        </Form.Item>
      </>
    ),
    columns: (
      <>
        <Form.Item label={__('Columns', 'kelune-crm')}>
          <Select
            value={block.styles?.columnCount || 2}
            onChange={(value) => updateStyle('columnCount', value)}
          >
            <Option value={2}>{__('2 Columns', 'kelune-crm')}</Option>
            <Option value={3}>{__('3 Columns', 'kelune-crm')}</Option>
          </Select>
        </Form.Item>
        <Form.Item
          label={__('Padding', 'kelune-crm')}
          style={{ marginBottom: 0 }}
          help={__('Applied inside each column.', 'kelune-crm')}
        >
          <BoxInput
            value={block.styles?.cellPadding}
            onChange={(value) => updateStyle('cellPadding', value)}
          />
        </Form.Item>
      </>
    ),
    spacer: (
      <Form.Item label={__('Height', 'kelune-crm')} style={{ marginBottom: 0 }}>
        <InputNumber
          value={parseInt(block.styles?.height ?? '') || 40}
          onChange={(value) => updateStyle('height', `${value}px`)}
          min={10}
          max={200}
          step={10}
          controls={false}
          addonAfter="px"
          style={{ width: '100%' }}
        />
      </Form.Item>
    ),
  };

  const sectionFields = (
    <>
      <Form.Item label={__('Background', 'kelune-crm')}>
        <ColorPicker
          value={block.styles?.blockBackground || undefined}
          onChange={(color) =>
            updateStyle('blockBackground', color.toHexString())
          }
          onClear={() => updateStyle('blockBackground', '')}
          allowClear
          showText
        />
      </Form.Item>
      <Form.Item label={__('Padding', 'kelune-crm')}>
        <BoxInput
          value={block.styles?.padding}
          onChange={(value) => updateStyle('padding', value)}
        />
      </Form.Item>
      <Form.Item label={__('Margin', 'kelune-crm')} style={{ marginBottom: 0 }}>
        <BoxInput
          value={block.styles?.margin}
          onChange={(value) => updateStyle('margin', value)}
        />
      </Form.Item>
    </>
  );

  const items: CollapseProps['items'] = [];
  if (contentFields[block.type]) {
    items.push({
      key: 'content',
      label: __('Content', 'kelune-crm'),
      children: contentFields[block.type],
    });
  }
  if (styleFields[block.type]) {
    items.push({
      key: 'styles',
      label: __('Styles', 'kelune-crm'),
      children: styleFields[block.type],
    });
  }
  items.push({
    key: 'section',
    label: __('Section', 'kelune-crm'),
    children: sectionFields,
  });

  return (
    // Layout only; the host page owns the form element.
    <Form component="div" layout="vertical">
      <Collapse
        className="kelune-crm-cc-tpl-collapse"
        size="small"
        bordered={false}
        defaultActiveKey={['content', 'styles', 'section']}
        style={{ borderRadius: 0 }}
        items={items}
      />
    </Form>
  );
};

export default BlockProperties;
