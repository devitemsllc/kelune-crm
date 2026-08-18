import { useState, useEffect } from 'react';
import { Menu, Divider, Flex } from 'antd';
import WebhookList from '../components/webhooks/WebhookList';
import SmartLinks from './SmartLinks';
import CustomFields from './CustomFields';
import GeneralSettings from './settings/GeneralSettings';
import EmailGlobalSettings from './settings/EmailGlobalSettings';
import DoubleOptinSettings from './settings/DoubleOptinSettings';
import EmailProviders from './settings/EmailProviders';
import ComplianceSettings from './settings/ComplianceSettings';
import CronMonitor from './settings/CronMonitor';
import { Link, useLocation } from 'react-router-dom';
import useScreens from '../hooks/useScreens';
import { isProActive } from '../hooks/useFeature';
import {
  getSettingsSections,
  getSettingsMenuKeyFromPath as getMenuKeyFromPath,
  settingsSectionPath,
} from '../config/settingsNav';

// Shell only: sidebar + route switch. Each section component fetches and saves
// itself fully independently (own GET on mount, own POST on save, own form).
const Settings = () => {
  const location = useLocation();
  const { xs, sm, md, wps } = useScreens();
  // Below 992px (stage 2) the sidebar moves into the header drawer (nested under
  // "Settings"), so this page renders content only — full width, no sidebar.
  const narrow = xs || sm || md;
  // Initialize from the current route to prevent a flash of the default tab.
  const [selectedMenu, setSelectedMenu] = useState(() =>
    getMenuKeyFromPath(location.pathname)
  );

  // Sync selected menu with router navigation.
  useEffect(() => {
    setSelectedMenu(getMenuKeyFromPath(location.pathname));
  }, [location.pathname]);

  // Each section renders its label as a real `<Link>` (`#/settings/<route>`) so
  // sections are openable in a new tab; plain clicks route via HashRouter and
  // `selectedMenu` syncs from the location effect above. Sections come from the
  // shared config so the header drawer nests the same list on narrow screens.
  const menuItems = getSettingsSections().map(({ key, icon, text, route }) => ({
    key,
    label: (
      <Link to={settingsSectionPath(route)} style={{ color: 'inherit' }}>
        {icon}
        <span style={{ marginInlineStart: 8 }}>{text}</span>
      </Link>
    ),
  }));

  const renderContent = () => {
    switch (selectedMenu) {
      case 'general':
        return <GeneralSettings />;

      case 'email-global':
        return <EmailGlobalSettings />;

      case 'email-providers':
        return <EmailProviders />;

      case 'custom-fields':
        return <CustomFields />;

      case 'smart-links':
        // Smart Links is a Pro feature; the nav entry is hidden when Pro is
        // inactive, so this only renders once Pro is active.
        return isProActive() ? <SmartLinks /> : null;

      case 'double-optin':
        return <DoubleOptinSettings />;

      case 'webhooks':
        return <WebhookList />;

      case 'compliance':
        return <ComplianceSettings />;

      case 'cron-monitor':
        return <CronMonitor />;

      default:
        return null;
    }
  };

  // Don't render until selectedMenu is initialized to prevent flash
  if (!selectedMenu) {
    return null;
  }

  // Option/form sections (#/settings, /email-global, /double-optin, /compliance)
  // read better constrained and centered; the table/list sections stay full
  // width. Drop flex-grow here on purpose: with `flex: 1` (basis 0%) auto
  // margins would absorb the free space before growing and collapse the item, so
  // give it an explicit width capped at 960 and center via auto inline margins.
  const isOptionSection =
    selectedMenu === 'general' ||
    selectedMenu === 'email-global' ||
    selectedMenu === 'double-optin' ||
    selectedMenu === 'compliance';
  const contentStyle = isOptionSection
    ? { minWidth: 0, width: '100%', maxWidth: 960, marginInline: 'auto' }
    : { flex: 1, minWidth: 0 };

  // Stage 2 (<768px): the sidebar lives in the header drawer, so render the
  // active section's content only, full width.
  if (narrow) {
    return (
      <div className="kelune-crm-cc-settings-container">
        <div style={contentStyle}>{renderContent()}</div>
      </div>
    );
  }

  return (
    <div className="kelune-crm-cc-settings-container">
      <Flex
        vertical={false}
        gap={0}
        align="stretch"
        style={{
          // Fill the app Content shell so the vertical divider runs the full
          // height, not just as tall as the section content.
          minHeight: wps ? 'calc(100vh - 297px)' : 'calc(100vh - 242px)',
        }}
      >
        <div style={{ flex: '0 0 240px', width: 240 }}>
          <Menu
            mode="inline"
            inlineIndent={16}
            selectedKeys={[selectedMenu]}
            items={menuItems}
            style={{ border: 'none', background: 'transparent' }}
          />
        </div>
        <Divider type="vertical" style={{ margin: '0 16px', height: 'auto' }} />
        <div style={contentStyle}>{renderContent()}</div>
      </Flex>
    </div>
  );
};

export default Settings;
