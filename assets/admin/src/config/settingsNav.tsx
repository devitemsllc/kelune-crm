import React from 'react';
import { __ } from '@wordpress/i18n';
import { isProActive } from '../hooks/useFeature';
import {
  SettingOutlined,
  MailOutlined,
  SendOutlined,
  SafetyOutlined,
  ApiOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  LinkOutlined,
  FormOutlined,
} from '@ant-design/icons';

// Single source of truth for the Settings sub-navigation. Consumed by the
// Settings page sidebar (side-by-side on wide screens) and by the App header
// drawer, where these sections nest under "Settings" on narrow screens (<768px).
export interface SettingsSection {
  key: string;
  icon: React.ReactNode;
  text: string;
  route: string;
}

// A function (not a const) so `__()` resolves at render time, once i18n is ready.
// Smart Links is a Pro feature — its section appears only when Pro is active.
export const getSettingsSections = (): SettingsSection[] => [
  {
    key: 'general',
    icon: <SettingOutlined />,
    text: __('General', 'kelune-crm'),
    route: '',
  },
  {
    key: 'email-global',
    icon: <MailOutlined />,
    text: __('Global Email', 'kelune-crm'),
    route: 'email-global',
  },
  {
    key: 'email-providers',
    icon: <SendOutlined />,
    text: __('Email Providers', 'kelune-crm'),
    route: 'email-providers',
  },
  {
    key: 'custom-fields',
    icon: <FormOutlined />,
    text: __('Custom Fields', 'kelune-crm'),
    route: 'custom-fields',
  },
  ...(isProActive()
    ? [
        {
          key: 'smart-links',
          icon: <LinkOutlined />,
          text: __('Smart Links', 'kelune-crm'),
          route: 'smart-links',
        },
      ]
    : []),
  {
    key: 'double-optin',
    icon: <CheckCircleOutlined />,
    text: __('Double Opt-in', 'kelune-crm'),
    route: 'double-optin',
  },
  {
    key: 'webhooks',
    icon: <ApiOutlined />,
    text: __('Incoming Webhooks', 'kelune-crm'),
    route: 'incoming-webhooks',
  },
  {
    key: 'compliance',
    icon: <SafetyOutlined />,
    text: __('Compliance', 'kelune-crm'),
    route: 'compliance',
  },
  {
    key: 'cron-monitor',
    icon: <ClockCircleOutlined />,
    text: __('Cron Monitor', 'kelune-crm'),
    route: 'cron-monitor',
  },
];

// Map a `/settings/<route>` pathname to its active section key. Routes not
// listed (and the bare `/settings`) fall back to `general`.
export const getSettingsMenuKeyFromPath = (pathname: string): string => {
  const route = pathname.split('/')[2];

  if (route) {
    const routeToMenuKey: Record<string, string> = {
      'email-global': 'email-global',
      'email-providers': 'email-providers',
      'custom-fields': 'custom-fields',
      'smart-links': 'smart-links',
      'double-optin': 'double-optin',
      'incoming-webhooks': 'webhooks',
      compliance: 'compliance',
      'cron-monitor': 'cron-monitor',
    };

    return routeToMenuKey[route] || 'general';
  }

  return 'general';
};

// Build the `to` path for a section link. Bare `general` → `/settings`.
export const settingsSectionPath = (route: string): string =>
  route === '' ? '/settings' : `/settings/${route}`;
