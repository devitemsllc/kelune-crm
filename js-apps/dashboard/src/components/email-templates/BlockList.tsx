import React from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import SortableBlock from './SortableBlock';
import AddBlockPicker from './AddBlockPicker';
import type { PaletteBlock } from './AddBlockPicker';
import { ROOT_CONTAINER, columnContainerId } from './blockTree';
import type { EmailBlock } from '@/types/models';

export interface ColumnTarget {
  columnsId: string;
  colIndex: number;
}

// Where the drop line should render: which container list and the insertion
// index within it. Used for both new (palette) and existing block drags.
export interface DropIndicator {
  containerId: string;
  index: number;
}

interface BlockListProps {
  blocks: EmailBlock[];
  // Where this list's "add" inserts; null appends at the top level.
  parent?: ColumnTarget | null;
  selectedId: string | null;
  // Elementor-style insertion line for an in-flight palette drag.
  dropIndicator?: DropIndicator | null;
  palette: PaletteBlock[];
  onSelect: (id: string) => void;
  onAdd: (type: string, parent: ColumnTarget | null) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

// 12px primary-filled bar marking where a dragged block will land.
const DropLine = () => (
  <div
    style={{
      height: 12,
      width: '100%',
      background: '#1677ff',
      borderRadius: 2,
    }}
  />
);

// Renders a single (possibly nested) list of blocks: sortable items plus an
// add-block picker at the bottom. Column blocks recurse into one BlockList per
// column. All mutations are delegated up to the builder by id.
const BlockList = ({
  blocks,
  parent = null,
  selectedId,
  dropIndicator = null,
  palette,
  onSelect,
  onAdd,
  onDelete,
  onDuplicate,
}: BlockListProps) => {
  const containerId = parent
    ? columnContainerId(parent.columnsId, parent.colIndex)
    : ROOT_CONTAINER;
  // The insertion index for this list, or null when the line belongs elsewhere.
  const lineIndex =
    dropIndicator && dropIndicator.containerId === containerId
      ? dropIndicator.index
      : null;
  const renderColumnsEditor = (block: EmailBlock) => {
    const count = block.styles?.columnCount || 2;
    const cols = block.styles?.columns || [];
    // Per-cell padding (separate from the block's outer Section padding).
    const cellPadding = block.styles?.cellPadding || '0';
    return (
      <div style={{ display: 'flex' }}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              minWidth: 0,
              padding: cellPadding,
              // Edit-canvas guide only — not emitted in the email HTML.
              border: '1px dashed #d9d9d9',
              // An empty cell needs height to be an easy drop target (there's no
              // add-block box inside columns); a filled cell hugs its content, so
              // an all-filled columns block has no forced min height.
              minHeight: cols[i]?.blocks?.length ? undefined : 100,
              // Flex column so the inner list fills the cell height.
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <BlockList
              blocks={cols[i]?.blocks || []}
              parent={{ columnsId: block.id, colIndex: i }}
              selectedId={selectedId}
              dropIndicator={dropIndicator}
              palette={palette}
              onSelect={onSelect}
              onAdd={onAdd}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
            />
          </div>
        ))}
      </div>
    );
  };

  // `containerId` (computed above) is also the DnD droppable id, registered here
  // so a block can be dropped into an EMPTY column, where no sortable item exists
  // to collide with.
  const { setNodeRef } = useDroppable({ id: containerId });

  return (
    <SortableContext
      items={blocks.map((b) => b.id)}
      strategy={verticalListSortingStrategy}
    >
      <div
        ref={setNodeRef}
        // In a column the wrapper fills the cell so its whole height is a drop
        // target; at the top level it stays out of the way as a plain
        // block-flow container.
        style={
          parent
            ? {
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
              }
            : undefined
        }
      >
        {blocks.map((block, i) => (
          <React.Fragment key={block.id}>
            {lineIndex === i && <DropLine />}
            <SortableBlock
              block={block}
              isSelected={selectedId === block.id}
              onClick={() => onSelect(block.id)}
              onDelete={() => onDelete(block.id)}
              onDuplicate={() => onDuplicate(block.id)}
            >
              {block.type === 'columns'
                ? renderColumnsEditor(block)
                : undefined}
            </SortableBlock>
          </React.Fragment>
        ))}
        {lineIndex !== null && lineIndex >= blocks.length && <DropLine />}
        {/* Empty-state add-block placeholder: the top-level empty canvas (dashed
            box) and every empty column cell (borderless — the cell already draws
            its own outline). Hidden once a block exists; blocks are otherwise
            added by dragging from the sidebar. */}
        {blocks.length === 0 && (
          <AddBlockPicker
            blocks={palette}
            bordered={!parent}
            fill={!!parent}
            onPick={(type) => onAdd(type, parent)}
          />
        )}
      </div>
    </SortableContext>
  );
};

export default BlockList;
