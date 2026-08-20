import type { FeatureKey } from '../types/global';

/**
 * Whether the Kelune CRM Pro add-on is active.
 *
 * `wp_localize_script` stringifies every top-level scalar it serializes, so the
 * PHP boolean reaches the browser as "1" (active) or "" (inactive), never a real
 * boolean — a `=== true` check would always be false. Coerce it truthily.
 * (Nested values like `features` keep their real types, so useFeature below can
 * still compare `=== true`.)
 */
export const isProActive = (): boolean => Boolean(window.kelunecrm?.pro_active);

/** Whether a specific Pro feature is enabled. */
const isFeatureEnabled = (feature: FeatureKey): boolean =>
  window.kelunecrm?.features?.[feature] === true;

/** Hook form of {@link isFeatureEnabled} for use inside components. */
export const useFeature = (feature: FeatureKey): boolean =>
  isFeatureEnabled(feature);
