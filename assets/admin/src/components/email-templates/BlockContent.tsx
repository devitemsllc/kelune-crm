import { __ } from '@wordpress/i18n';
import TextBlock from './blocks/TextBlock';
import HtmlBlock from './blocks/HtmlBlock';
import ImageBlock from './blocks/ImageBlock';
import ButtonBlock from './blocks/ButtonBlock';
import DividerBlock from './blocks/DividerBlock';
import SpacerBlock from './blocks/SpacerBlock';
import type { EmailBlock } from '@/types/models';

// Renders a leaf block's canvas body. Shared by SortableBlock (in-place) and
// the drag overlay so a dragged block always previews as its real content.
const BlockContent = ({ block }: { block: EmailBlock }) => {
  switch (block.type) {
    case 'text':
      return <TextBlock block={block} />;
    case 'html':
      return <HtmlBlock block={block} />;
    case 'image':
      return <ImageBlock block={block} />;
    case 'button':
      return <ButtonBlock block={block} />;
    case 'divider':
      return <DividerBlock block={block} />;
    case 'spacer':
      return <SpacerBlock block={block} />;
    default:
      return <div>{__('Unknown block type', 'kelune-crm')}</div>;
  }
};

export default BlockContent;
