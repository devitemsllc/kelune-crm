import { CAP, can, type Capability } from './capabilities';
import {
  allSettingsSections,
  settingsSectionPath,
} from '../config/settingsNav';

/** The dashboard is an analytics report, so it takes the analytics capability. */
export const canViewDashboard = (): boolean => can(CAP.VIEW_ANALYTICS);

// Where a user who cannot open the dashboard lands instead, in nav order;
// the Settings sections extend it, in sidebar order.
const FALLBACK_ROUTES: Array<[Capability, string]> = [
  [CAP.VIEW_CONTACTS, '/contacts'],
  [CAP.VIEW_LISTS, '/contacts/lists'],
  [CAP.VIEW_TAGS, '/contacts/tags'],
  [CAP.VIEW_SEGMENTS, '/contacts/segments'],
  [CAP.VIEW_CAMPAIGNS, '/campaigns'],
  [CAP.VIEW_AUTOMATIONS, '/automations'],
  [CAP.VIEW_EMAIL_TEMPLATES, '/email-templates'],
  [CAP.VIEW_EMAIL_LOGS, '/email-logs'],
];

export const firstPermittedRoute = (): string | null => {
  const settingsRoutes = allSettingsSections().map(
    ({ capability, route }): [Capability, string] => [
      capability,
      settingsSectionPath(route),
    ]
  );

  return (
    [...FALLBACK_ROUTES, ...settingsRoutes].find(([capability]) =>
      can(capability)
    )?.[1] ?? null
  );
};

export const landingRoute = (): string =>
  canViewDashboard() ? '/dashboard' : (firstPermittedRoute() ?? '/dashboard');
