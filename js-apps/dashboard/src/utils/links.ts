/**
 * Every external destination the dashboard links to, in one place.
 * `utm_source=plugin` separates admin clicks from the `wprepo` ones readme.txt sends.
 */

const SITE_URL = 'https://kelunecrm.com';

const campaign = (path: string, name: string): string =>
  `${SITE_URL}${path}?utm_source=plugin&utm_medium=freeplugin&utm_campaign=${name}`;

/** Product home — the "learn more" destination. */
export const SITE_HOME_URL = campaign('', 'learnmore');

/** Pricing page — behind every upgrade CTA. */
export const PRICING_URL = campaign('/pricing', 'purchasepro');

/** Support contact form — behind every help CTA. */
export const SUPPORT_URL = campaign('/contact', 'support');
