import React from 'react';
import type { EmailBlock } from '@/types/models';

interface BlockProps {
  block: EmailBlock;
}

const DividerBlock = ({ block }: BlockProps) => {
  const {
    borderStyle = 'solid',
    borderColor = '#DDDDDD',
    borderWidth = '1px',
    width = 'auto',
  } = block.styles || {};

  // width 'auto' = full width; a percentage makes a shorter, centred rule.
  const style: React.CSSProperties = {
    border: 'none',
    borderTop: `${borderWidth} ${borderStyle} ${borderColor}`,
    width: width === 'auto' ? '100%' : width,
    margin: '0 auto',
    padding: 0,
  };

  return <hr style={style} />;
};

export default DividerBlock;
