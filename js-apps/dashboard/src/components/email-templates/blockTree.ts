// Recursive helpers for the email block tree; blocks can nest inside column
// blocks (styles.columns[i].blocks), so ops walk the tree and match by id.
import type { EmailBlock } from '@/types/models';

// Monotonic id counter so two blocks added in the same millisecond can't collide.
let blockSeq = 0;
export const nextBlockId = (): string =>
  `block-${Date.now()}-${(blockSeq += 1)}`;

const columnsOf = (block: EmailBlock) => block.styles?.columns;

const withColumns = (
  block: EmailBlock,
  mapColumnBlocks: (blocks: EmailBlock[]) => EmailBlock[]
): EmailBlock => {
  const cols = columnsOf(block);
  if (!cols) {
    return block;
  }
  return {
    ...block,
    styles: {
      ...block.styles,
      columns: cols.map((c) =>
        c.blocks ? { ...c, blocks: mapColumnBlocks(c.blocks) } : c
      ),
    },
  };
};

// Deep clone a block (and any nested column blocks) with fresh ids.
const cloneBlock = (block: EmailBlock): EmailBlock => {
  const styles = { ...block.styles };
  if (styles.columns) {
    styles.columns = styles.columns.map((col) => ({
      ...col,
      blocks: (col.blocks || []).map(cloneBlock),
    }));
  }
  return { ...block, id: nextBlockId(), styles };
};

export const findBlock = (
  blocks: EmailBlock[],
  id: string
): EmailBlock | null => {
  for (const b of blocks) {
    if (b.id === id) {
      return b;
    }
    for (const c of columnsOf(b) || []) {
      const found = c.blocks ? findBlock(c.blocks, id) : null;
      if (found) {
        return found;
      }
    }
  }
  return null;
};

export const updateBlock = (
  blocks: EmailBlock[],
  id: string,
  updates: Partial<EmailBlock>
): EmailBlock[] =>
  blocks.map((b) => {
    if (b.id === id) {
      return { ...b, ...updates };
    }
    return withColumns(b, (nested) => updateBlock(nested, id, updates));
  });

export const removeBlock = (blocks: EmailBlock[], id: string): EmailBlock[] =>
  blocks
    .filter((b) => b.id !== id)
    .map((b) => withColumns(b, (nested) => removeBlock(nested, id)));

export const duplicateBlock = (
  blocks: EmailBlock[],
  id: string
): EmailBlock[] => {
  const index = blocks.findIndex((b) => b.id === id);
  if (index !== -1) {
    const next = [...blocks];
    next.splice(index + 1, 0, cloneBlock(blocks[index]));
    return next;
  }
  return blocks.map((b) =>
    withColumns(b, (nested) => duplicateBlock(nested, id))
  );
};

// Container-aware moves (cross-column drag & drop). A "container" is any sibling
// list that can hold blocks: the top level (ROOT_CONTAINER) or a single column
// cell of a columns block (`${columnsId}::${colIndex}`). These ids double as
// @dnd-kit droppable ids, so a block can be dragged between any two containers.
export const ROOT_CONTAINER = 'root';
const COL_SEP = '::';

// Block ids are `block-<ts>-<n>` (no `::`), so a `::` unambiguously marks a
// column container id.
export const columnContainerId = (
  columnsId: string,
  colIndex: number
): string => `${columnsId}${COL_SEP}${colIndex}`;

const parseColumnContainer = (
  id: string
): { columnsId: string; colIndex: number } | null => {
  const at = id.lastIndexOf(COL_SEP);
  if (at === -1) {
    return null;
  }
  return {
    columnsId: id.slice(0, at),
    colIndex: Number(id.slice(at + COL_SEP.length)),
  };
};

// True when `id` names a drop container rather than a block.
export const isContainerId = (id: string): boolean =>
  id === ROOT_CONTAINER || parseColumnContainer(id) !== null;

// True when `id` names a column cell (i.e. a container inside a columns block).
export const isColumnContainer = (id: string): boolean =>
  parseColumnContainer(id) !== null;

// The columns block id owning a column container, or null for root/any block.
export const columnsIdOf = (containerId: string): string | null =>
  parseColumnContainer(containerId)?.columnsId ?? null;

// Which container currently holds `blockId` (null if it isn't in the tree).
export const findContainerOf = (
  blocks: EmailBlock[],
  blockId: string,
  container: string = ROOT_CONTAINER
): string | null => {
  for (const b of blocks) {
    if (b.id === blockId) {
      return container;
    }
    const cols = columnsOf(b);
    if (cols) {
      for (let i = 0; i < cols.length; i += 1) {
        const found = cols[i].blocks
          ? findContainerOf(
              cols[i].blocks!,
              blockId,
              columnContainerId(b.id, i)
            )
          : null;
        if (found) {
          return found;
        }
      }
    }
  }
  return null;
};

// The sibling list backing a container id.
export const containerBlocks = (
  blocks: EmailBlock[],
  containerId: string
): EmailBlock[] => {
  if (containerId === ROOT_CONTAINER) {
    return blocks;
  }
  const parsed = parseColumnContainer(containerId);
  if (!parsed) {
    return [];
  }
  const colBlock = findBlock(blocks, parsed.columnsId);
  return colBlock?.styles?.columns?.[parsed.colIndex]?.blocks || [];
};

// Insert `block` into `containerId` at `index`. Also used to drop a brand-new
// palette block at an exact position.
export const insertIntoContainer = (
  blocks: EmailBlock[],
  containerId: string,
  block: EmailBlock,
  index: number
): EmailBlock[] => {
  if (containerId === ROOT_CONTAINER) {
    const next = [...blocks];
    next.splice(index, 0, block);
    return next;
  }
  const parsed = parseColumnContainer(containerId);
  if (!parsed) {
    return blocks;
  }
  return blocks.map((b) => {
    if (b.id === parsed.columnsId) {
      const count = b.styles?.columnCount || 2;
      const cols = [...(b.styles?.columns || [])];
      while (cols.length < count) {
        cols.push({ blocks: [] });
      }
      const target = cols[parsed.colIndex] || { blocks: [] };
      const arr = [...(target.blocks || [])];
      arr.splice(index, 0, block);
      cols[parsed.colIndex] = { ...target, blocks: arr };
      return { ...b, styles: { ...b.styles, columns: cols } };
    }
    return withColumns(b, (nested) =>
      insertIntoContainer(nested, containerId, block, index)
    );
  });
};

// Move `activeId` into `targetContainerId` at `targetIndex`. No-ops on moves
// that would nest columns (unsupported) or drop a block into its own subtree.
export const moveBlock = (
  blocks: EmailBlock[],
  activeId: string,
  targetContainerId: string,
  targetIndex: number
): EmailBlock[] => {
  const block = findBlock(blocks, activeId);
  if (!block) {
    return blocks;
  }
  const parsed = parseColumnContainer(targetContainerId);
  if (parsed) {
    // Columns can't nest inside a column, and a block can't move into a column
    // that lives inside itself.
    if (block.type === 'columns' || findBlock([block], parsed.columnsId)) {
      return blocks;
    }
  }
  const without = removeBlock(blocks, activeId);
  return insertIntoContainer(without, targetContainerId, block, targetIndex);
};

// Append `block` into a specific column of a specific columns block.
export const addToColumn = (
  blocks: EmailBlock[],
  columnsId: string,
  colIndex: number,
  block: EmailBlock
): EmailBlock[] =>
  blocks.map((b) => {
    if (b.id === columnsId) {
      const count = b.styles?.columnCount || 2;
      const cols = [...(b.styles?.columns || [])];
      while (cols.length < count) {
        cols.push({ blocks: [] });
      }
      const target = cols[colIndex] || { blocks: [] };
      cols[colIndex] = { ...target, blocks: [...(target.blocks || []), block] };
      return { ...b, styles: { ...b.styles, columns: cols } };
    }
    return withColumns(b, (nested) =>
      addToColumn(nested, columnsId, colIndex, block)
    );
  });
