import React from 'react';
import { __ } from '@wordpress/i18n';
import {
  SettingOutlined,
  MailOutlined,
  SendOutlined,
  WarningOutlined,
  SafetyOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  LinkOutlined,
  FormOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { CAP, can, type Capability } from '../utils/capabilities';

// Single source of truth for the Settings sub-navigation. Consumed by the
// Settings page sidebar (side-by-side on wide screens) and by the App header
// drawer, where these sections nest under "Settings" on narrow screens (<768px).
export interface SettingsSection {
  key: string;
  icon: React.ReactNode;
  text: string;
  route: string;
  /** Capability required to open the section. */
  capability: Capability;
}

// A function (not a const) so `__()` resolves at render time, once i18n is ready.
export const getSettingsSections = (): SettingsSection[] =>
  allSettingsSections().filter(({ capability }) => can(capability));

/** Every section, capability aside. Also the source for section-level guards. */
export const allSettingsSections = (): SettingsSection[] => [
  {
    key: 'general',
    icon: <SettingOutlined />,
    text: __('General', 'kelune-crm'),
    route: '',
    capability: CAP.MANAGE_SETTINGS,
  },
  {
    key: 'email-global',
    icon: <MailOutlined />,
    text: __('Global Email', 'kelune-crm'),
    route: 'email-global',
    capability: CAP.MANAGE_SETTINGS,
  },
  {
    key: 'email-providers',
    icon: <SendOutlined />,
    text: __('Email Providers', 'kelune-crm'),
    route: 'email-providers',
    capability: CAP.MANAGE_EMAIL_PROVIDERS,
  },
  {
    key: 'bounce-handling',
    icon: <WarningOutlined />,
    text: __('Bounce Handling', 'kelune-crm'),
    route: 'bounce-handling',
    capability: CAP.MANAGE_SETTINGS,
  },
  {
    key: 'custom-fields',
    icon: <FormOutlined />,
    text: __('Custom Fields', 'kelune-crm'),
    route: 'custom-fields',
    capability: CAP.MANAGE_CUSTOM_FIELDS,
  },
  {
    key: 'smart-links',
    icon: <LinkOutlined />,
    text: __('Smart Links', 'kelune-crm'),
    route: 'smart-links',
    capability: CAP.VIEW_SMART_LINKS,
  },
  {
    key: 'double-optin',
    icon: <CheckCircleOutlined />,
    text: __('Double Opt-in', 'kelune-crm'),
    route: 'double-optin',
    capability: CAP.MANAGE_SETTINGS,
  },
  {
    key: 'webhooks',
    icon: <ApiOutlined />,
    text: __('Incoming Webhooks', 'kelune-crm'),
    route: 'incoming-webhooks',
    capability: CAP.MANAGE_WEBHOOKS,
  },
  {
    key: 'roles',
    icon: <UserSwitchOutlined />,
    text: __('Roles & Permissions', 'kelune-crm'),
    route: 'roles',
    capability: CAP.MANAGE_ROLES,
  },
  {
    key: 'compliance',
    icon: <SafetyOutlined />,
    text: __('Compliance', 'kelune-crm'),
    route: 'compliance',
    capability: CAP.MANAGE_SETTINGS,
  },
  {
    key: 'cron-monitor',
    icon: <ClockCircleOutlined />,
    text: __('Cron Monitor', 'kelune-crm'),
    route: 'cron-monitor',
    capability: CAP.MANAGE_SETTINGS,
  },
];

// The section a `/settings/<route>` pathname names, or null when it names none.
// Only the first segment matters; the bare `/settings` (empty route) is General.
export const getSettingsSectionByPath = (
  pathname: string
): SettingsSection | null =>
  allSettingsSections().find(
    (section) => section.route === (pathname.split('/')[2] ?? '')
  ) ?? null;

// The sidebar item a pathname activates; an unknown route keeps General lit.
export const getSettingsMenuKeyFromPath = (pathname: string): string =>
  getSettingsSectionByPath(pathname)?.key ?? 'general';

// Build the `to` path for a section link. Bare `general` → `/settings`.
export const settingsSectionPath = (route: string): string =>
  route === '' ? '/settings' : `/settings/${route}`;
