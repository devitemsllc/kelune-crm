/**
 * Whether the Kelune CRM Pro add-on is active.
 *
 * `wp_localize_script` stringifies every top-level scalar it serializes, so the
 * PHP boolean reaches the browser as "1" (active) or "" (inactive), never a real
 * boolean — a `=== true` check would always be false. Coerce it truthily.
 */
export const isProActive = (): boolean => Boolean(window.kelunecrm?.pro_active);
