import React from 'react';
import { __ } from '@wordpress/i18n';
import type { EmailBlock } from '@/types/models';
import { defaultLineHeight, styleRichContent } from '@/utils/emailHtml';

interface BlockProps {
  block: EmailBlock;
}

const TextBlock = ({ block }: BlockProps) => {
  const {
    content = __('Enter your text here...', 'kelune-crm'),
    fontSize = '16px',
    color = '#333333',
    fontWeight = '400',
    textAlign = 'left',
  } = block.styles || {};
  // Default line-height tracks font-size (+10px) when the author hasn't set one.
  const lineHeight = block.styles?.lineHeight || defaultLineHeight(fontSize);

  // font-family intentionally omitted so text inherits the template Base Font.
  const style = {
    fontSize,
    color,
    fontWeight,
    textAlign,
    lineHeight,
    margin: 0,
  };

  // Render the content as HTML so the canvas matches the exported email (the
  // Content field holds author HTML, sanitized server-side via wp_kses_post).
  // styleRichContent inlines the same per-child spacing the export applies, so
  // the canvas and the sent email agree on paragraph/list/blockquote gaps.
  return (
    <div
      className="kelune-crm-cc-rich-text"
      style={style}
      dangerouslySetInnerHTML={{ __html: styleRichContent(content) }}
    />
  );
};

export default TextBlock;
