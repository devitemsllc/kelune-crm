/**
 * Build the public incoming-webhook endpoint URL for a key.
 *
 * Derived from `window.kelunecrm.api_url` — the server-side `rest_url()`
 * value — so it is correct regardless of permalink structure. With pretty
 * permalinks that base is `.../wp-json/kelune-crm/v1`; with plain permalinks
 * it is `.../?rest_route=/kelune-crm/v1`, and appending `/webhook/{key}`
 * extends the route in both forms. Hardcoding `/wp-json/...` instead breaks on
 * plain permalinks and on subdirectory/multisite installs.
 */
export const buildWebhookUrl = (key?: string): string => {
  const base = (window.kelunecrm?.api_url || '/wp-json/kelune-crm/v1').replace(
    /\/$/,
    ''
  );
  return `${base}/webhook/${key ?? ''}`;
};
