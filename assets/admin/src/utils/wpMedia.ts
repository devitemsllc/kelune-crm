/**
 * Thin wrapper around the WordPress media library (`wp.media`).
 *
 * The media scripts are enqueued server-side via `wp_enqueue_media()`
 * (see Plugin::enqueueAdminAssets), so `window.wp.media` is available on every
 * dashboard page. Use this for any admin-authored, reusable/public asset that
 * belongs in the WP Media Library (e.g. email template images).
 *
 * Not for per-record private / visitor-uploaded files — those need a scoped
 * upload endpoint with their own capability + validation, not the library.
 */
import type { WpMediaAttachment, WpMediaOptions } from '../types/global.d';

export interface OpenMediaLibraryOptions {
  /** Modal title. */
  title?: string;
  /** Text on the confirm button. */
  buttonText?: string;
  /** Restrict the library, e.g. 'image', 'audio', 'video'. */
  type?: string | string[];
}

/** True when the wp.media API is present (media scripts enqueued). */
export const isMediaLibraryAvailable = (): boolean =>
  typeof window.wp?.media === 'function';

/**
 * Open the media library for a single selection. Resolves with the chosen
 * attachment, or `null` if the modal is closed without a pick (or the API is
 * unavailable). Never rejects.
 */
export const openMediaLibrary = (
  options: OpenMediaLibraryOptions = {}
): Promise<WpMediaAttachment | null> =>
  new Promise((resolve) => {
    const media = window.wp?.media;
    if (typeof media !== 'function') {
      resolve(null);
      return;
    }

    const frameOptions: WpMediaOptions = {
      title: options.title,
      button: options.buttonText ? { text: options.buttonText } : undefined,
      multiple: false,
      library: options.type ? { type: options.type } : undefined,
    };

    const frame = media(frameOptions);

    frame.on('select', () => {
      const attachment = frame.state().get('selection').first()?.toJSON();
      resolve(attachment ?? null);
    });

    // If the user dismisses the modal without selecting, settle the promise so
    // callers awaiting it aren't left hanging.
    frame.on('close', () => {
      // Defer so a preceding 'select' wins the race and resolves first.
      window.setTimeout(() => resolve(null), 0);
    });

    frame.open();
  });
