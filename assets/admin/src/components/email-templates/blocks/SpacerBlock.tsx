import React from 'react';
import type { EmailBlock } from '@/types/models';

interface BlockProps {
  block: EmailBlock;
}

const SpacerBlock = ({ block }: BlockProps) => {
  const { height = '40px' } = block.styles || {};

  const style = {
    height,
    lineHeight: height,
    fontSize: '1px',
  };

  return <div style={style}>&nbsp;</div>;
};

export default SpacerBlock;
