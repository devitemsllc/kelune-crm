/**
 * Default block styles and starter content for the email builder.
 *
 * Single source of truth for a block's initial styles — used both when the
 * builder adds a block and when a brand-new template is seeded with a starter
 * block on creation, so the two never drift.
 */
import { __ } from '@wordpress/i18n';
import { nextBlockId } from './blockTree';
import {
  generateEmailHtml,
  DEFAULT_TEMPLATE_SETTINGS,
} from '@/utils/emailHtml';
import type { EmailBlock, EmailBlockStyles } from '@/types/models';

export const getDefaultStyles = (type: string): EmailBlockStyles => {
  // Every block shares one Section rhythm: no outer padding, 15px bottom margin.
  const SECTION = { padding: '0 0 0 0', margin: '0 0 15px 0' };
  const defaults: Record<string, EmailBlockStyles> = {
    text: {
      content: __('Enter your text here...', 'kelune-crm'),
      fontSize: '16px',
      color: '#333333',
      fontWeight: '400',
      textAlign: 'left',
      // lineHeight intentionally unset → auto-tracks font-size (defaultLineHeight,
      // 16px → 26px) in the renderers/canvas/field until the author overrides it.
      ...SECTION,
    },
    html: {
      html: '<p>' + __('Your HTML here', 'kelune-crm') + '</p>',
      ...SECTION,
    },
    image: {
      src: '',
      alt: __('Image', 'kelune-crm'),
      link: '',
      width: 'auto',
      textAlign: 'center',
      ...SECTION,
    },
    button: {
      text: __('Click Me', 'kelune-crm'),
      link: '#',
      backgroundColor: '#333333',
      textColor: '#FFFFFF',
      fontSize: '16px',
      borderRadius: '4px',
      textAlign: 'center',
      buttonPadding: '12px 24px',
      width: 'auto',
      ...SECTION,
    },
    divider: {
      borderStyle: 'solid',
      borderColor: '#DDDDDD',
      borderWidth: '1px',
      width: 'auto',
      ...SECTION,
    },
    columns: {
      columnCount: 2,
      columns: [],
      // Per-cell padding; outer Section padding/margin stay at zero.
      cellPadding: '0 0 0 0',
      padding: '0 0 0 0',
      margin: '0 0 0 0',
    },
    spacer: {
      height: '40px',
      padding: '0 0 0 0',
      margin: '0 0 0 0',
    },
  };

  return defaults[type] || {};
};

/**
 * Starter content for a freshly created template: a single Text block with the
 * default styles, plus the default template settings — so the builder opens on a
 * ready-to-edit block instead of an empty canvas. Returns both the persisted
 * shapes: the generated `html_content` and the `json_structure` block tree.
 */
export const buildDefaultTemplateContent = (): {
  html_content: string;
  json_structure: string;
} => {
  const blocks: EmailBlock[] = [
    { id: nextBlockId(), type: 'text', styles: getDefaultStyles('text') },
  ];
  const settings = { ...DEFAULT_TEMPLATE_SETTINGS };
  return {
    html_content: generateEmailHtml(blocks, settings),
    json_structure: JSON.stringify({ blocks, settings }),
  };
};
