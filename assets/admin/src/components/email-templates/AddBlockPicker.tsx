import React, { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { Button, Dropdown, theme } from 'antd';
import { PlusCircleFilled } from '@ant-design/icons';
import { useDraggable } from '@dnd-kit/core';

export interface PaletteBlock {
  type: string;
  label: string;
  icon: React.ReactNode;
}

// Prefix marking a new-block-from-palette drag apart from an existing-block reorder.
const PALETTE_DRAG_PREFIX = 'palette:';

const paletteButtonStyle: React.CSSProperties = {
  height: 'auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '12px 8px',
};

const PaletteButtonBody = ({ block }: { block: PaletteBlock }) => (
  <>
    <span style={{ fontSize: 24, lineHeight: 1 }}>{block.icon}</span>
    <span style={{ fontSize: 12 }}>{block.label}</span>
  </>
);

// A palette button that can also be dragged straight onto the canvas. Keeps its
// onClick so click-to-add still works; the sensor's activation distance keeps a
// plain click from being read as a zero-distance drag.
const DraggablePaletteButton = ({
  block,
  onPick,
}: {
  block: PaletteBlock;
  onPick: (type: string) => void;
}) => {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `${PALETTE_DRAG_PREFIX}${block.type}`,
    data: { source: 'palette', blockType: block.type },
  });
  return (
    <Button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onPick(block.type)}
      style={{
        ...paletteButtonStyle,
        cursor: 'grab',
        opacity: isDragging ? 0.5 : 1,
        // Let the pointer sensor own touch gestures instead of the browser
        // scrolling/selecting.
        touchAction: 'none',
      }}
    >
      <PaletteButtonBody block={block} />
    </Button>
  );
};

interface PaletteGridProps {
  blocks: PaletteBlock[];
  onPick: (type: string) => void;
  // When true, each button is also a drag source (used in the sidebar). The
  // add-block dropdowns leave it off and stay click-only.
  draggable?: boolean;
}

// Two-up grid of block buttons — shared by the sidebar Blocks tab and the
// add-block dropdowns so they stay visually identical.
export const PaletteGrid = ({
  blocks,
  onPick,
  draggable = false,
}: PaletteGridProps) => (
  <div
    style={{
      padding: 16,
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
    }}
  >
    {blocks.map((b) =>
      draggable ? (
        <DraggablePaletteButton key={b.type} block={b} onPick={onPick} />
      ) : (
        <Button
          key={b.type}
          onClick={() => onPick(b.type)}
          style={paletteButtonStyle}
        >
          <PaletteButtonBody block={b} />
        </Button>
      )
    )}
  </div>
);

interface AddBlockPickerProps {
  blocks: PaletteBlock[];
  onPick: (type: string) => void;
  // Empty columns reuse this as their empty-block placeholder, but borderless
  // (the column cell already provides the outline).
  bordered?: boolean;
  // Stretch to fill the parent (a flex-column cell) so the plus sits in the
  // vertical middle of an empty column.
  fill?: boolean;
}

// Dashed "add block" drop zone with a centered plus that opens the palette.
// The empty-canvas state and empty column cells both render it.
const AddBlockPicker = ({
  blocks,
  onPick,
  bordered = true,
  fill = false,
}: AddBlockPickerProps) => {
  const { token } = theme.useToken();
  const [open, setOpen] = useState(false);
  const [iconHovered, setIconHovered] = useState(false);

  return (
    <div
      style={{
        border: bordered ? '1px dashed #d9d9d9' : 'none',
        padding: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...(fill ? { flex: 1 } : {}),
      }}
    >
      <Dropdown
        open={open}
        onOpenChange={setOpen}
        trigger={['click']}
        placement="bottom"
        arrow
        popupRender={() => (
          <div
            style={{
              width: 280,
              background: token.colorBgElevated,
              borderRadius: token.borderRadiusLG,
              boxShadow: token.boxShadowSecondary,
            }}
          >
            <PaletteGrid
              blocks={blocks}
              onPick={(type) => {
                onPick(type);
                setOpen(false);
              }}
            />
          </div>
        )}
      >
        <Button
          color="default"
          variant="link"
          aria-label={__('Add block', 'kelune-crm')}
          onMouseEnter={() => setIconHovered(true)}
          onMouseLeave={() => setIconHovered(false)}
          icon={
            <PlusCircleFilled
              style={{
                fontSize: 32,
                color: iconHovered ? '#c9c9c9' : '#d9d9d9',
              }}
            />
          }
        />
      </Dropdown>
    </div>
  );
};

export default AddBlockPicker;
