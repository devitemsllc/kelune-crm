/**
 * `@wordpress/i18n` shim — the dashboard imports the standard WordPress i18n API
 * from '@wordpress/i18n', and Vite/TypeScript alias that specifier to THIS file
 * (see vite.config.js resolve.alias + tsconfig.json paths). This mirrors what
 * @wordpress/scripts does with its dependency-extraction plugin: instead of
 * bundling a second copy of i18n, we route to WordPress core's own runtime at
 * `window.wp.i18n` (the `wp-i18n` script), which is enqueued as a dependency and
 * fed the locale's translations by wp_set_script_translations() in PHP
 * (see includes/Core/Plugin.php::enqueueAdminAssets).
 *
 * Because callers use the real `__('Text', 'kelune-crm')` signature (text
 * domain passed at every call site), `wp i18n make-pot` extracts every string
 * into languages/kelune-crm.pot exactly as it does for PHP — this is the
 * whole reason the domain is NOT hidden inside the wrapper.
 *
 * If `window.wp.i18n` is ever missing (e.g. a stripped test harness) the helpers
 * degrade to the untranslated source text so the UI never breaks.
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
