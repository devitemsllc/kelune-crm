import React, { useState } from 'react';
import { __ } from '@wordpress/i18n';
import { Tooltip, theme } from 'antd';
import { useSortable } from '@dnd-kit/sortable';
import { DeleteOutlined, DragOutlined, CopyOutlined } from '@ant-design/icons';
import BlockContent from './BlockContent';
import type { EmailBlock } from '@/types/models';

interface SortableBlockProps {
  block: EmailBlock;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  // When provided, replaces the block body (used for editable column blocks).
  children?: React.ReactNode;
}

const SortableBlock = ({
  block,
  isSelected,
  onClick,
  onDelete,
  onDuplicate,
  children,
}: SortableBlockProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
    // `isColumns` lets the builder's collision detection deprioritise a columns
    // block as a drop target, so a drag can enter its cells instead of just
    // reordering it at the parent level.
  } = useSortable({
    id: block.id,
    data: { isColumns: block.type === 'columns' },
  });

  const { token } = theme.useToken();
  const [hovered, setHovered] = useState(false);
  const active = isSelected || hovered;

  const style: React.CSSProperties = isDragging
    ? {
        // Pull the source out of the flow (siblings close up, no lingering
        // ghost) while keeping it rendered with a real size — dnd-kit still
        // needs its rect to position the cursor overlay. The insertion line
        // shows where it will land.
        position: 'absolute',
        width: '100%',
        opacity: 0,
        pointerEvents: 'none',
      }
    : {
        position: 'relative',
        // Outline (not border) so the highlight never reserves layout width —
        // the block stays the same size as the add zone below it.
        outline: active ? `1px solid ${token.colorPrimary}` : 'none',
        outlineOffset: '-1px',
        // Whole block is the drag source; a short activation distance (set on
        // the sensor) keeps a plain click free to select instead of dragging.
        cursor: 'grab',
        backgroundColor: '#fff',
      };

  const iconStyle: React.CSSProperties = {
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    color: '#fff',
  };

  // Swallow the row's onClick so a toolbar action never also selects the block.
  const act = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  // The whole block body is draggable, so spread the sortable listeners on the
  // root. Stop pointer/keyboard events from bubbling to an ancestor columns
  // block — otherwise grabbing a nested block would also arm its parent's drag.
  const dragHandlers = {
    ...listeners,
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      listeners?.onPointerDown?.(e);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      listeners?.onKeyDown?.(e);
    },
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...dragHandlers}
      onClick={(e) => {
        // Stop bubbling so selecting a nested block doesn't also select its
        // parent column block.
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Block toolbar — its own pointer events never start a drag, so the
          Copy/Delete/handle icons stay clickable over the draggable body. */}
      {active && (
        <div
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            background: token.colorPrimary,
            padding: '4px 8px',
            display: 'flex',
            gap: '12px',
            zIndex: 10,
          }}
        >
          <Tooltip title={__('Drag to reorder', 'kelune-crm')}>
            {/* Explicit handle — the reliable grab point for a columns block,
                whose body is filled by nested cells that swallow pointer down. */}
            <span {...listeners} style={{ ...iconStyle, cursor: 'grab' }}>
              <DragOutlined />
            </span>
          </Tooltip>
          <Tooltip title={__('Duplicate', 'kelune-crm')}>
            <span style={iconStyle} onClick={act(onDuplicate)}>
              <CopyOutlined />
            </span>
          </Tooltip>
          <Tooltip title={__('Delete', 'kelune-crm')}>
            <span style={iconStyle} onClick={act(onDelete)}>
              <DeleteOutlined />
            </span>
          </Tooltip>
        </div>
      )}

      {/* Block Content — outer wrapper mirrors the email HTML generator:
          block background + outer padding + margin. (Columns also apply a
          separate per-cell padding inside their editor.) */}
      <div
        style={{
          background: block.styles?.blockBackground || 'transparent',
          padding: block.styles?.padding || '0',
          margin: block.styles?.margin || '0',
        }}
      >
        {children ?? <BlockContent block={block} />}
      </div>
    </div>
  );
};

export default SortableBlock;
