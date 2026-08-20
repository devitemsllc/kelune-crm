/**
 * Email the license activation forms start on. Contributed by the Pro add-on
 * via `kelune_crm_dashboard_config`; empty when Pro is inactive, which is also
 * when no license form is reachable.
 */
export const licenseEmail = (): string =>
  typeof window.kelunecrm?.license_email === 'string'
    ? window.kelunecrm.license_email
    : '';

export default licenseEmail;
