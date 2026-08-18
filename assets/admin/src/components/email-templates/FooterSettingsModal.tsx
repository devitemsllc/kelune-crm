import React, { useRef } from 'react';
import { __ } from '@wordpress/i18n';
import { Drawer, Form, Radio, ColorPicker, Alert } from 'antd';
import type { TemplateSettings } from '@/utils/emailHtml';
import RichTextEditor from '@/components/common/RichTextEditor';
import { FOOTER_MERGE_TAGS } from '@/utils/mergeTags';
import InlineSwitch from '../common/InlineSwitch';
import ModalFooter from '../common/ModalFooter';
import {
  BoxInput,
  FontWeightSelect,
  PxInput,
  ResettableColor,
} from './emailBuilderControls';

// Divider between the drawer's sections.
const sectionRule: React.CSSProperties = {
  borderTop: '1px solid #f0f0f0',
  margin: '20px 0',
};

// Footer keys this drawer edits — snapshotted on open so Cancel / dismiss can
// revert every change made while it was open.
const FOOTER_KEYS = [
  'footerEnabled',
  'footerSource',
  'footerContent',
  'footerFontSize',
  'footerFontWeight',
  'footerLineHeight',
  'footerTextColor',
  'footerLinkColor',
  'footerBackground',
  'footerPadding',
] as const satisfies readonly (keyof TemplateSettings)[];

type FooterPatch = Pick<TemplateSettings, (typeof FOOTER_KEYS)[number]>;

const snapshotFooter = (settings: TemplateSettings): FooterPatch =>
  Object.fromEntries(
    FOOTER_KEYS.map((key) => [key, settings[key]])
  ) as FooterPatch;

interface FooterSettingsModalProps {
  open: boolean;
  settings: TemplateSettings;
  onChange: (patch: Partial<TemplateSettings>) => void;
  onClose: () => void;
}

// Edits the template's footer settings. Every field syncs straight into the
// template settings so the canvas reflects edits live (the builder has no
// Save). "Done" keeps the edits; "Cancel" — and dismissing the drawer without
// Done — reverts to the snapshot taken when it opened. The custom-footer editor
// is the same RichTextEditor the global email settings use, so both author
// footer HTML identically.
const FooterSettingsModal = ({
  open,
  settings,
  onChange,
  onClose,
}: FooterSettingsModalProps) => {
  const isCustom = settings.footerSource === 'custom';
  const customMissingUnsub =
    isCustom && !(settings.footerContent ?? '').includes('{{unsubscribe_url}}');

  // Snapshot the footer settings once per open (destroyOnHidden remounts the
  // drawer each time). Kept in a ref so the live edits below don't clobber it.
  const snapshot = useRef<FooterPatch | null>(null);
  if (snapshot.current === null) {
    snapshot.current = snapshotFooter(settings);
  }

  // Keep the edits and close.
  const handleDone = () => {
    snapshot.current = null;
    onClose();
  };

  // Discard every edit made while open, then close.
  const handleCancel = () => {
    if (snapshot.current) {
      onChange(snapshot.current);
    }
    snapshot.current = null;
    onClose();
  };

  return (
    <Drawer
      destroyOnHidden
      // Narrow by default; widen to fit the rich-text editor only when the
      // custom footer is actually shown (mirrors the campaign editor drawer).
      width={settings.footerEnabled && isCustom ? 600 : 340}
      title={__('Email Footer', 'kelune-crm')}
      open={open}
      onClose={handleCancel}
      footer={
        <ModalFooter
          okText={__('Done', 'kelune-crm')}
          onOk={handleDone}
          onCancel={handleCancel}
        />
      }
    >
      <Form layout="vertical">
        <InlineSwitch
          inline
          checked={settings.footerEnabled}
          onChange={(checked) => onChange({ footerEnabled: checked })}
          label={__('Show Email Footer', 'kelune-crm')}
          style={{ marginBottom: 0 }}
        />

        {settings.footerEnabled && (
          <>
            <div style={sectionRule} />

            <Form.Item style={{ marginBottom: isCustom ? 16 : 0 }}>
              <Radio.Group
                value={settings.footerSource}
                onChange={(e) => onChange({ footerSource: e.target.value })}
              >
                <Radio value="global">
                  {__('Global Footer', 'kelune-crm')}
                </Radio>
                <Radio value="custom">
                  {__('Custom Footer', 'kelune-crm')}
                </Radio>
              </Radio.Group>
            </Form.Item>

            {isCustom && (
              <Form.Item
                label={__('Footer Content', 'kelune-crm')}
                tooltip={__(
                  'Insert dynamic values with the Placeholders button.',
                  'kelune-crm'
                )}
              >
                <RichTextEditor
                  height={200}
                  placeholders={FOOTER_MERGE_TAGS}
                  value={settings.footerContent}
                  onChange={(value) => onChange({ footerContent: value })}
                />
                {customMissingUnsub && (
                  <Alert
                    type="warning"
                    style={{ border: 'none', marginTop: 8 }}
                    message={__(
                      'Add the {{unsubscribe_url}} merge tag so recipients can opt out — required by anti-spam law.',
                      'kelune-crm'
                    )}
                  />
                )}
              </Form.Item>
            )}

            <div style={sectionRule} />

            <Form.Item label={__('Font Size', 'kelune-crm')}>
              <div style={{ maxWidth: 250 }}>
                <PxInput
                  value={settings.footerFontSize}
                  fallback={14}
                  onChange={(value) => onChange({ footerFontSize: value })}
                />
              </div>
            </Form.Item>
            <Form.Item label={__('Font Weight', 'kelune-crm')}>
              <div style={{ maxWidth: 250 }}>
                <FontWeightSelect
                  value={settings.footerFontWeight}
                  onChange={(value) => onChange({ footerFontWeight: value })}
                />
              </div>
            </Form.Item>
            <Form.Item label={__('Line Height', 'kelune-crm')}>
              <div style={{ maxWidth: 250 }}>
                <PxInput
                  value={settings.footerLineHeight}
                  fallback={
                    (parseFloat(settings.footerFontSize || '14') || 14) + 10
                  }
                  onChange={(value) => onChange({ footerLineHeight: value })}
                />
              </div>
            </Form.Item>
            <Form.Item label={__('Color', 'kelune-crm')}>
              <ResettableColor
                value={settings.footerTextColor}
                defaultValue="#333333"
                onChange={(value) => onChange({ footerTextColor: value })}
              />
            </Form.Item>
            <Form.Item label={__('Link Color', 'kelune-crm')}>
              <ResettableColor
                value={settings.footerLinkColor}
                defaultValue="#1677ff"
                onChange={(value) => onChange({ footerLinkColor: value })}
              />
            </Form.Item>
            <Form.Item label={__('Background', 'kelune-crm')}>
              <ColorPicker
                // 'transparent' is the cleared state — ColorPicker can't
                // represent it as a swatch, so show it cleared rather than black.
                value={
                  settings.footerBackground &&
                  settings.footerBackground !== 'transparent'
                    ? settings.footerBackground
                    : undefined
                }
                onChange={(color) =>
                  onChange({ footerBackground: color.toHexString() })
                }
                onClear={() => onChange({ footerBackground: 'transparent' })}
                allowClear
                showText
              />
            </Form.Item>
            <Form.Item
              label={__('Padding', 'kelune-crm')}
              style={{ marginBottom: 0 }}
            >
              <div style={{ maxWidth: 250 }}>
                <BoxInput
                  value={settings.footerPadding}
                  onChange={(value) => onChange({ footerPadding: value })}
                />
              </div>
            </Form.Item>
          </>
        )}
      </Form>
    </Drawer>
  );
};

export default FooterSettingsModal;
