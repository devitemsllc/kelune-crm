/**
 * Email Template Builder
 *
 * Drag-and-drop email template builder. Blocks are edited on a WYSIWYG canvas
 * (React block components); the saved/sent HTML is produced by the single pure
 * generator in utils/emailHtml.ts so the canvas and the export never drift.
 *
 * @param template  Existing template to edit (optional)
 * @param onChange  Fires on every edit with { html_content, json_structure };
 *                  the host persists it on its own save (the builder has none).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { __, sprintf } from '@wordpress/i18n';
import {
  Button,
  Card,
  Dropdown,
  Drawer,
  Form,
  InputNumber,
  Segmented,
  Tabs,
  Modal,
  Input,
  Typography,
  message,
} from 'antd';
import {
  FileTextOutlined,
  CodeOutlined,
  PictureOutlined,
  LinkOutlined,
  MinusOutlined,
  ColumnWidthOutlined,
  ColumnHeightOutlined,
  BorderOutlined,
  BorderBottomOutlined,
  EyeOutlined,
  EditOutlined,
  SendOutlined,
  DesktopOutlined,
  MobileOutlined,
  LeftOutlined,
  MoreOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { CollisionDetection } from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import BlockList from './BlockList';
import type { ColumnTarget, DropIndicator } from './BlockList';
import { PaletteGrid } from './AddBlockPicker';
import type { PaletteBlock } from './AddBlockPicker';
import BlockProperties from './BlockProperties';
import TemplateSettingsPanel from './TemplateSettingsPanel';
import {
  generateEmailHtml,
  DEFAULT_TEMPLATE_SETTINGS,
  colorizeAnchors,
  defaultLineHeight,
} from '@/utils/emailHtml';
import type { TemplateSettings } from '@/utils/emailHtml';
import {
  getFooterPreviewContent,
  resolveFooterForPreview,
  withPreviewStyle,
} from '@/utils/emailFooter';
import FooterSettingsModal from './FooterSettingsModal';
import {
  nextBlockId,
  findBlock,
  updateBlock as updateBlockInTree,
  removeBlock,
  duplicateBlock as duplicateBlockInTree,
  addToColumn,
  findContainerOf,
  containerBlocks,
  isContainerId,
  isColumnContainer,
  columnsIdOf,
  insertIntoContainer,
  moveBlock,
} from './blockTree';
import { getDefaultStyles } from './blockDefaults';
import ModalFooter from '../common/ModalFooter';
import { useListState } from '../../hooks/useListState';
import useScreens from '../../hooks/useScreens';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import type { EmailTemplate, EmailBlock } from '@/types/models';
import SubmitOnEnter from '../common/SubmitOnEnter';
import type {
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';

interface EmailTemplateBuilderProps {
  template?: EmailTemplate | null;
  /**
   * Continuously reports the builder's current content (generated HTML + block
   * tree). The builder has no Save button — every edit syncs out here, and the
   * embedding host persists it on ITS own save (campaign save, automation step
   * save, or the template page's header Save).
   */
  onChange?: (data: { html_content: string; json_structure: string }) => void;
  /**
   * Reports the builder's preview/edit state to the host so it can react — the
   * embedding EmailContentEditor disables its editor switcher while previewing.
   */
  onPreviewChange?: (preview: boolean) => void;
}

// Canvas-height preference bounds — shared with the automation workflow builder's
// control. One persisted value is reused across all three builder hosts (template
// page, campaign, automation step), so setting it anywhere applies everywhere.
const CANVAS_HEIGHT_MIN = 300;
const CANVAS_HEIGHT_MAX = 2000;
const CANVAS_HEIGHT_DEFAULT = 600;

// Shape persisted in json_structure.
interface TemplateStructure {
  blocks?: EmailBlock[];
  settings?: Partial<TemplateSettings>;
}

// A columns block wraps its cells, so its rect sits under the pointer whenever a
// cell does — and being a top-level sortable it tends to win closestCenter,
// trapping the drag at the parent level. Prefer any non-columns target (an inner
// block or a column-cell container) so a block can be dropped INTO a columns
// block; fall back to the raw hits (and finally closestCenter) otherwise.
const collisionDetection: CollisionDetection = (args) => {
  const { droppableContainers, droppableRects, pointerCoordinates } = args;
  const pointerHits = pointerWithin(args);
  const hits = pointerHits.length ? pointerHits : rectIntersection(args);
  if (hits.length === 0) {
    return closestCenter(args);
  }
  // Near a columns block's top/bottom edge → target the columns block itself, so
  // a block can be dropped at the PARENT level (e.g. between two stacked columns
  // blocks, or above/below one) instead of always diving into a cell.
  const y = pointerCoordinates?.y ?? null;
  const EDGE = 10;
  if (y !== null) {
    for (const hit of hits) {
      const container = droppableContainers.find((d) => d.id === hit.id);
      if (!container?.data?.current?.isColumns) {
        continue;
      }
      const rect = droppableRects.get(hit.id);
      if (rect && (y - rect.top < EDGE || rect.bottom - y < EDGE)) {
        return [hit];
      }
    }
  }
  // Otherwise prefer a non-columns target (an inner block or a column-cell
  // container) so the drag enters the columns block rather than sticking to the
  // wrapper, which as a big top-level rect would otherwise win closestCenter.
  const preferred = hits.filter((hit) => {
    const container = droppableContainers.find((d) => d.id === hit.id);
    return !container?.data?.current?.isColumns;
  });
  const pool = preferred.length ? preferred : hits;
  const poolIds = new Set(pool.map((p) => p.id));
  return closestCenter({
    ...args,
    droppableContainers: droppableContainers.filter((d) => poolIds.has(d.id)),
  });
};

const EmailTemplateBuilder = ({
  template,
  onChange,
  onPreviewChange,
}: EmailTemplateBuilderProps) => {
  const structure = template?.json_structure as TemplateStructure | undefined;

  const [blocks, setBlocks] = useState<EmailBlock[]>(structure?.blocks || []);
  const [settings, setSettings] = useState<TemplateSettings>({
    ...DEFAULT_TEMPLATE_SETTINGS,
    ...(structure?.settings || {}),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  // Set instead of activeDragId while dragging a NEW block out of the palette.
  const [activePaletteType, setActivePaletteType] = useState<string | null>(
    null
  );
  // Where the insertion line renders during a palette drag; the new block is
  // only committed to the tree on drop.
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
    null
  );
  const [previewMode, setPreviewMode] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>(
    'desktop'
  );

  // Below 992px the fixed 280px sidebar + canvas can't sit side-by-side, so the
  // sidebar (Blocks/Settings tabs, or the selected block's properties) moves into
  // a toggleable Drawer and the canvas takes the full width. Blocks are added by
  // tap (the palette's click-to-add) since drag-drop isn't practical on touch.
  const { xs, sm, md } = useScreens();
  const narrow = xs || sm || md;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // On narrow screens, reveal the drawer when a block is selected so its
  // properties are reachable; close it whenever preview mode is entered.
  useEffect(() => {
    if (narrow && selectedId) {
      setSidebarOpen(true);
    }
  }, [narrow, selectedId]);
  useEffect(() => {
    if (previewMode) {
      setSidebarOpen(false);
    }
  }, [previewMode]);

  // Keep the host in sync with preview/edit state (fires on mount with `false`,
  // so a remount after a mode switch resets any stale host state).
  useEffect(() => {
    onPreviewChange?.(previewMode);
  }, [previewMode, onPreviewChange]);

  const [testOpen, setTestOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Canvas height is a shared view-preference, persisted in the same list-state
  // store as the automation builder so it survives reloads and applies to every
  // host that embeds this builder.
  const [builderPrefs, setBuilderPrefs] = useListState(
    'email_template_builder',
    {
      canvasHeight: CANVAS_HEIGHT_DEFAULT,
    }
  );
  const [heightModalOpen, setHeightModalOpen] = useState(false);
  const [heightDraft, setHeightDraft] = useState<number>(CANVAS_HEIGHT_DEFAULT);
  const [footerModalOpen, setFooterModalOpen] = useState(false);
  const [footerHovered, setFooterHovered] = useState(false);

  // Derived so it always reflects the latest tree (incl. nested column blocks).
  const selectedBlock = selectedId ? findBlock(blocks, selectedId) : null;

  const sensors = useSensors(
    // The whole block body is the drag handle, so require a little movement
    // before a press becomes a drag — otherwise a plain click (which selects
    // the block) would be swallowed as a zero-distance drag.
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Preview HTML is expensive (juice); recompute only when inputs change.
  const previewHtml = useMemo(
    () => generateEmailHtml(blocks, settings),
    [blocks, settings]
  );

  // The footer body shown in the edit canvas — the template's custom content, or
  // the resolved global footer. The wrapper below styles it from the template's
  // footer settings, matching what real sends produce.
  const footerInner = colorizeAnchors(
    settings.footerSource === 'custom'
      ? (settings.footerContent ?? '')
      : getFooterPreviewContent(),
    settings.footerLinkColor
  );

  // Continuously push the current content out to the host. Kept in a ref so a
  // changing callback identity doesn't re-fire the sync effect; only real content
  // changes (blocks/settings → previewHtml) do.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    onChangeRef.current?.({
      html_content: previewHtml,
      json_structure: JSON.stringify({ blocks, settings }),
    });
  }, [previewHtml, blocks, settings]);

  const addBlock = (type: string, parent: ColumnTarget | null) => {
    const newBlock: EmailBlock = {
      id: nextBlockId(),
      type,
      styles: getDefaultStyles(type),
    };
    setBlocks((prev) =>
      parent
        ? addToColumn(prev, parent.columnsId, parent.colIndex, newBlock)
        : [...prev, newBlock]
    );
    setSelectedId(newBlock.id);
  };

  const updateBlock = (id: string, updates: Partial<EmailBlock>) => {
    setBlocks((prev) => updateBlockInTree(prev, id, updates));
  };

  const deleteBlock = (id: string) => {
    const next = removeBlock(blocks, id);
    setBlocks(next);
    // Clear selection if the removed block (or a column it contained) held it.
    if (selectedId && !findBlock(next, selectedId)) {
      setSelectedId(null);
    }
  };

  const duplicateBlock = (id: string) => {
    setBlocks((prev) => duplicateBlockInTree(prev, id));
  };

  // A palette drag carries { source: 'palette', blockType } so the handlers can
  // tell "insert a brand-new block" apart from "move an existing one".
  const paletteTypeOf = (
    event: DragStartEvent | DragOverEvent | DragEndEvent
  ): string | null => {
    const data = event.active.data.current;
    return data?.source === 'palette' ? (data.blockType as string) : null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const paletteType = paletteTypeOf(event);
    if (paletteType) {
      setActivePaletteType(paletteType);
    } else {
      setActiveDragId(String(event.active.id));
    }
  };

  // Resolve where the current drag would land: the container and insertion index
  // (in display coordinates — the dragged block, if any, still sits in the list).
  // Before/after the hovered block is decided by the drag's centre vs the block's
  // midpoint. Null when there's no valid target: over nothing, hovering itself, a
  // columns block into a column cell, or a block into its own subtree. Drives
  // both the insertion line and the commit on drop.
  const resolveDrop = (
    event: DragOverEvent | DragEndEvent,
    type: string,
    draggedId?: string
  ): DropIndicator | null => {
    const { active, over } = event;
    if (!over) {
      return null;
    }
    const overId = String(over.id);
    if (draggedId && overId === draggedId) {
      return null;
    }
    const to = isContainerId(overId) ? overId : findContainerOf(blocks, overId);
    if (!to || (type === 'columns' && isColumnContainer(to))) {
      return null;
    }
    // Never drop a block into a column that lives inside itself.
    if (draggedId) {
      const dragged = findBlock(blocks, draggedId);
      const ownerId = columnsIdOf(to);
      if (dragged && ownerId && findBlock([dragged], ownerId)) {
        return null;
      }
    }
    const target = containerBlocks(blocks, to);
    if (isContainerId(overId)) {
      return { containerId: to, index: target.length };
    }
    let index = target.findIndex((b) => b.id === overId);
    if (index === -1) {
      return { containerId: to, index: target.length };
    }
    // Past the hovered block's midpoint → insert after it.
    const activeRect = active.rect.current.translated;
    if (activeRect && over.rect) {
      const activeCenter = activeRect.top + activeRect.height / 2;
      const overCenter = over.rect.top + over.rect.height / 2;
      if (activeCenter > overCenter) {
        index += 1;
      }
    }
    return { containerId: to, index };
  };

  // Skip redundant state updates so rapid drag-over events don't re-render the
  // whole canvas when the insertion point hasn't changed.
  const applyDropIndicator = (next: DropIndicator | null) => {
    setDropIndicator((prev) =>
      prev?.containerId === next?.containerId && prev?.index === next?.index
        ? prev
        : next
    );
  };

  // Both palette and existing-block drags only move the insertion line here;
  // nothing changes in the tree until drop.
  const handleDragOver = (event: DragOverEvent) => {
    const paletteType = paletteTypeOf(event);
    if (paletteType) {
      applyDropIndicator(resolveDrop(event, paletteType));
      return;
    }
    const draggedId = String(event.active.id);
    const dragged = findBlock(blocks, draggedId);
    applyDropIndicator(
      dragged ? resolveDrop(event, dragged.type, draggedId) : null
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const paletteType = paletteTypeOf(event);
    setActiveDragId(null);
    setActivePaletteType(null);
    setDropIndicator(null);

    // Palette drag → commit a brand-new block at the insertion line.
    if (paletteType) {
      const target = resolveDrop(event, paletteType);
      if (!target) {
        return;
      }
      const newBlock: EmailBlock = {
        id: nextBlockId(),
        type: paletteType,
        styles: getDefaultStyles(paletteType),
      };
      setBlocks((prev) =>
        insertIntoContainer(prev, target.containerId, newBlock, target.index)
      );
      setSelectedId(newBlock.id);
      return;
    }

    // Existing block → move it to the insertion line.
    const draggedId = String(event.active.id);
    const dragged = findBlock(blocks, draggedId);
    if (!dragged) {
      return;
    }
    const target = resolveDrop(event, dragged.type, draggedId);
    if (!target) {
      return;
    }
    const from = findContainerOf(blocks, draggedId);
    const originalIndex = from
      ? containerBlocks(blocks, from).findIndex((b) => b.id === draggedId)
      : -1;
    // The index is in display coordinates; removing the block first shifts
    // everything after it up by one when it stays in the same list.
    let index = target.index;
    if (
      from === target.containerId &&
      originalIndex !== -1 &&
      originalIndex < index
    ) {
      index -= 1;
    }
    setBlocks((prev) => moveBlock(prev, draggedId, target.containerId, index));
  };

  const activeDragBlock = activeDragId ? findBlock(blocks, activeDragId) : null;
  // The block type the cursor overlay card represents — an existing block being
  // moved, or a new palette block. Both float the same sidebar-style card.
  const overlayType = activeDragBlock?.type ?? activePaletteType;

  const updateSettings = (patch: Partial<TemplateSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const openHeightModal = () => {
    setHeightDraft(builderPrefs.canvasHeight);
    setHeightModalOpen(true);
  };

  const saveHeight = () => {
    const clamped = Math.min(
      CANVAS_HEIGHT_MAX,
      Math.max(
        CANVAS_HEIGHT_MIN,
        Math.round(heightDraft || CANVAS_HEIGHT_DEFAULT)
      )
    );
    setBuilderPrefs({ canvasHeight: clamped });
    setHeightModalOpen(false);
  };

  const handleSendTest = async () => {
    if (blocks.length === 0) {
      message.error(
        __('Add at least one block before sending a test', 'kelune-crm')
      );
      return;
    }
    setSendingTest(true);
    try {
      await api.post('/email-templates/test-send', {
        to: testEmail,
        subject: template?.name || __('Test Email', 'kelune-crm'),
        html: previewHtml,
      });
      message.success(__('Test email sent', 'kelune-crm'));
      setTestOpen(false);
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to send test email', 'kelune-crm'))
      );
    } finally {
      setSendingTest(false);
    }
  };

  const paletteBlocks: PaletteBlock[] = [
    {
      type: 'text',
      label: __('Text', 'kelune-crm'),
      icon: <FileTextOutlined />,
    },
    {
      type: 'image',
      label: __('Image', 'kelune-crm'),
      icon: <PictureOutlined />,
    },
    {
      type: 'button',
      label: __('Button', 'kelune-crm'),
      icon: <LinkOutlined />,
    },
    {
      type: 'divider',
      label: __('Divider', 'kelune-crm'),
      icon: <MinusOutlined />,
    },
    {
      type: 'spacer',
      label: __('Spacer', 'kelune-crm'),
      icon: <BorderOutlined />,
    },
    {
      type: 'columns',
      label: __('Columns', 'kelune-crm'),
      icon: <ColumnWidthOutlined />,
    },
    // HTML sits last: an escape hatch after the first-class visual blocks.
    {
      type: 'html',
      label: __('HTML', 'kelune-crm'),
      icon: <CodeOutlined />,
    },
  ];

  const blockLabel = (type: string) =>
    paletteBlocks.find((b) => b.type === type)?.label ??
    type.charAt(0).toUpperCase() + type.slice(1);

  // Sidebar contents: the selected block's properties (with a back-to-tabs
  // header), or the Blocks / Settings tabs. Rendered inline on wide screens and
  // inside the Drawer on narrow ones. Palette items are drag sources only on wide
  // screens; on narrow, tap-to-add is the path (drag across the portalled Drawer
  // isn't reliable), so `draggable` follows `!narrow`.
  const sidebarInner = selectedBlock ? (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setSelectedId(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setSelectedId(null);
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          cursor: 'pointer',
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        <LeftOutlined />
        <span>
          {sprintf(
            // translators: %s: block type name (e.g. Text, Image)
            __('%s Block', 'kelune-crm'),
            blockLabel(selectedBlock.type)
          )}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <BlockProperties
          block={selectedBlock}
          onChange={(updates) => updateBlock(selectedBlock.id, updates)}
        />
      </div>
    </>
  ) : (
    <Tabs
      defaultActiveKey="blocks"
      style={{ flex: 1, minHeight: 0 }}
      tabBarStyle={{
        paddingLeft: 16,
        paddingRight: 16,
        marginBottom: 0,
      }}
      items={[
        {
          key: 'blocks',
          label: __('Blocks', 'kelune-crm'),
          children: (
            <PaletteGrid
              blocks={paletteBlocks}
              onPick={(type) => addBlock(type, null)}
              draggable={!narrow}
            />
          ),
        },
        {
          key: 'settings',
          label: __('Settings', 'kelune-crm'),
          children: (
            <TemplateSettingsPanel
              settings={settings}
              onChange={updateSettings}
            />
          ),
        },
      ]}
    />
  );

  return (
    <div>
      <Card
        size="small"
        styles={{ body: { padding: 0, height: '100%' } }}
        style={{
          height: `${builderPrefs.canvasHeight}px`,
          overflow: 'hidden',
        }}
      >
        {/* One DnD context spans the sidebar palette and the canvas, so a
            palette block can be dragged straight onto the canvas (and existing
            blocks still reorder within it). */}
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveDragId(null);
            setActivePaletteType(null);
            setDropIndicator(null);
          }}
        >
          <div style={{ display: 'flex', height: '100%' }}>
            {/* Left Sidebar (wide screens): Blocks / Settings tabs, or the
              selected block's properties. On narrow screens this same content
              moves into the Drawer below. */}
            {!previewMode && !narrow && (
              <div
                className="kelune-crm-cc-tpl-sidebar"
                style={{
                  width: 280,
                  flexShrink: 0,
                  borderRight: '1px solid #f0f0f0',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {sidebarInner}
              </div>
            )}

            {/* Canvas */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Canvas header — mirrors the sidebar header height */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  minHeight: 46,
                  padding: '6px 16px',
                  borderBottom: '1px solid #f0f0f0',
                  flexShrink: 0,
                }}
              >
                <div>
                  {previewMode ? (
                    <Segmented
                      value={previewDevice}
                      onChange={(v) =>
                        setPreviewDevice(v as 'desktop' | 'mobile')
                      }
                      options={[
                        { value: 'desktop', icon: <DesktopOutlined /> },
                        { value: 'mobile', icon: <MobileOutlined /> },
                      ]}
                    />
                  ) : (
                    // Narrow screens: the sidebar is in a Drawer; this opens it.
                    narrow && (
                      <Button
                        icon={<AppstoreOutlined />}
                        onClick={() => setSidebarOpen(true)}
                      >
                        {__('Blocks', 'kelune-crm')}
                      </Button>
                    )
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        {
                          key: 'test',
                          icon: <SendOutlined />,
                          label: __('Send Test', 'kelune-crm'),
                          // Nothing to send from an empty canvas.
                          disabled: blocks.length === 0,
                          onClick: () => setTestOpen(true),
                        },
                        {
                          key: 'canvas-height',
                          icon: <ColumnHeightOutlined />,
                          label: __('Canvas Height', 'kelune-crm'),
                          onClick: openHeightModal,
                        },
                        {
                          key: 'footer',
                          icon: <BorderBottomOutlined />,
                          // The only way to reopen footer settings once the
                          // footer is disabled (the in-canvas footer, the other
                          // entry point, is hidden then).
                          label: __('Footer Settings', 'kelune-crm'),
                          // No editing while previewing.
                          disabled: previewMode,
                          onClick: () => setFooterModalOpen(true),
                        },
                      ],
                    }}
                  >
                    <Button icon={<MoreOutlined />} />
                  </Dropdown>
                  {previewMode ? (
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => setPreviewMode(false)}
                    >
                      {__('Edit', 'kelune-crm')}
                    </Button>
                  ) : (
                    <Button
                      icon={<EyeOutlined />}
                      onClick={() => setPreviewMode(true)}
                    >
                      {__('Preview', 'kelune-crm')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Canvas body */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  background: previewMode
                    ? '#f5f5f5'
                    : settings.backgroundColor,
                  padding: previewMode ? 0 : settings.pagePadding,
                }}
              >
                {previewMode ? (
                  <div
                    style={{
                      maxWidth: previewDevice === 'mobile' ? 375 : '100%',
                      height: '100%',
                      margin: '0 auto',
                    }}
                  >
                    <iframe
                      srcDoc={withPreviewStyle(
                        resolveFooterForPreview(previewHtml)
                      )}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        background: 'white',
                      }}
                      title={__('Template Preview', 'kelune-crm')}
                    />
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        background: settings.contentBackground,
                        maxWidth: settings.contentWidth,
                        fontFamily: settings.fontFamily,
                        margin: '0 auto',
                        padding: settings.contentPadding,
                      }}
                    >
                      <BlockList
                        blocks={blocks}
                        selectedId={selectedId}
                        dropIndicator={dropIndicator}
                        palette={paletteBlocks}
                        onSelect={setSelectedId}
                        onAdd={addBlock}
                        onDelete={deleteBlock}
                        onDuplicate={duplicateBlock}
                      />
                    </div>
                    {/* Email footer — sits below the Container inside Main
                        (constrained to the content width) exactly as real sends
                        render it. Not a block: clicking it opens the footer
                        settings modal. */}
                    {settings.footerEnabled && (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setFooterModalOpen(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setFooterModalOpen(true);
                          }
                        }}
                        onMouseEnter={() => setFooterHovered(true)}
                        onMouseLeave={() => setFooterHovered(false)}
                        title={__('Edit footer', 'kelune-crm')}
                        style={{
                          maxWidth: settings.contentWidth,
                          margin: '0 auto',
                          padding: settings.footerPadding,
                          background: settings.footerBackground,
                          cursor: 'pointer',
                          outline: footerHovered
                            ? '1px solid #1677ff'
                            : '1px dashed transparent',
                          outlineOffset: '-1px',
                        }}
                      >
                        <div
                          className="kelune-crm-cc-rich-text"
                          style={{
                            fontFamily: settings.fontFamily,
                            fontSize: settings.footerFontSize,
                            fontWeight: settings.footerFontWeight,
                            lineHeight:
                              settings.footerLineHeight ||
                              defaultLineHeight(
                                settings.footerFontSize || '14px'
                              ),
                            color: settings.footerTextColor,
                            textAlign: 'center',
                            pointerEvents: 'none',
                          }}
                          dangerouslySetInnerHTML={{
                            __html:
                              footerInner ||
                              `<span style="color:#bbb;">${__(
                                'Click to edit footer',
                                'kelune-crm'
                              )}</span>`,
                          }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Cursor overlay, portalled by dnd-kit so it isn't clipped by the
              scrolling canvas. Both an existing-block move and a new palette
              block float the same sidebar-style card (border + icon + text); the
              drop position is shown by the insertion line instead. dropAnimation
              is disabled so the card vanishes at once on release (no fly-back to
              a now-hidden source). */}
          <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
            {overlayType ? (
              <div
                style={{
                  width: 96,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '12px 8px',
                  background: '#fff',
                  border: '1px solid #1677ff',
                  borderRadius: 8,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  color: '#1677ff',
                  cursor: 'grabbing',
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>
                  {paletteBlocks.find((b) => b.type === overlayType)?.icon}
                </span>
                <span style={{ fontSize: 12 }}>{blockLabel(overlayType)}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </Card>

      {/* Narrow-screen sidebar: same Blocks / Settings / properties content the
          wide layout shows inline, in a left Drawer toggled from the canvas
          header (and auto-opened when a block is selected). */}
      <Drawer
        placement="left"
        open={narrow && sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        width={300}
        title={__('Editor', 'kelune-crm')}
        styles={{ body: { padding: 0 } }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
          }}
        >
          {sidebarInner}
        </div>
      </Drawer>

      <Modal
        destroyOnHidden
        title={__('Send Test Email', 'kelune-crm')}
        open={testOpen}
        onCancel={() => setTestOpen(false)}
        centered
        footer={
          <ModalFooter
            okText={__('Send Test', 'kelune-crm')}
            onOk={handleSendTest}
            confirmLoading={sendingTest}
            okButtonProps={{ disabled: !testEmail }}
            onCancel={() => setTestOpen(false)}
          />
        }
      >
        <Typography.Text style={{ display: 'block', margin: '0 0 8px 0' }}>
          {__(
            'Send a copy of this template to an email address. Merge tags are not filled in test sends.',
            'kelune-crm'
          )}
        </Typography.Text>
        <Input
          type="email"
          placeholder="you@example.com"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          onPressEnter={handleSendTest}
        />
      </Modal>

      <Modal
        destroyOnHidden
        centered
        width={420}
        title={__('Canvas Height', 'kelune-crm')}
        open={heightModalOpen}
        onCancel={() => setHeightModalOpen(false)}
        footer={
          <ModalFooter
            okText={__('Save', 'kelune-crm')}
            onOk={saveHeight}
            onCancel={() => setHeightModalOpen(false)}
          />
        }
      >
        <Form layout="vertical" onFinish={saveHeight}>
          <Form.Item
            label={__('Builder canvas height', 'kelune-crm')}
            help={sprintf(
              // translators: %1$d: minimum height in pixels, %2$d: maximum height in pixels
              __('Between %1$d and %2$d pixels', 'kelune-crm'),
              CANVAS_HEIGHT_MIN,
              CANVAS_HEIGHT_MAX
            )}
            style={{ marginBottom: 0 }}
          >
            <InputNumber
              autoFocus
              value={heightDraft}
              onChange={(value) =>
                setHeightDraft(value ?? CANVAS_HEIGHT_DEFAULT)
              }
              min={CANVAS_HEIGHT_MIN}
              max={CANVAS_HEIGHT_MAX}
              step={10}
              controls={false}
              addonAfter="px"
              style={{ width: '100%' }}
            />
          </Form.Item>
          <SubmitOnEnter />
        </Form>
      </Modal>

      <FooterSettingsModal
        open={footerModalOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={() => setFooterModalOpen(false)}
      />
    </div>
  );
};

export default EmailTemplateBuilder;
