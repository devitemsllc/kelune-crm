import { __, sprintf } from '@wordpress/i18n';

/** Marketing URL behind every upgrade CTA. */
export const PRO_URL = 'https://devitems.com';

/** Hover copy for a control the Pro add-on unlocks. */
export const proLockTitle = (name: string): string =>
  sprintf(
    /* translators: %s: Pro feature name */
    __('%s is a Pro feature. Upgrade to unlock it.', 'kelune-crm'),
    name
  );

/** Body copy for the upgrade teaser shown in place of a Pro surface. */
export const proUpgradeText = (name: string): string =>
  sprintf(
    /* translators: %s: Pro feature name */
    __('Upgrade to Kelune CRM Pro to unlock %s.', 'kelune-crm'),
    name
  );
