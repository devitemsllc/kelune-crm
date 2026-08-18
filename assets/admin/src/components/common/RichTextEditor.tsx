import React, { useEffect, useRef, useState } from 'react';
import { Alert, Card, Flex, Spin } from 'antd';
import { __ } from '@wordpress/i18n';

// Minimal shape of the WordPress-bundled TinyMCE 4.x editor instance — only the
// methods this component calls. Defined locally because the `tinymce` npm types
// track v6/7/8, whose API (e.g. `setMode`) differs from WP's v4 runtime.
interface WpEditor {
  remove(): void;
  setMode(mode: 'design' | 'readonly'): void;
  getBody(): HTMLElement | null;
  getContainer(): HTMLElement | null;
  getContent(): string;
  focus(): void;
  on(name: string, handler: () => void): void;
  // v4 toolbar-button registration + cursor insertion — used for the
  // "Placeholders" menu button (see `placeholders` prop).
  addButton(name: string, settings: Record<string, unknown>): void;
  insertContent(content: string): void;
}

interface RichTextEditorProps {
  // value/onChange are injected by AntD Form.Item, so both are optional.
  value?: string;
  onChange?: (value: string) => void;
  id?: string;
  focus?: boolean;
  disabled?: boolean;
  height?: number;
  // Merge-tag placeholders (e.g. `{{first_name}}`). When non-empty, a native
  // TinyMCE "Placeholders" toolbar menu button is shown that inserts the chosen
  // tag at the cursor. Pass a set from utils/mergeTags scoped to the send path.
  placeholders?: readonly string[];
}

const version = window.kelunecrm?.version ?? '';
const wpVersion = window.kelunecrm?.wp_version ?? '';
const tinymceBase = window.kelunecrm?.tinymce_base ?? '';

const contentCss = `${tinymceBase}/skins/wordpress/wp-content.css?ver=${wpVersion}`;

// In-editor (iframe) content styling — copied verbatim from the support-genix
// note editor so the typed content renders identically.
const CONTENT_STYLE = `
  body {
    font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,"Apple Color Emoji","Segoe UI Emoji",Segoe UI Symbol,"Noto Color Emoji";
    font-size: 14px;
    line-height: 22px;
    font-weight: 400;
    padding: 16px;
    margin: 0;
    -webkit-font-smoothing: subpixel-antialiased !important;
  }

  div, p, h1, h2, h3, h4, h5, h6 {
    display: block;
    font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,"Apple Color Emoji","Segoe UI Emoji",Segoe UI Symbol,"Noto Color Emoji";
    font-size: 14px;
    line-height: 22px;
    font-weight: 400;
    color: rgba(0, 0, 0, 0.88);
    padding: 0;
    margin: 0 0 1em 0;
  }

  *:last-child {
    margin-bottom: 0;
  }

  ul {
    list-style-image: none;
    list-style-position: outside;
    list-style-type: disc;
    margin: 0 0 1em 28px;
    padding: 0;
  }

  ol {
    list-style-image: none;
    list-style-position: outside;
    list-style-type: decimal;
    margin: 0 0 1em 28px;
    padding: 0;
  }

  ul li, ol li {
    padding: 0;
    margin: 0;
  }

  a {
    color: #1677ff;
  }

  a:hover, a:focus {
    color: #69b1ff;
  }

  b, strong {
    font-weight: 600;
  }

  pre {
    display: block;
    background-color: #2e3440;
    border: 1px solid #4c566a;
    border-radius: 5px;
    padding: 10px;
    color: #d8dee9;
    font-family: 'Courier New', Courier, monospace;
    font-size: 14px;
    line-height: 1.5;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  code {
    font-family: 'Courier New', Courier, monospace;
  }

  blockquote {
    display: block;
    background: transparent;
    border-width: 0 0 0 2px;
    border-style: solid;
    border-color: rgba(0, 0, 0, 0.45);
    padding-left: 1em;
    margin: 0 0 1em 0;
  }

  .alignleft { text-align: left; }
  .alignright { text-align: right; }
  .aligncenter { text-align: center; }
  .alignjustify { text-align: justify; }

  body.mce-disabled {
    background-color: rgba(0, 0, 0, 0.04);
    cursor: not-allowed;
  }
  body.mce-disabled *,
  body.mce-disabled *:hover,
  body.mce-disabled *:focus {
    color: rgba(0, 0, 0, 0.25) !important;
  }
`;

// Prop-independent init options, under WP's TinyMCE 4.x names.
const BASE_INIT: Record<string, unknown> = {
  plugins: [
    'colorpicker',
    'link',
    'lists',
    'paste',
    'tabfocus',
    'textcolor',
    'wordpress',
  ].join(' '),
  content_style: CONTENT_STYLE,
  toolbar_mode: 'wrap',
  theme: 'modern',
  skin: 'lightgray',
  language: 'en',
  formats: {
    alignleft: [
      {
        selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li',
        styles: { textAlign: 'left' },
      },
      { selector: 'img,table,dl.wp-caption', classes: 'alignleft' },
    ],
    aligncenter: [
      {
        selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li',
        styles: { textAlign: 'center' },
      },
      { selector: 'img,table,dl.wp-caption', classes: 'aligncenter' },
    ],
    alignright: [
      {
        selector: 'p,h1,h2,h3,h4,h5,h6,td,th,div,ul,ol,li',
        styles: { textAlign: 'right' },
      },
      { selector: 'img,table,dl.wp-caption', classes: 'alignright' },
    ],
    strikethrough: { inline: 'del' },
  },
  relative_urls: false,
  remove_script_host: false,
  convert_urls: false,
  browser_spellcheck: true,
  fix_list_elements: true,
  entities: '38,amp,60,lt,62,gt',
  entity_encoding: 'raw',
  keep_styles: false,
  cache_suffix: `cm-mce-${version}`,
  resize: 'vertical',
  menubar: false,
  branding: false,
  promotion: false,
  preview_styles:
    'font-family font-size font-weight font-style text-decoration text-transform',
  end_container_on_empty_block: true,
  link_context_toolbar: true,
  content_css: contentCss,
  wpautop: false,
  indent: true,
  elementpath: false,
};

// `compositionend` is what carries IME input, which `keyup` alone can miss.
const CHANGE_EVENTS = 'change keyup compositionend undo redo SetContent';

// v4 silently drops an init target whose DOM id is already registered, and
// React's useId repeats across unrelated trees — hence a counter.
let instanceCount = 0;

// Rich-text email editor. A faithful port of the support-genix ticket "Note"
// editor: same tool, same plugins, same toolbar order, same size/padding/
// spacing. Reuses WordPress core's bundled TinyMCE (v4.x, GPL, no API key, no
// cloud), enqueued by PHP through the `wp-tinymce` handle — no TinyMCE code
// ships in the bundle. Shaped as a value/onChange component for
// AntD Form.Item; uncontrolled internally, so callers reseed by changing this
// component's React `key`.
const RichTextEditor = ({
  value = '',
  onChange,
  id = '',
  focus = false,
  disabled = false,
  height = 180,
  placeholders = [],
}: RichTextEditorProps) => {
  const editorRef = useRef<WpEditor | null>(null);
  const initValueRef = useRef(value);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Keeps the events TinyMCE fires while building itself out of `onChange`.
  const readyRef = useRef(false);
  const [editorReady, setEditorReady] = useState(false);
  const [editorFailed, setEditorFailed] = useState(false);
  const [instanceId] = useState(() => ++instanceCount);
  const editorId = `kelune-crm-tinymce-editor-${id ? `${id}-` : ''}${instanceId}`;

  // Read once at init, so go through a ref rather than close over stale props.
  const propsRef = useRef({ onChange, focus, disabled, height, placeholders });
  propsRef.current = { onChange, focus, disabled, height, placeholders };

  useEffect(() => {
    const tinymce = window.tinymce;
    const target = textareaRef.current;

    if (!tinymce || !target) {
      setEditorFailed(true);
      return;
    }

    let cancelled = false;

    tinymce.init({
      ...BASE_INIT,
      target,
      height: propsRef.current.height,
      toolbar1: [
        'bold',
        'italic',
        'underline',
        'bullist',
        'numlist',
        'blockquote',
        'alignleft',
        'aligncenter',
        'alignright',
        'alignjustify',
        'link',
        'forecolor',
        'removeformat',
        'placeholders',
      ]
        .filter((tool) =>
          tool === 'placeholders'
            ? propsRef.current.placeholders.length > 0
            : true
        )
        .join(' '),
      // Held from `setup`, the earliest v4 hands the instance over, so an
      // unmount mid-init can still tear it down.
      setup: (editor: WpEditor) => {
        editorRef.current = editor;

        editor.on('init', () => {
          if (cancelled) {
            editor.remove();
            return;
          }
          readyRef.current = true;
          setEditorReady(true);

          if (propsRef.current.disabled) {
            editor.setMode('readonly');
          }
          if (propsRef.current.focus && !propsRef.current.disabled) {
            editor.focus();
          }
          const editorBody = editor.getBody();
          const editorContainer = editor.getContainer();
          if (editorBody) {
            editorBody.classList.toggle(
              'mce-disabled',
              propsRef.current.disabled
            );
          }
          if (editorContainer) {
            editorContainer.classList.toggle(
              'mce-disabled',
              propsRef.current.disabled
            );
          }
        });
        editor.on(CHANGE_EVENTS, () => {
          if (readyRef.current) {
            propsRef.current.onChange?.(editor.getContent());
          }
        });
        // Toggle the focus accent on the wrapper (iframe focus can't be
        // reached via CSS :focus-within — see base.css .kelune-crm-cc-editor-container).
        editor.on('focus', () => {
          wrapperRef.current?.classList.add('is-focused');
        });
        editor.on('blur', () => {
          wrapperRef.current?.classList.remove('is-focused');
        });
        // a11y fixups for the link/other TinyMCE dialogs.
        editor.on('OpenWindow', () => {
          document.querySelectorAll('.mce-close').forEach((el) => {
            el.removeAttribute('aria-hidden');
            el.querySelector('.mce-ico')?.setAttribute('aria-hidden', 'true');
          });
          document.querySelectorAll('.mce-textbox').forEach((el) => {
            el.setAttribute('autocomplete', 'off');
            el.setAttribute('readonly', 'true');
            setTimeout(() => el.removeAttribute('readonly'), 100);
          });
        });
        if (propsRef.current.placeholders.length > 0) {
          editor.addButton('placeholders', {
            type: 'menubutton',
            text: __('Placeholders', 'kelune-crm'),
            icon: false,
            disabled: propsRef.current.disabled,
            menu: propsRef.current.placeholders.map((placeholder) => ({
              text: placeholder,
              onclick: () => editor.insertContent(placeholder),
            })),
          });
        }
      },
    });

    return () => {
      cancelled = true;
      readyRef.current = false;
      if (editorRef.current) {
        editorRef.current.remove();
      }
      editorRef.current = null;
    };
  }, [editorId]);

  useEffect(() => {
    if (readyRef.current && editorRef.current) {
      editorRef.current.setMode(disabled ? 'readonly' : 'design');
      const editorBody = editorRef.current.getBody();
      const editorContainer = editorRef.current.getContainer();
      if (editorBody) {
        editorBody.classList.toggle('mce-disabled', disabled);
      }
      if (editorContainer) {
        editorContainer.classList.toggle('mce-disabled', disabled);
      }
    }
  }, [disabled]);

  // Without WordPress's bundled TinyMCE we cannot render the rich-text editor.
  // Surface a clear message instead of a blank/broken area.
  if (!tinymceBase || editorFailed) {
    return (
      <Alert
        type="warning"
        message={__(
          'Rich text editor unavailable — WordPress core TinyMCE could not be located. Use the HTML or Text editor instead.',
          'kelune-crm'
        )}
        style={{ border: 'none' }}
      />
    );
  }

  // `kelune-crm-cc-editor-container` carries the ported TinyMCE chrome styling in base.css
  // (border, radius, transparent toolbar with #d9d9d9 dividers) — identical to
  // the support-genix note editor. `wp-editor-container` kept for parity.
  const finalEditor = (
    <div
      ref={wrapperRef}
      className="wp-editor-container kelune-crm-cc-editor-container"
    >
      <textarea
        ref={textareaRef}
        id={editorId}
        defaultValue={initValueRef.current || ''}
      />
    </div>
  );

  // Keep the editor mounted once (never swap the tree on ready → no unmount/
  // re-init churn) and hide it with `visibility` — which preserves layout size,
  // so TinyMCE's iframe measures correctly while a Card spinner overlays it. A
  // `display:none` wrapper (or the old undefined `.sg-hidden`) would leave the
  // raw <textarea> either zero-sized or visible; visibility avoids both.
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ visibility: editorReady ? 'visible' : 'hidden' }}>
        {finalEditor}
      </div>
      {!editorReady && (
        <Card
          size="small"
          styles={{ body: { padding: 0 } }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <Flex justify="center" align="center" style={{ height: '100%' }}>
            <Spin spinning style={{ maxHeight: 'unset' }} />
          </Flex>
        </Card>
      )}
    </div>
  );
};

export default RichTextEditor;
