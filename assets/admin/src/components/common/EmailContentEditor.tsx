import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Form,
  Select,
  Space,
  Button,
  Dropdown,
  Input,
  Modal,
  Typography,
  message,
} from 'antd';
import type { FormInstance } from 'antd';
import type { NamePath } from 'antd/es/form/interface';
import {
  AppstoreAddOutlined,
  EditOutlined,
  DownOutlined,
} from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import EmailTemplateBuilder from '../email-templates/EmailTemplateBuilder';
import TemplateGalleryModal from '../email-templates/TemplateGalleryModal';
import RichTextEditor from './RichTextEditor';
import ModalFooter from './ModalFooter';
import { getDefaultStyles } from '../email-templates/blockDefaults';
import { nextBlockId } from '../email-templates/blockTree';
import {
  generateEmailHtml,
  renderBlocksBody,
  DEFAULT_TEMPLATE_SETTINGS,
  EMAIL_DOC_MARKER_RE,
} from '@/utils/emailHtml';
import type { TemplateSettings } from '@/utils/emailHtml';
import { resolveTemplateEditor, editorModeLabel } from '@/utils/templateEditor';
import { CONTACT_MERGE_TAGS } from '@/utils/mergeTags';
import type { EmailBlock, EmailTemplate } from '@/types/models';

// Two editors only. The Visual editor composes a block tree; the Rich Text
// editor is one Text block with the default template settings, so its output
// sits in the same default body/container/footer a Visual design produces.
// (Legacy `html`/`text` records reopen as `richtext`.)
type ContentMode = 'builder' | 'richtext';

// Any stored/legacy mode → one of the two supported editors. Only `builder`
// stays Visual; every other value (incl. the removed `html`/`text`) becomes
// Rich Text so old records reopen without losing their body.
const normalizeMode = (raw: unknown): ContentMode =>
  raw === 'builder' ? 'builder' : 'richtext';

/**
 * Editor state, persisted in `json_structure`. This is the CONTENT (what the
 * author edits); the CHROME (email document, content container, footer) is applied
 * by the generator when composing the sent HTML, so no editor shows or edits the
 * outer layout.
 *
 * - builder → `blocks` (visual block tree) + `settings` (chrome config)
 * - richtext → `richHtml`, one HTML fragment, composed inside the DEFAULT chrome
 *   (no shell/footer settings UI in Rich Text)
 *
 * Crossing the mode boundary carries the content across: Rich Text → Visual wraps
 * the fragment as one editable Text block; Visual → Rich Text reads a lone Text
 * (or HTML) block's markup, or (after a confirm) flattens the whole design to HTML.
 */
interface ContentStructure {
  mode: ContentMode;
  settings: TemplateSettings;
  blocks: EmailBlock[];
  richHtml: string;
}

const MODE_OPTIONS = [
  {
    value: 'builder',
    label: (
      <Space>
        <AppstoreAddOutlined />
        {__('Visual Editor', 'kelune-crm')}
      </Space>
    ),
  },
  {
    value: 'richtext',
    label: (
      <Space>
        <EditOutlined />
        {__('Rich Text Editor', 'kelune-crm')}
      </Space>
    ),
  },
];

interface EmailContentEditorProps {
  form: FormInstance;
  /** Field holding the chosen editor mode. */
  modeName: NamePath;
  /** Field holding the composed HTML — what actually gets sent. */
  contentName: NamePath;
  /** Field holding the editor structure (blocks/richHtml + settings), for rehydration. */
  structureName: NamePath;
  /** Optional field recording which template seeded the content. */
  templateIdName?: NamePath;
  /** Structure to hydrate the editor with on open (from the saved record). */
  initialStructure?: unknown;
  /** Name shown on the builder's canvas. */
  templateName?: string;
  /** Validation message when content is missing in builder mode. */
  builderRequiredMessage?: string;
}

// Accept a stored structure as an object or a JSON string; return a plain object
// (or null). Tolerates the current shape and the legacy `{ blocks, settings }`.
const parseStructure = (raw: unknown): Record<string, unknown> | null => {
  let value: unknown = raw;
  if (typeof value === 'string' && value !== '') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
};

// A composed document owns its own chrome; a bare fragment does not. Used to tell
// a legacy richtext/text/html body (stored raw) from a full builder document.
const isFragment = (value: unknown): value is string =>
  typeof value === 'string' &&
  value !== '' &&
  !EMAIL_DOC_MARKER_RE.test(value) &&
  !/<!doctype/i.test(value);

// Whether a fragment carries anything visible (so an empty <p></p> from the editor
// doesn't count as content and fails the required-content rule).
const hasVisibleHtml = (html: string): boolean =>
  /<img\b/i.test(html) ||
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim() !== '';

// One Text block wrapping the author's markup — the builder representation of a
// Rich Text email. A Text block, not an HTML block, because the Text block's
// property editor IS this same RichTextEditor: the content round-trips cleanly
// between the two modes with no conversion, and composes with identical chrome.
const richTextBlock = (html: string): EmailBlock => ({
  id: nextBlockId(),
  type: 'text',
  styles: { ...getDefaultStyles('text'), content: html },
});

// The lossless fragment for a single-block Visual design, or null when the design
// isn't a single block that maps cleanly to a Rich Text fragment. A lone Text
// block yields its rich content; a lone HTML block its raw markup — both open in
// Rich Text with no flatten. Anything else must be flattened (with a warning).
const singleBlockFragment = (blocks: EmailBlock[]): string | null => {
  if (blocks.length !== 1) {
    return null;
  }
  const only = blocks[0];
  if (only.type === 'text') {
    return String(only.styles?.content ?? '');
  }
  if (only.type === 'html') {
    return String(only.styles?.html ?? '');
  }
  return null;
};

/**
 * Shared "compose an email" surface: editor-mode switcher, Merge Tags menu,
 * template gallery, and the two editors (visual builder / rich text). Field
 * paths are props because callers store content under different keys.
 *
 * Content vs chrome: every editor edits only the CONTENT. The email document,
 * content container and footer are applied by the generator when composing the
 * `contentName` HTML — so Rich Text shows just the text, and its output sits in
 * the default body/container/footer.
 */
const EmailContentEditor = ({
  form,
  modeName,
  contentName,
  structureName,
  templateIdName,
  initialStructure = null,
  templateName = __('Email', 'kelune-crm'),
  builderRequiredMessage = __(
    'Add at least one block in the visual builder before continuing',
    'kelune-crm'
  ),
}: EmailContentEditorProps) => {
  const [templateGalleryVisible, setTemplateGalleryVisible] = useState(false);
  // Drives the lossy-switch confirm. A real in-tree <Modal> (not Modal.confirm):
  // the static helpers render outside our ConfigProvider (custom prefixCls), so
  // they'd be unstyled and stranded behind the host Drawer.
  const [flattenConfirmOpen, setFlattenConfirmOpen] = useState(false);
  // A template chosen in the gallery that needs the author's confirmation before
  // it is applied: `switch` when the template's editor differs from the current
  // one (importing would change the editor), `override` when it matches but the
  // editor already holds content that the import would replace. Null when no
  // confirm is pending. Declining leaves the current content untouched.
  const [importConfirm, setImportConfirm] = useState<{
    template: EmailTemplate;
    kind: 'switch' | 'override';
  } | null>(null);
  // Bumped to remount the builder / rich-text editor when their value is reseeded
  // from outside their own edits: a record swap, a template import, or a mode
  // switch that carries content across (see commitSwitch). Never bumped on a
  // plain in-editor edit, so typing never loses focus.
  const [seedKey, setSeedKey] = useState(0);
  // True while the visual builder is in its preview (read-only) mode. The editor
  // switcher is disabled then — you can't change editors mid-preview. Reset to
  // false whenever the builder remounts (it reports its state on mount).
  const [builderPreview, setBuilderPreview] = useState(false);

  const contentMode = Form.useWatch(modeName, form) as ContentMode | undefined;

  // Build the editor structure from the loaded record. `initialStructure` (the
  // caller's prop) is preferred over the live form value: hosts populate the form
  // in effects that run AFTER this child mounts, so the prop is the value reliably
  // in sync with the record on show.
  // Memoised so the reseed effect below can depend on it directly: `form` is a
  // stable AntD instance and the *Name props are constant strings, so the
  // identity turns over only when `initialStructure` does — which is exactly
  // when a reseed is wanted. Anything looser would reseed mid-edit and discard
  // unsaved input.
  const buildStructure = useCallback((): ContentStructure => {
    const parsed = parseStructure(
      initialStructure ?? form.getFieldValue(structureName)
    );
    const mode = normalizeMode(
      form.getFieldValue(modeName) ?? parsed?.mode ?? 'builder'
    );
    const settings: TemplateSettings = {
      ...DEFAULT_TEMPLATE_SETTINGS,
      ...((parsed?.settings as Partial<TemplateSettings>) ?? {}),
    };
    const blocks = Array.isArray(parsed?.blocks)
      ? (parsed?.blocks as EmailBlock[])
      : [];
    // `richHtml` is the current key; `contentHtml` is the legacy key from the
    // four-mode editor. Read either so an existing record carries its body in.
    let richHtml =
      typeof parsed?.richHtml === 'string'
        ? parsed.richHtml
        : typeof parsed?.contentHtml === 'string'
          ? parsed.contentHtml
          : '';

    // Legacy recovery: a non-builder record saved before any structure slot kept
    // its raw body in the content field. Seed the fragment from it so nothing is
    // lost. A full builder document carries the marker, so isFragment skips it
    // (builder rehydrates from blocks instead).
    const content = form.getFieldValue(contentName);
    if (!richHtml && mode !== 'builder' && isFragment(content)) {
      richHtml = content;
    }

    return { mode, settings, blocks, richHtml };
  }, [initialStructure, form, structureName, modeName, contentName]);

  const [structure, setStructure] = useState<ContentStructure>(buildStructure);
  // Latest structure for effects/handlers without re-subscribing them.
  const structureRef = useRef(structure);
  structureRef.current = structure;

  // The editor to show. The form's mode wins once hosts have seeded it; until then
  // the structure's own mode (resolved from initialStructure at mount) keeps the
  // right editor on screen — so a loaded record never flashes the wrong editor or
  // fires a spurious switch. Both sources are normalised, so a legacy html/text
  // record shows the Rich Text editor.
  const editorMode: ContentMode = contentMode
    ? normalizeMode(contentMode)
    : structure.mode;

  // Compose the sent HTML from the structure. Visual runs the blocks through the
  // generator; Rich Text composes its lone Text block with the DEFAULT settings.
  // Empty content composes to '' so the required rule bites.
  const composeContent = (st: ContentStructure): string => {
    if (st.mode === 'builder') {
      return st.blocks.length ? generateEmailHtml(st.blocks, st.settings) : '';
    }
    return hasVisibleHtml(st.richHtml)
      ? generateEmailHtml(
          [richTextBlock(st.richHtml)],
          DEFAULT_TEMPLATE_SETTINGS
        )
      : '';
  };

  const serialize = (st: ContentStructure) => ({
    mode: st.mode,
    settings: st.settings,
    blocks: st.blocks,
    richHtml: st.richHtml,
  });

  // Persist a structure change: mirror the structure and the composed HTML (what
  // gets sent) into the form. Every mode composes from the structure, so this is
  // the single place the content field is written.
  const commit = (next: ContentStructure) => {
    structureRef.current = next;
    setStructure(next);
    form.setFieldValue(structureName, serialize(next));
    form.setFieldValue(contentName, composeContent(next));
  };

  // A commit made on a mode switch. The two editors are mount-once (RichTextEditor
  // and the visual builder read their value only at mount and reseed by React
  // `key`), and this commit lands in an effect AFTER the target editor has already
  // mounted with the pre-switch value — so bump `seedKey` to remount it with the
  // just-carried content. Normal edits use plain `commit` (no remount, no focus
  // loss).
  const commitSwitch = (next: ContentStructure) => {
    commit(next);
    setSeedKey((k) => k + 1);
  };

  // Minimal EmailTemplate the builder hydrates from. Computed inline (not
  // memoised) so it always reflects the latest blocks: the builder reads it only
  // in its mount-time state initializer, so a fresh object each render is harmless
  // — but it MUST carry the current blocks when the editor remounts after a mode
  // switch, or builder edits made before switching away would be lost.
  const builderTemplate = {
    name: templateName,
    json_structure: {
      blocks: structure.blocks,
      settings: structure.settings,
    },
  } as unknown as EmailTemplate;

  // The builder syncs its generated HTML + block tree here on every edit. Reuse
  // its already-composed html_content (no second juice pass).
  const handleBuilderChange = (data: {
    html_content: string;
    json_structure: string;
  }) => {
    const parsed = parseStructure(data.json_structure);
    const blocks = Array.isArray(parsed?.blocks)
      ? (parsed?.blocks as EmailBlock[])
      : [];
    const settings: TemplateSettings = {
      ...DEFAULT_TEMPLATE_SETTINGS,
      ...((parsed?.settings as Partial<TemplateSettings>) ?? {}),
    };
    const next: ContentStructure = {
      ...structureRef.current,
      mode: 'builder',
      blocks,
      settings,
    };
    structureRef.current = next;
    setStructure(next);
    form.setFieldValue(structureName, serialize(next));
    form.setFieldValue(contentName, blocks.length ? data.html_content : '');
  };

  // Reseed when the caller swaps in a different record. Skips the first run: the
  // initial state already resolved the right structure from the form/prop.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const rebuilt = buildStructure();
    structureRef.current = rebuilt;
    setStructure(rebuilt);
    setSeedKey((k) => k + 1);
  }, [buildStructure]);

  // Handle an author-driven editor switch from the mode Select. The switch is
  // applied HERE (not reactively off the form value) so the editor only changes
  // once the transition is committed — in particular, a lossy Visual → Rich Text
  // switch stays on the Visual editor (and the Select stays on Visual) behind the
  // confirm modal, and flips only when the author clicks Continue.
  //
  // Rich Text → Visual wraps the fragment as one editable Text block. Visual →
  // Rich Text is lossless when the design is a single Text (or HTML) block;
  // otherwise it warns, and only flattens on confirm. The mode is never written to
  // the form until a transition commits, so a cancelled switch needs no revert.
  const handleModeChange = (value: string) => {
    const target = normalizeMode(value);
    const cur = structureRef.current;
    if (target === cur.mode) {
      return;
    }

    if (target === 'builder') {
      // Empty Rich Text opens an empty builder; otherwise wrap the fragment as one
      // editable Text block (round-trips cleanly back to Rich Text).
      form.setFieldValue(modeName, 'builder');
      commitSwitch({
        ...cur,
        mode: 'builder',
        blocks: hasVisibleHtml(cur.richHtml)
          ? [richTextBlock(cur.richHtml)]
          : [],
      });
      return;
    }

    const fragment = singleBlockFragment(cur.blocks);
    if (fragment !== null) {
      form.setFieldValue(modeName, 'richtext');
      commitSwitch({ ...cur, mode: 'richtext', richHtml: fragment });
      return;
    }

    // Lossy: flattening blocks to HTML can't be rebuilt into a layout. Open the
    // confirm and change nothing until the author accepts.
    setFlattenConfirmOpen(true);
  };

  // Confirmed flatten: replace the whole Visual design with its rendered HTML and
  // switch to Rich Text. Reads the latest structure so any last edit is included.
  const confirmFlattenToRichText = () => {
    const latest = structureRef.current;
    form.setFieldValue(modeName, 'richtext');
    commitSwitch({
      ...latest,
      mode: 'richtext',
      richHtml: renderBlocksBody(latest.blocks),
    });
    setFlattenConfirmOpen(false);
  };

  // Whether the current editor holds visible content the import would replace.
  const editorHasContent = (): boolean => {
    const cur = structureRef.current;
    return editorMode === 'builder'
      ? cur.blocks.length > 0
      : hasVisibleHtml(cur.richHtml);
  };

  // Apply a chosen template: seed the editor with its content in the editor the
  // template targets (Visual for a builder template, Rich Text otherwise),
  // switching the editor if needed. Content is carried in each editor's own
  // shape so it round-trips; the composed HTML is the template's rendered body.
  const applyTemplate = (template: EmailTemplate) => {
    const parsed = parseStructure(template.json_structure);
    const target = resolveTemplateEditor(template);
    const settings: TemplateSettings = {
      ...DEFAULT_TEMPLATE_SETTINGS,
      ...((parsed?.settings as Partial<TemplateSettings>) ?? {}),
    };

    let next: ContentStructure;
    if (target === 'builder') {
      next = {
        mode: 'builder',
        settings,
        blocks: Array.isArray(parsed?.blocks)
          ? (parsed?.blocks as EmailBlock[])
          : [],
        // Re-derived from the blocks if the author later switches to Rich Text.
        richHtml: '',
      };
    } else {
      const richHtml =
        typeof parsed?.richHtml === 'string'
          ? parsed.richHtml
          : typeof parsed?.contentHtml === 'string'
            ? parsed.contentHtml
            : '';
      next = {
        mode: 'richtext',
        settings: DEFAULT_TEMPLATE_SETTINGS,
        blocks: [],
        richHtml,
      };
    }

    structureRef.current = next;
    setStructure(next);
    form.setFieldValue(modeName, target);
    form.setFieldValue(structureName, serialize(next));
    // A builder template ships its already-rendered HTML; a Rich Text template
    // composes from its fragment through the default chrome.
    form.setFieldValue(
      contentName,
      target === 'builder'
        ? (template.html_content ?? composeContent(next))
        : composeContent(next)
    );
    if (templateIdName) {
      // Only custom (numeric-id) templates bind a template id; built-in
      // templates are code-only and have string ids, so record none.
      const numId = Number(template.id);
      form.setFieldValue(templateIdName, Number.isFinite(numId) ? numId : null);
    }
    setSeedKey((k) => k + 1);
    setTemplateGalleryVisible(false);
    message.success(
      sprintf(
        /* translators: %s: template name. */
        __('Template "%s" applied', 'kelune-crm'),
        template.name
      )
    );
  };

  // Importing a template does not bind to it — it copies the content in. If the
  // template targets a different editor than the one on screen, or the current
  // editor already holds content, confirm first; otherwise apply immediately.
  const handleTemplateSelect = (template: EmailTemplate) => {
    const target = resolveTemplateEditor(template);
    if (target !== editorMode) {
      setImportConfirm({ template, kind: 'switch' });
      return;
    }
    if (editorHasContent()) {
      setImportConfirm({ template, kind: 'override' });
      return;
    }
    applyTemplate(template);
  };

  return (
    <div>
      {/* Editor toolbar: editor Select on the left, gallery button on the right. */}
      <Card
        size="small"
        style={{ marginBottom: 16, background: '#fafafa' }}
        styles={{ body: { padding: '8px 12px' } }}
      >
        <Row align="middle" justify="space-between" gutter={[8, 0]}>
          <Col style={{ paddingTop: 4, paddingBottom: 4 }}>
            {/* The Select is NOT a Form.Item field: it drives the guarded switch
                (handleModeChange), which writes the mode into the form only once a
                transition commits — so a lossy switch stays on the current editor
                behind the confirm modal. It shows the committed editor mode. */}
            <Select
              style={{ width: 180 }}
              value={editorMode}
              onChange={handleModeChange}
              options={MODE_OPTIONS}
              // Can't switch editors while previewing the visual builder.
              disabled={editorMode === 'builder' && builderPreview}
            />
            {/* Hidden field carrying the committed mode for the host's save.
                Seeded from the resolved structure mode; handleModeChange /
                handleTemplateSelect update it on commit. */}
            <Form.Item name={modeName} initialValue={structure.mode} noStyle>
              <Input type="hidden" />
            </Form.Item>
          </Col>
          <Col style={{ paddingTop: 4, paddingBottom: 4 }}>
            <Space>
              {/* Merge tags are copyable in every editor; the menu stays open
                  so several can be copied. */}
              <Dropdown
                trigger={['click']}
                menu={{
                  items: CONTACT_MERGE_TAGS.map((mt) => ({
                    key: mt,
                    label: (
                      <Typography.Text
                        copyable={{ text: mt }}
                        style={{ fontFamily: 'monospace' }}
                      >
                        {mt}
                      </Typography.Text>
                    ),
                  })),
                }}
              >
                <Button>
                  <Space size={4}>
                    {__('Merge Tags', 'kelune-crm')}
                    <DownOutlined style={{ fontSize: 10 }} />
                  </Space>
                </Button>
              </Dropdown>
              <Button onClick={() => setTemplateGalleryVisible(true)}>
                {__('Choose Template', 'kelune-crm')}
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {editorMode === 'builder' && (
        // The builder renders inline and syncs its generated HTML + block tree
        // into the form on every edit via handleBuilderChange.
        <EmailTemplateBuilder
          key={`builder-${seedKey}`}
          template={builderTemplate}
          onChange={handleBuilderChange}
          onPreviewChange={setBuilderPreview}
        />
      )}

      {editorMode === 'richtext' && (
        <Form.Item
          label={__('Email Content', 'kelune-crm')}
          required
          tooltip={__(
            'Your text is placed in the default email layout with its footer. Insert dynamic values with the Placeholders button.',
            'kelune-crm'
          )}
          style={{ marginBottom: 0 }}
        >
          <RichTextEditor
            key={`richtext-${seedKey}`}
            height={360}
            placeholders={CONTACT_MERGE_TAGS}
            value={structure.richHtml}
            onChange={(value) =>
              commit({
                ...structureRef.current,
                mode: 'richtext',
                richHtml: value,
              })
            }
          />
        </Form.Item>
      )}

      {/* Content is required in every mode. No editor binds the content field
          directly (each edits the structure and the composed HTML is written by
          commit), so a single hidden field carries that composed value and the
          required-content validation rule. */}
      <Form.Item
        name={contentName}
        rules={[
          {
            required: true,
            message:
              editorMode === 'builder'
                ? builderRequiredMessage
                : __('Please enter email content', 'kelune-crm'),
          },
        ]}
        noStyle
      >
        <Input type="hidden" />
      </Form.Item>

      <TemplateGalleryModal
        visible={templateGalleryVisible}
        onCancel={() => setTemplateGalleryVisible(false)}
        onSelect={handleTemplateSelect}
      />

      {/* A real <Modal> rather than Modal.confirm(): the static helpers render
          outside the React tree, so they never see our ConfigProvider — with a
          custom prefixCls that means an unstyled dialog stranded behind the host
          Drawer (campaign form, automation step). */}
      <Modal
        title={__('Switch to Rich Text?', 'kelune-crm')}
        open={flattenConfirmOpen}
        onCancel={() => setFlattenConfirmOpen(false)}
        footer={null}
        centered
        destroyOnHidden
      >
        <p style={{ margin: 0 }}>
          {__(
            "Switching to Rich Text flattens your blocks into HTML — you can't rebuild the block layout afterwards.",
            'kelune-crm'
          )}
        </p>
        <div style={{ marginTop: 24 }}>
          <ModalFooter
            okText={__('Continue', 'kelune-crm')}
            onOk={confirmFlattenToRichText}
            onCancel={() => setFlattenConfirmOpen(false)}
          />
        </div>
      </Modal>

      {/* Import confirm: applying a template that would switch the editor, or
          overwrite existing content. Declining leaves the editor untouched and
          the template is not applied. A real <Modal> for the same reason as the
          flatten confirm above. */}
      <Modal
        title={
          importConfirm?.kind === 'switch'
            ? __('Switch editor?', 'kelune-crm')
            : __('Replace current content?', 'kelune-crm')
        }
        open={importConfirm !== null}
        onCancel={() => setImportConfirm(null)}
        footer={null}
        centered
        destroyOnHidden
      >
        <p style={{ margin: 0 }}>
          {importConfirm?.kind === 'switch'
            ? sprintf(
                /* translators: 1: target editor name, 2: current editor name. */
                __(
                  'This template opens in the %1$s editor. Applying it switches you from the %2$s editor and replaces the current content.',
                  'kelune-crm'
                ),
                editorModeLabel(resolveTemplateEditor(importConfirm.template)),
                editorModeLabel(editorMode)
              )
            : __(
                'Applying this template replaces the content currently in the editor.',
                'kelune-crm'
              )}
        </p>
        <div style={{ marginTop: 24 }}>
          <ModalFooter
            okText={__('Apply Template', 'kelune-crm')}
            onOk={() => {
              if (importConfirm) {
                applyTemplate(importConfirm.template);
              }
              setImportConfirm(null);
            }}
            onCancel={() => setImportConfirm(null)}
          />
        </div>
      </Modal>
    </div>
  );
};

export default EmailContentEditor;
