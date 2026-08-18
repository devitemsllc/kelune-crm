/**
 * Ambient types for the `window.kelunecrm` global injected by PHP via
 * `wp_localize_script` (see includes/Core/Plugin.php::enqueueAdminAssets).
 */

export interface KeluneCRMUser {
  id: number;
  email: string;
  name: string;
  capabilities: Record<string, boolean>;
  /**
   * The user's avatar from WordPress (get_avatar_url), or null when core's
   * show_avatars is off. Null means render a generic icon. Unrelated to the
   * `use_gravatar_service` setting, which governs contacts only.
   */
  avatar_url?: string | null;
}

export interface KeluneCRMGlobal {
  /** REST base, e.g. https://site/wp-json/kelune-crm/v1 */
  api_url: string;
  /** wp_rest nonce for X-WP-Nonce header */
  nonce: string;
  admin_url: string;
  /** True when the site uses Plain permalinks (REST served via ?rest_route=). */
  permalinks_plain?: boolean;
  plugin_url: string;
  version: string;
  /** WordPress core's bundled TinyMCE base URL, e.g. https://site/wp-includes/js/tinymce */
  tinymce_base?: string;
  /** WordPress core version (used to cache-bust the TinyMCE content CSS) */
  wp_version?: string;
  /** Active WordPress locale (e.g. `en_US`, `fr_FR`) for antd/dayjs locale packs. */
  locale?: string;
  user: KeluneCRMUser;
  /** Server-provided settings blob */
  settings: Record<string, unknown>;
  /**
   * The global email footer rendered for preview (business tags resolved,
   * unsubscribe pointed at the site home), wrapped in its own font/colour block.
   * Appended to fragment previews (rich-text / HTML campaigns). Empty when no
   * footer set.
   */
  email_footer_preview_html?: string;
  /**
   * The same global footer as `email_footer_preview_html` but UNWRAPPED (just the
   * author's markup). A builder document supplies its own footer wrapper, so its
   * global-footer marker is swapped for this. Empty when no footer set.
   */
  email_footer_content_preview_html?: string;
  /**
   * Whether the Kelune CRM Pro add-on is active. NOTE: wp_localize_script
   * stringifies top-level scalars, so at runtime this is "1" (active) or ""
   * (inactive), not a real boolean. Read it via isProActive(), which coerces.
   */
  pro_active?: boolean | string;
  /** Per-feature flag map (Pro features). Absent/false → gated in the UI. */
  features?: Partial<Record<FeatureKey, boolean>>;
}

/** Pro feature flag keys, mirrored from Plugin::getFeatures() (PHP). */
export type FeatureKey =
  | 'segments'
  | 'smart_links'
  | 'campaign_ab_testing'
  | 'automation_conditions'
  | 'automation_advanced_actions'
  | 'automation_advanced_triggers';

// --- WordPress media library (wp.media) ---------------------------------
// Minimal typings for the subset of the wp.media API the dashboard uses.
// Enqueued server-side via wp_enqueue_media() (see Plugin::enqueueAdminAssets).

/** A single attachment as returned by `selection.first().toJSON()`. */
export interface WpMediaAttachment {
  id: number;
  url: string;
  alt: string;
  title: string;
  filename: string;
  mime: string;
  width?: number;
  height?: number;
  sizes?: Record<string, { url: string; width: number; height: number }>;
}

interface WpMediaModel {
  toJSON(): WpMediaAttachment;
}

interface WpMediaSelection {
  first(): WpMediaModel | undefined;
  map<T>(cb: (m: WpMediaModel) => T): T[];
}

interface WpMediaFrameState {
  get(key: 'selection'): WpMediaSelection;
}

export interface WpMediaFrame {
  on(event: 'select' | 'open' | 'close', cb: () => void): void;
  state(): WpMediaFrameState;
  open(): void;
  close(): void;
}

export interface WpMediaOptions {
  title?: string;
  button?: { text?: string };
  multiple?: boolean;
  library?: { type?: string | string[] };
}

export interface WpGlobal {
  media?: (options?: WpMediaOptions) => WpMediaFrame;
}

export interface WpTinyMCEGlobal {
  init(config: Record<string, unknown>): void;
}

declare global {
  interface Window {
    kelunecrm?: KeluneCRMGlobal;
    wp?: WpGlobal;
    /** Present once core's TinyMCE script has loaded (see RichTextEditor). */
    tinymce?: WpTinyMCEGlobal;
    /**
     * Packages carried by the vendor bundles, which PHP enqueues ahead of the
     * app. The app never reads these by name — the build rewrites its imports
     * to them (see `appGlobals` in vite.config.js).
     */
    KeluneCRMAntd?: {
      antd: typeof import('antd');
      icons: typeof import('@ant-design/icons');
      dayjs: typeof import('dayjs');
    };
    KeluneCRMCharts?: {
      charts: typeof import('@ant-design/charts');
    };
    KeluneCRMEditors?: {
      codemirror: typeof import('@uiw/react-codemirror');
      langHtml: typeof import('@codemirror/lang-html');
      view: typeof import('@codemirror/view');
      juice: typeof import('juice');
    };
  }
}

export {};
