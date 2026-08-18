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

// Injected into every preview iframe (modal + builder) so links are inert — a
// preview should never navigate anywhere, footer links included.
export const PREVIEW_NO_LINK_STYLE =
  '<style>a{pointer-events:none;cursor:default}</style>';

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
