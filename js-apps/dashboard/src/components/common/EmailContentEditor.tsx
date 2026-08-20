import React, { useEffect, useRef, useState } from 'react';
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

// The Visual editor composes a block tree; the Rich Text editor is one Text
// block with the default template settings, so both compose into the same
// body/container/footer chrome.
type ContentMode = 'builder' | 'richtext';

// Any stored mode → one of the two editors. Anything but `builder` opens as
// Rich Text, so an unrecognised record still shows its body.
const normalizeMode = (raw: unknown): ContentMode =>
  raw === 'builder' ? 'builder' : 'richtext';

/**
 * Editor state, persisted in `json_structure`. Holds only the CONTENT the author
 * edits — the chrome (document, container, footer) is applied by the generator
 * when composing the sent HTML, so no editor shows or edits the outer layout.
 *
 * - builder → `blocks` (block tree) + `settings` (chrome config)
 * - richtext → `richHtml`, one fragment composed inside the DEFAULT chrome
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

// Accept a stored structure as an object or a JSON string; null when neither.
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

// A composed document owns its own chrome; a bare fragment does not.
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

// One Text block wrapping the author's markup. A Text block, not an HTML block,
// because its property editor IS this RichTextEditor — content round-trips
// between the two modes with no conversion.
const richTextBlock = (html: string): EmailBlock => ({
  id: nextBlockId(),
  type: 'text',
  styles: { ...getDefaultStyles('text'), content: html },
});

// The lossless fragment for a lone Text/HTML block, or null when the design
// can't map to a Rich Text fragment without flattening.
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
  // Template awaiting confirmation: `switch` when importing would change the
  // editor, `override` when it would replace existing content.
  const [importConfirm, setImportConfirm] = useState<{
    template: EmailTemplate;
    kind: 'switch' | 'override';
  } | null>(null);
  // Bumped to remount an editor when its value is reseeded from outside its own
  // edits. Never bumped on a plain in-editor edit, so typing keeps focus.
  const [seedKey, setSeedKey] = useState(0);
  // True while the visual builder is previewing; the editor switcher is disabled
  // then. Reset on builder remount (it reports its state on mount).
  const [builderPreview, setBuilderPreview] = useState(false);

  const contentMode = Form.useWatch(modeName, form) as ContentMode | undefined;

  // Build the editor structure from the loaded record. `initialStructure` beats
  // the live form value: hosts seed the form in effects that run after this
  // child mounts.
  const buildStructure = (): ContentStructure => {
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
    // Read either structure key so an existing record carries its body in.
    let richHtml =
      typeof parsed?.richHtml === 'string'
        ? parsed.richHtml
        : typeof parsed?.contentHtml === 'string'
          ? parsed.contentHtml
          : '';

    // A record with no structure keeps its raw body in the content field — seed
    // the fragment from it. Builder documents carry the marker, so isFragment
    // skips them (they rehydrate from blocks).
    const content = form.getFieldValue(contentName);
    if (!richHtml && mode !== 'builder' && isFragment(content)) {
      richHtml = content;
    }

    return { mode, settings, blocks, richHtml };
  };

  const [structure, setStructure] = useState<ContentStructure>(buildStructure);
  // Latest structure for effects/handlers without re-subscribing them.
  const structureRef = useRef(structure);
  structureRef.current = structure;

  // The editor to show. The form's mode wins once hosts have seeded it; until
  // then the structure's own mode keeps the right editor on screen, so a loaded
  // record never flashes the wrong editor or fires a spurious switch.
  const editorMode: ContentMode = contentMode
    ? normalizeMode(contentMode)
    : structure.mode;

  // Compose the sent HTML from the structure. Empty content composes to '' so
  // the required rule bites.
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

  // Mirror the structure and the composed HTML into the form — the single place
  // the content field is written.
  const commit = (next: ContentStructure) => {
    structureRef.current = next;
    setStructure(next);
    form.setFieldValue(structureName, serialize(next));
    form.setFieldValue(contentName, composeContent(next));
  };

  // Commit for a mode switch. Both editors read their value only at mount, and
  // the target has already mounted with the pre-switch value — bump `seedKey` to
  // remount it with the carried content.
  const commitSwitch = (next: ContentStructure) => {
    commit(next);
    setSeedKey((k) => k + 1);
  };

  // Minimal EmailTemplate the builder hydrates from. Computed inline, not
  // memoised: it MUST carry the current blocks when the editor remounts after a
  // mode switch, or edits made before switching away are lost.
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

  // Reseed when the caller swaps in a different record. Skips the first run —
  // the initial state already resolved the structure.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStructure]);

  // Editor switch from the mode Select, applied here rather than reactively off
  // the form value: the mode is written only once a transition commits, so a
  // lossy Visual → Rich Text switch stays put behind the confirm and a cancelled
  // switch needs no revert.
  const handleModeChange = (value: string) => {
    const target = normalizeMode(value);
    const cur = structureRef.current;
    if (target === cur.mode) {
      return;
    }

    if (target === 'builder') {
      // Empty Rich Text opens an empty builder; otherwise wrap the fragment as
      // one editable Text block.
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
        /* translators: %s: template name */
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
        footer={
          <ModalFooter
            okText={__('Continue', 'kelune-crm')}
            onOk={confirmFlattenToRichText}
            onCancel={() => setFlattenConfirmOpen(false)}
          />
        }
        centered
        destroyOnHidden
      >
        <p style={{ margin: 0 }}>
          {__(
            "Switching to Rich Text flattens your blocks into HTML — you can't rebuild the block layout afterwards.",
            'kelune-crm'
          )}
        </p>
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
        footer={
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
        }
        centered
        destroyOnHidden
      >
        <p style={{ margin: 0 }}>
          {importConfirm?.kind === 'switch'
            ? sprintf(
                /* translators: %1$s: target editor name, %2$s: current editor name */
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
      </Modal>
    </div>
  );
};

export default EmailContentEditor;
