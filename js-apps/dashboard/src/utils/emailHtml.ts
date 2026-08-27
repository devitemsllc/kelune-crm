/**
 * Email HTML generator — the single source of truth for turning the builder's
 * block model into email-safe, table-based HTML with inline CSS.
 *
 * The canvas (React block components) is for editing only; THIS is what gets
 * saved and sent. Keep all export logic here so the two never drift.
 */
import juice from 'juice';
import { __ } from '@wordpress/i18n';
import type { EmailBlock, EmailBlockStyles } from '@/types/models';

// Template-level design settings, stored alongside blocks in json_structure.
export interface TemplateSettings {
  contentWidth: number;
  backgroundColor: string;
  contentBackground: string;
  fontFamily: string;
  pagePadding: string;
  contentPadding: string;
  // Footer, rendered inside Main below the content Container. `global` bakes a
  // marker the send pipeline swaps for the site-wide footer (so its
  // {{unsubscribe_url}} resolves per recipient); `custom` bakes footerContent.
  footerEnabled: boolean;
  footerSource: 'global' | 'custom';
  footerContent: string;
  footerFontSize: string;
  // Empty → auto-tracks footerFontSize (defaultLineHeight, +10px).
  footerLineHeight: string;
  footerFontWeight: string;
  footerTextColor: string;
  footerLinkColor: string;
  footerBackground: string;
  footerPadding: string;
}

// Placeholder for the global footer inside a builder document. Encodes the
// template's link colour so the marker swap (send + preview) can inline it onto
// the footer's <a> tags. Both renderers emit it identically; EmailService swaps
// it for the real footer at send, the dashboard for the preview footer on
// screen. Format MUST match EmailService (PHP): `<!--kelune-crm:global-footer:COLOR-->`.
export const globalFooterMarker = (linkColor: string): string =>
  `<!--kelune-crm:global-footer:${linkColor}-->`;

// Matches a global-footer marker and captures its link colour.
export const GLOBAL_FOOTER_MARKER_RE = /<!--kelune-crm:global-footer:(.*?)-->/;

// Sentinel emitted at the top of every builder-generated document. It marks the
// body as a self-contained email that OWNS its footer (baked custom, resolved
// global via the marker above, or intentionally none) — so the footer logic must
// NOT append the global footer to it. A comment is used deliberately: server-side
// `wp_kses_post` strips the <!DOCTYPE>/<html>/<head>/<body> scaffold (turning the
// document into a fragment) but preserves comments, so the doctype can't be
// trusted as the "builder document" signal — this can. MUST match EmailService
// (PHP): `<!--kelune-crm:email-doc-->`.
export const EMAIL_DOC_MARKER = '<!--kelune-crm:email-doc-->';
export const EMAIL_DOC_MARKER_RE = /<!--kelune-crm:email-doc-->/;

/**
 * Drop stripped-tag text left above a builder document's marker.
 *
 * `wp_kses_post` removes a disallowed tag but keeps its text, so a stored
 * document can carry a stray CSS line above the email. Nothing legitimate
 * precedes the marker in a sanitized document, so anything but whitespace there
 * is that residue; a document still holding its scaffold (a `<` before the
 * marker) is left alone. Mirrors the PHP twin.
 */
export const stripStyleArtifact = (html: string): string => {
  const marker = html.indexOf(EMAIL_DOC_MARKER);
  if (marker === -1) {
    return html;
  }

  const head = html.slice(0, marker);
  if (head.trim() === '' || head.includes('<')) {
    return html;
  }

  return html.slice(marker);
};

// Inline a link colour onto every <a> in a footer body — email clients ignore a
// stylesheet block, so the colour has to live on each anchor. Merges into an
// existing style attribute or adds one. Kept byte-identical to the PHP twin
// (EmailHtmlRenderer::colorizeAnchors).
export const colorizeAnchors = (html: string, color: string): string =>
  html.replace(/<a\b([^>]*)>/gi, (_full, attrs: string) =>
    /\bstyle\s*=\s*["']/i.test(attrs)
      ? `<a${attrs.replace(/\bstyle\s*=\s*(["'])/i, `style=$1color: ${escAttr(color)}; `)}>`
      : `<a${attrs} style="color: ${escAttr(color)};">`
  );

export const DEFAULT_TEMPLATE_SETTINGS: TemplateSettings = {
  contentWidth: 700,
  backgroundColor: '#f8f8f8',
  contentBackground: '#ffffff',
  fontFamily: 'Arial, sans-serif',
  pagePadding: '30px 15px 10px 15px',
  contentPadding: '20px',
  footerEnabled: true,
  footerSource: 'global',
  footerContent: '',
  footerFontSize: '14px',
  footerLineHeight: '',
  footerFontWeight: '400',
  footerTextColor: '#333333',
  footerLinkColor: '#1677ff',
  footerBackground: 'transparent',
  footerPadding: '20px 20px 20px 20px',
};

// Escape a value for use inside an HTML attribute (src/href/alt/…). Prevents a
// stray quote from breaking the tag and blocks trivial attribute injection.
const escAttr = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// `val || fallback` but treats undefined/null/'' as missing so we never emit
// "font-family: undefined;" for templates that omit a style key. Escapes on the
// way out so a value carrying a quote cannot break out of its attribute.
const s = (val: unknown, fallback: string): string => {
  const str = val == null ? '' : String(val);
  return escAttr(str.trim() === '' ? fallback : str);
};

// Outer wrapper shared by every block: block background, outer padding and
// outer margin. Block bodies never set these themselves.
const wrap = (st: EmailBlockStyles, body: string): string =>
  `<div style="background: ${s(st.blockBackground, 'transparent')}; padding: ${s(st.padding, '0')}; margin: ${s(st.margin, '0')};">${body}</div>`;

// Columns wrap the row with background + outer padding + margin (like every
// other block); the per-cell padding is applied inside renderColumns.
const wrapRow = (st: EmailBlockStyles, body: string): string =>
  `<div style="background: ${s(st.blockBackground, 'transparent')}; padding: ${s(st.padding, '0')}; margin: ${s(st.margin, '0')};">${body}</div>`;

// Email clients strip stylesheet blocks and ignore descendant/`:last-child`
// selectors, so the block-level spacing the editor shows via CSS cannot ride
// along as a stylesheet — it must be inlined onto each element. This walks the
// Text block's top-level children and stamps margins (15px between blocks, 0 on
// the last), list indent, and the blockquote rule inline. Author-set inline
// styles (colour, alignment) are preserved and win, since they are appended
// after ours. Mirror of EmailHtmlRenderer::styleRichContent (PHP twin).
const applyBlockSpacing = (el: Element, isLast: boolean): void => {
  const tag = el.tagName.toLowerCase();
  const indent = tag === 'ul' || tag === 'ol' ? '28px' : '0';
  const bottom = isLast ? '0' : '15px';
  let rules = `margin: 0 0 ${bottom} ${indent};`;
  if (tag === 'blockquote') {
    rules +=
      ' border-width: 0 0 0 2px; border-style: solid;' +
      ' border-color: rgba(0, 0, 0, 0.45); padding: 0 0 0 1em;';
  }
  const existing = (el.getAttribute('style') ?? '').trim();
  el.setAttribute('style', existing ? `${existing} ${rules}` : rules);
};

export const styleRichContent = (content: string): string => {
  const html = content.trim();
  if (!html) {
    return '';
  }
  const lower = html.toLowerCase();
  // Nothing but inline/text content → no block children to space.
  if (
    !lower.includes('<p') &&
    !lower.includes('<ul') &&
    !lower.includes('<ol') &&
    !lower.includes('<blockquote')
  ) {
    return html;
  }
  const doc = new DOMParser().parseFromString(
    `<div id="cm-rich-root">${html}</div>`,
    'text/html'
  );
  const root = doc.getElementById('cm-rich-root');
  if (!root) {
    return html;
  }
  const children = Array.from(root.children);
  const last = children.length - 1;
  children.forEach((el, i) => applyBlockSpacing(el, i === last));
  return root.innerHTML;
};

// The default line-height when the author hasn't set one: font-size + 10px
// (16px → 26px, 14px → 24px). Shared with the UI (PxInput fallback) and the PHP
// twin so the canvas, editor field and sent email all agree.
export const defaultLineHeight = (fontSize: string): string =>
  `${(parseFloat(fontSize) || 16) + 10}px`;

const renderText = (st: EmailBlockStyles): string => {
  // font-family is intentionally omitted so text inherits the template Base Font.
  const fontSize = s(st.fontSize, '16px');
  const style =
    `font-size: ${fontSize}; color: ${s(st.color, '#333333')}; ` +
    `font-weight: ${s(st.fontWeight, '400')}; text-align: ${s(st.textAlign, 'left')}; ` +
    `line-height: ${s(st.lineHeight, defaultLineHeight(fontSize))};`;
  // content is author-controlled rich HTML (sanitized server-side to a
  // block-level allow-list; see EmailTemplatesController::allowedInlineHtml).
  // Per-child spacing is inlined here because email drops stylesheets.
  return `<div style="${style}">${styleRichContent(st.content ?? '')}</div>`;
};

const renderImage = (st: EmailBlockStyles): string => {
  if (!st.src) {
    return '';
  }
  // width 'auto' → natural size (capped to the container); a percentage scales
  // the image. max-width:100% always guards against overflow.
  const w = s(st.width, 'auto');
  const img =
    // 'Image' / 'Click Me' defaults are kept raw to stay byte-for-byte identical
    // with the PHP twin (Services/EmailHtmlRenderer.php) — they are generated
    // email content, not UI chrome, so they must not diverge by locale.
    `<img src="${escAttr(st.src)}" alt="${escAttr(st.alt ?? __('Image', 'kelune-crm'))}" ` +
    `style="width: ${w}; max-width: 100%; height: auto; display: inline-block; font-size: 16px; line-height: 1.6;" />`;
  const content = st.link ? `<a href="${escAttr(st.link)}">${img}</a>` : img;
  // line-height:0 on the wrapper removes the inline-block baseline gap.
  return `<div style="text-align: ${s(st.textAlign, 'center')}; line-height: 0;">${content}</div>`;
};

const renderButton = (st: EmailBlockStyles): string => {
  // width 'auto' → button hugs its text (inline); a percentage makes a
  // fixed-width CTA, centred inside the wrapper's text-align.
  const w = s(st.width, 'auto');
  const widthStyle =
    w === 'auto' ? '' : `width: ${w}; box-sizing: border-box; `;
  const btnStyle =
    `display: inline-block; ${widthStyle}padding: ${s(st.buttonPadding, '12px 24px')}; ` +
    `background-color: ${s(st.backgroundColor, '#333333')}; color: ${s(st.textColor, '#FFFFFF')}; ` +
    `font-size: ${s(st.fontSize, '16px')}; font-weight: ${s(st.fontWeight, 'normal')}; ` +
    `line-height: ${s(st.lineHeight, 'normal')}; border-radius: ${s(st.borderRadius, '4px')}; ` +
    `text-decoration: none;`;
  return (
    `<div style="text-align: ${s(st.textAlign, 'center')};">` +
    `<a href="${s(st.link, '#')}" style="${btnStyle}">${escAttr(st.text ?? __('Click Me', 'kelune-crm'))}</a></div>`
  );
};

const renderDivider = (st: EmailBlockStyles): string => {
  // width 'auto' → full width; a percentage makes a shorter, centred rule.
  const w = s(st.width, 'auto');
  const width = w === 'auto' ? '100%' : w;
  return `<hr style="border: none; border-top: ${s(st.borderWidth, '1px')} ${s(st.borderStyle, 'solid')} ${s(st.borderColor, '#DDDDDD')}; width: ${width}; margin: 0 auto;" />`;
};

const renderSpacer = (st: EmailBlockStyles): string =>
  `<div style="height: ${s(st.height, '40px')}; line-height: ${s(st.height, '40px')}; font-size: 1px;">&nbsp;</div>`;

const renderColumns = (st: EmailBlockStyles): string => {
  const count = st.columnCount || 2;
  const width = `${100 / count}%`;
  // Per-cell padding (separate from the block's outer Section padding).
  const cellPadding = s(st.cellPadding, '0');
  let html = `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;"><tr>`;
  for (let i = 0; i < count; i++) {
    const col = st.columns?.[i];
    // Nested blocks first; fall back to any legacy HTML string.
    const cellContent = col?.blocks?.length
      ? col.blocks.map(renderBlockBody).join('')
      : (col?.content ?? '');
    html +=
      `<td width="${width}" valign="top" style="padding: ${cellPadding};">` +
      `${cellContent}</td>`;
  }
  html += '</tr></table>';
  return html;
};

const renderBlockBody = (block: EmailBlock): string => {
  const st: EmailBlockStyles = block.styles || {};
  let body = '';
  switch (block.type) {
    case 'text':
      body = renderText(st);
      break;
    case 'html':
      // Author-supplied raw HTML (sanitized server-side via wp_kses_post; the
      // `html` styles key is NOT the inline-only `content` key). Emitted as-is.
      body = st.html ?? '';
      break;
    case 'image':
      body = renderImage(st);
      break;
    case 'button':
      body = renderButton(st);
      break;
    case 'divider':
      body = renderDivider(st);
      break;
    case 'spacer':
      body = renderSpacer(st);
      break;
    case 'columns':
      // Columns get outer padding/margin like any block; per-cell padding is
      // applied inside renderColumns.
      return wrapRow(st, renderColumns(st));
    default:
      return '';
  }
  return wrap(st, body);
};

// The footer block: sits inside Main, below the content Container, constrained
// to the content width. `global` source emits the marker (swapped later);
// `custom` bakes the authored content. Empty when the footer is disabled.
const renderFooterBlock = (settings: TemplateSettings): string => {
  if (!settings.footerEnabled) {
    return '';
  }
  const inner =
    settings.footerSource === 'custom'
      ? colorizeAnchors(settings.footerContent ?? '', settings.footerLinkColor)
      : globalFooterMarker(settings.footerLinkColor);
  const w = escAttr(settings.contentWidth);
  const font = escAttr(settings.fontFamily);
  const footerFontSize = s(settings.footerFontSize, '14px');
  return (
    `<table width="${w}" cellpadding="0" cellspacing="0" role="presentation" style="max-width: ${w}px; width: 100%;"><tr><td style="padding: ${s(settings.footerPadding, '20px 20px 20px 20px')}; background: ${s(settings.footerBackground, 'transparent')};">` +
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td style="font-family: ${font}; font-size: ${footerFontSize}; font-weight: ${s(settings.footerFontWeight, '400')}; line-height: ${s(settings.footerLineHeight, defaultLineHeight(footerFontSize))}; color: ${s(settings.footerTextColor, '#333333')}; text-align: center;">` +
    inner +
    `</td></tr></table>` +
    `</td></tr></table>`
  );
};

// The inner content HTML (block bodies joined) with no document chrome — the
// fragment that goes inside the content container. Exposed so non-builder editors
// can recover "the current content" when carrying it across a mode switch.
export const renderBlocksBody = (blocks: EmailBlock[]): string =>
  blocks.map(renderBlockBody).join('');

/**
 * Wrap a body fragment in the email document chrome (page + content container +
 * footer) and inline its CSS. This is the CHROME layer: every editor mode edits
 * only the body, and this applies the shared layout — so a rich-text/plain-text
 * email automatically sits in the same default body/container/footer a builder
 * design produces. A body that is already a full document (a builder doc, or one
 * the author pasted in HTML mode) is returned untouched, never double-wrapped.
 */
export const renderEmailDocument = (
  body: string,
  settings: TemplateSettings = DEFAULT_TEMPLATE_SETTINGS
): string => {
  if (EMAIL_DOC_MARKER_RE.test(body) || /<!doctype/i.test(body)) {
    return body;
  }

  // Every link opens in a new tab. Inject target/rel into any anchor that
  // lacks a target — covers image/button links and author-written text links.
  const withTargets = body.replace(
    /<a\b(?![^>]*\btarget=)/gi,
    '<a target="_blank" rel="noopener noreferrer"'
  );

  // Page styles are inlined on the body tag: the server's wp_kses_post would
  // strip a stylesheet block and leave its text visible atop the email.
  const bg = escAttr(settings.backgroundColor);
  const font = escAttr(settings.fontFamily);
  const contentBg = escAttr(settings.contentBackground);
  const contentWidth = escAttr(settings.contentWidth);

  const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: ${font}; background-color: ${bg};">
    ${EMAIL_DOC_MARKER}
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: ${bg};">
        <tr>
            <td align="center" style="padding: ${s(settings.pagePadding, '30px 15px 10px 15px')};">
                <table width="${contentWidth}" cellpadding="0" cellspacing="0" style="background-color: ${contentBg}; max-width: ${contentWidth}px; width: 100%;">
                    <tr>
                        <td style="padding: ${s(settings.contentPadding, '20px')}; font-family: ${font};">
                            ${withTargets}
                        </td>
                    </tr>
                </table>
                ${renderFooterBlock(settings)}
            </td>
        </tr>
    </table>
</body>
</html>`;

  return juice(html);
};

/**
 * Build the full email document from blocks + settings and inline its CSS.
 */
export const generateEmailHtml = (
  blocks: EmailBlock[],
  settings: TemplateSettings = DEFAULT_TEMPLATE_SETTINGS
): string => renderEmailDocument(renderBlocksBody(blocks), settings);
