/**
 * Global email-footer preview helpers.
 *
 * The server renders the site-wide footer (business tags resolved, unsubscribe
 * pointed at the site home) once at page load, in two forms on
 * `window.kelunecrm`: `email_footer_preview_html` (wrapped in its own
 * font/colour block, for fragment previews) and `email_footer_content_preview_html`
 * (unwrapped, for swapping a builder document's global-footer marker). The
 * dashboard resolves the footer for preview so what the author sees matches what
 * recipients receive. Mirrors EmailService::appendGlobalFooter (PHP).
 */
import {
  GLOBAL_FOOTER_MARKER_RE,
  EMAIL_DOC_MARKER_RE,
  colorizeAnchors,
} from '@/utils/emailHtml';

// Injected into every preview iframe (modal + builder): margins reset so the
// email meets the frame edge, and links inert — a preview should never navigate
// anywhere, footer links included.
const PREVIEW_STYLE =
  '<style>html,body{margin:0;padding:0}a{pointer-events:none;cursor:default}</style>';

// The wrapped global footer (fragment previews), or '' when none is configured.
export const getFooterPreviewWrapped = (): string =>
  window.kelunecrm?.email_footer_preview_html ?? '';

// The unwrapped global footer content (marker replacement / builder canvas), or
// '' when none is configured.
export const getFooterPreviewContent = (): string =>
  window.kelunecrm?.email_footer_content_preview_html ?? '';

/**
 * Resolve the footer for a preview body. Three cases mirror the send pipeline:
 * a builder document carrying the global-footer marker gets it swapped for the
 * resolved footer content (the document's own wrapper styles it); a builder
 * document with a baked custom footer (or footer disabled) is left untouched;
 * a fragment (rich-text / HTML / plain-text) gets the wrapped global footer
 * appended, sized to the content width when the body is a full document.
 */
export const resolveFooterForPreview = (html: string): string => {
  const marker = html.match(GLOBAL_FOOTER_MARKER_RE);
  if (marker) {
    // marker[1] is the template's footer link colour, inlined onto the footer's
    // links (email clients ignore a stylesheet block).
    const footer = colorizeAnchors(getFooterPreviewContent(), marker[1]);
    return html.split(marker[0]).join(footer);
  }

  // A builder document owns its footer (custom baked, or intentionally absent).
  // Detect it by the sentinel that survives server-side wp_kses_post; the doctype
  // is a fallback for freshly-generated, not-yet-sanitized HTML (builder preview).
  if (EMAIL_DOC_MARKER_RE.test(html) || /<!doctype/i.test(html)) {
    return html;
  }

  // Fragment body: append the wrapped global footer.
  const inner = getFooterPreviewWrapped();
  if (!inner) {
    return html;
  }
  return (
    html +
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation">' +
    '<tr><td style="padding: 20px 0;">' +
    inner +
    '</td></tr></table>'
  );
};

/**
 * Add the preview-only style sheet to a body destined for an iframe `srcDoc`.
 *
 * The style goes INSIDE `<head>` on a full document. `<!DOCTYPE html>` only
 * counts when nothing precedes it, so prepending the style would drop the frame
 * into quirks mode and change how the email measures. A fragment has no head, so
 * it takes the style up front.
 */
export const withPreviewStyle = (html: string): string => {
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>${PREVIEW_STYLE}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /<html([^>]*)>/i,
      `<html$1><head>${PREVIEW_STYLE}</head>`
    );
  }
  return PREVIEW_STYLE + html;
};
