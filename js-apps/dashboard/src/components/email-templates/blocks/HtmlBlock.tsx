import React from 'react';
import type { EmailBlock } from '@/types/models';

interface BlockProps {
  block: EmailBlock;
}

// Canvas body for the HTML block: the author's raw HTML, rendered exactly as the
// export emits it (renderBlockBody's `html` case wraps this same markup). The
// outer background/padding/margin wrapper is applied by SortableBlock, matching
// every other block. Content is sanitized server-side via wp_kses_post on save.
const HtmlBlock = ({ block }: BlockProps) => (
  <div dangerouslySetInnerHTML={{ __html: block.styles?.html ?? '' }} />
);

export default HtmlBlock;
