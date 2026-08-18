import React from 'react';
import { __ } from '@wordpress/i18n';
import type { EmailBlock } from '@/types/models';

interface BlockProps {
  block: EmailBlock;
  isPreview?: boolean;
}

const ButtonBlock = ({ block, isPreview = false }: BlockProps) => {
  const {
    text = __('Click Me', 'kelune-crm'),
    link = '#',
    backgroundColor = '#333333',
    textColor = '#FFFFFF',
    fontSize = '16px',
    fontWeight = 'normal',
    lineHeight = 'normal',
    borderRadius = '4px',
    textAlign = 'center',
    buttonPadding = '12px 24px',
    width = 'auto',
  } = block.styles || {};

  const containerStyle: React.CSSProperties = {
    textAlign,
  };

  // width 'auto' = button hugs its text; a percentage makes a fixed-width CTA.
  // font-family omitted so the button inherits the template Base Font.
  const buttonStyle: React.CSSProperties = {
    display: 'inline-block',
    ...(width !== 'auto' ? { width, boxSizing: 'border-box' } : {}),
    padding: buttonPadding,
    backgroundColor,
    color: textColor,
    fontSize,
    fontWeight,
    lineHeight,
    borderRadius,
    textDecoration: 'none',
    border: 'none',
    cursor: isPreview ? 'pointer' : 'default',
  };

  return (
    <div style={containerStyle}>
      {isPreview && link && link !== '#' ? (
        <a href={link} style={buttonStyle}>
          {text}
        </a>
      ) : (
        <span style={buttonStyle}>{text}</span>
      )}
    </div>
  );
};

export default ButtonBlock;
