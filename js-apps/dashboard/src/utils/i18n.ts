/**
 * `@wordpress/i18n` shim. The dashboard imports the standard WordPress i18n API,
 * and Vite/TypeScript alias that specifier to THIS file (vite.config.js
 * resolve.alias + tsconfig.json paths) so no second copy of i18n is bundled:
 * calls route to core's own `window.wp.i18n` runtime, which
 * wp_set_script_translations() feeds the locale's translations.
 *
 * Callers must keep the real `__('Text', 'kelune-crm')` signature with the
 * domain at every call site — that is what lets `wp i18n make-pot` extract the
 * strings, and it cannot be hidden inside the wrapper.
 *
 * With `window.wp.i18n` missing, the helpers return the untranslated source text
 * so the UI never breaks.
 */

interface WpI18n {
  __(text: string, domain?: string): string;
  _x(text: string, context: string, domain?: string): string;
  _n(single: string, plural: string, number: number, domain?: string): string;
  _nx(
    single: string,
    plural: string,
    number: number,
    context: string,
    domain?: string
  ): string;
  sprintf(format: string, ...args: unknown[]): string;
  isRTL(): boolean;
  setLocaleData(data: Record<string, unknown>, domain?: string): void;
  hasTranslation(single: string, context?: string, domain?: string): boolean;
}

const wp: WpI18n | undefined = (window as unknown as { wp?: { i18n?: WpI18n } })
  .wp?.i18n;

export const __ = (text: string, domain?: string): string =>
  wp ? wp.__(text, domain) : text;

export const _x = (text: string, context: string, domain?: string): string =>
  wp ? wp._x(text, context, domain) : text;

export const _n = (
  single: string,
  plural: string,
  number: number,
  domain?: string
): string =>
  wp ? wp._n(single, plural, number, domain) : number === 1 ? single : plural;

export const _nx = (
  single: string,
  plural: string,
  number: number,
  context: string,
  domain?: string
): string =>
  wp
    ? wp._nx(single, plural, number, context, domain)
    : number === 1
      ? single
      : plural;

export const sprintf = (format: string, ...args: unknown[]): string => {
  if (wp) {
    return wp.sprintf(format, ...args);
  }
  // Minimal fallback: replace positional/typed specifiers left-to-right.
  let i = 0;
  return format.replace(/%[sd%]/g, (m) =>
    m === '%%' ? '%' : String(args[i++] ?? '')
  );
};

export const isRTL = (): boolean => (wp ? wp.isRTL() : false);

export const setLocaleData = (
  data: Record<string, unknown>,
  domain?: string
): void => {
  wp?.setLocaleData(data, domain);
};

export const hasTranslation = (
  single: string,
  context?: string,
  domain?: string
): boolean => (wp ? wp.hasTranslation(single, context, domain) : false);
