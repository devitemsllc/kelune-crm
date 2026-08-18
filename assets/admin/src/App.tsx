import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Layout, Menu, theme, Flex, Drawer, Button, Typography } from 'antd';
import { __ } from '@wordpress/i18n';
import useScreens from './hooks/useScreens';
import { useSetupWizard } from './hooks/useSetupWizard';
import { isProActive } from './hooks/useFeature';
import BrandMark from './components/common/BrandMark';
import ErrorBoundary from './components/common/ErrorBoundary';
import GlobalLoader from './components/common/GlobalLoader';
import {
  getSettingsSections,
  getSettingsMenuKeyFromPath,
  settingsSectionPath,
} from './config/settingsNav';
import {
  UserOutlined,
  MailOutlined,
  RobotOutlined,
  BarChartOutlined,
  SettingOutlined,
  FileTextOutlined,
  InboxOutlined,
  DashboardOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  TagsOutlined,
  ApartmentOutlined,
  SendOutlined,
  MenuOutlined,
} from '@ant-design/icons';

import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Campaigns from './pages/Campaigns';
import Automations from './pages/Automations';
import AutomationBuilderPage from './pages/AutomationBuilderPage';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import EmailTemplates from './pages/EmailTemplates';
import EmailTemplateBuilderPage from './pages/EmailTemplateBuilderPage';
import EmailLogs from './pages/EmailLogs';
import NotFound from './pages/NotFound';
import SetupWizard from './pages/SetupWizard';

const { Header, Content } = Layout;

// Cap the centered content column so it never stretches edge-to-edge on very
// wide monitors; the header chrome (border) still spans the full viewport.
const MAX_CONTENT_WIDTH = 1760;

// Per-route spacing for the main content layout. Breakpoint = WP admin bar
// threshold (see useScreens `wps`): >=783px fixed, <=782px scrolls.
//   large = screens >= 783px
//   small = screens <= 782px
// Routes not listed fall back to `default`. Within a route, anything not set in
// `small` inherits from `large`. `default.small` acts as a global small baseline.
// Spacing values for one breakpoint of a route. All optional so a route's
// `small` can override just the fields that differ from its `large`.
interface SpacingValues {
  margin?: string | number;
  padding?: string | number;
  minHeight?: string;
}

// A route entry: a `large` (>=783px) base and an optional `small` (<=782px)
// override layered on top of it.
interface RouteSpacing {
  large?: SpacingValues;
  small?: SpacingValues;
}

const ROUTE_SPACING: Record<string, RouteSpacing> = {
  default: {
    large: { margin: 16, padding: 24, minHeight: 'calc(100vh - 194px)' },
    small: { minHeight: 'calc(100vh - 244px)' },
  },
  contacts: {
    large: { margin: 16, padding: '12px 24px 24px 24px' },
  },
  settings: {
    // Tighter left padding so the sidebar menu aligns near the edge.
    large: { margin: 16, padding: '24px 24px 24px 20px' },
  },
};

const px = (v: string | number | undefined) =>
  typeof v === 'number' ? `${v}px` : v;

// Resolve the active spacing object for a route at the current breakpoint.
// Merge order encodes the fallback chain (large -> default.small -> route.small).
const getRouteSpacing = (page: string, isSmall: boolean) => {
  const route = ROUTE_SPACING[page] || ROUTE_SPACING.default;
  const dflt = ROUTE_SPACING.default;

  const large = { ...dflt.large, ...(route.large || {}) };
  if (!isSmall) {
    return {
      margin: px(large.margin),
      padding: px(large.padding),
      minHeight: large.minHeight,
    };
  }

  const small = { ...large, ...(dflt.small || {}), ...(route.small || {}) };
  return {
    margin: px(small.margin),
    padding: px(small.padding),
    minHeight: small.minHeight,
  };
};

// Prefix route match (mirrors support-genix `routeMatched`): a submenu stays
// active for its own route and any nested sub-route (e.g. /contacts -> /contacts/lists).
const routeMatched = (path: string, target: string) => {
  // Dashboard landing: the bare slug (no hash) loads the app at '/', which
  // redirects to /dashboard — so highlight it for '', '/' and '/dashboard'.
  if (target === '/dashboard') {
    return path === '/' || path === '' || path === '/dashboard';
  }
  // WP "Contacts" header links to /contacts-group (a redirect → /contacts);
  // keep it highlighted across all contact routes it groups.
  if (target === '/contacts-group') {
    return path.startsWith('/contacts');
  }
  // "All Contacts" leaf (#/contacts) — active only on the exact contacts route,
  // never on Lists/Tags/Segments children (they have their own submenu items).
  if (target === '/contacts') {
    return path === '/contacts';
  }
  // WP "Emails" header links to /emails-group (a redirect → /email-templates);
  // keep it highlighted across the email pages it groups.
  if (target === '/emails-group') {
    return (
      path.startsWith('/email-templates') || path.startsWith('/email-logs')
    );
  }
  return path === target || path.startsWith(`${target}/`);
};

const App = () => {
  const location = useLocation();
  // Active top-level page = first path segment (e.g. 'contacts' from '/contacts/lists').
  const currentPage = location.pathname.split('/')[1] || 'dashboard';
  const {
    token: { colorBgContainer, colorPrimary },
  } = theme.useToken();
  const { xs, sm, md, lg, wps } = useScreens();
  const spacing = getRouteSpacing(currentPage, wps);

  // Two-stage responsive collapse:
  //   Stage 1 (<1200px): the horizontal header menu moves into a right drawer.
  //   Stage 2 (<992px): the Settings page sidebar also moves into the drawer,
  //   nested as an expandable submenu under "Settings".
  const drawerMode = xs || sm || md || lg;
  const settingsInDrawer = xs || sm || md;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerOpenKeys, setDrawerOpenKeys] = useState<string[]>([]);

  // Close the drawer whenever the route changes (a nav item was tapped).
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Keep the active WordPress submenu indicator in sync with the route.
  // All submenus share the same admin page (?page=kelune-crm), so WordPress
  // can't highlight the right one — we do it manually based on the hash route.
  useEffect(() => {
    const menu = document.getElementById('toplevel_page_kelune-crm');
    if (!menu) return;

    const items = menu.querySelectorAll('.wp-submenu > li');
    const path = location.pathname;

    // Drop the lingering focus outline left after clicking a submenu link.
    const handleClick = (e: Event) => (e.currentTarget as HTMLElement).blur();

    items.forEach((li) => {
      const anchor = li.querySelector('a');
      if (!anchor?.href) return;

      // Submenu href: '#/campaigns' -> '/campaigns'. The bare-slug first item
      // (Dashboard) has no hash; map it to '/dashboard' so it highlights on the
      // landing route.
      const hashPart = anchor.href.split('#')[1];
      const hrefPath = hashPart ?? '/dashboard';

      li.classList.remove('current');
      anchor.classList.remove('current');

      if (routeMatched(path, hrefPath)) {
        li.classList.add('current');
        anchor.classList.add('current');
        anchor.blur();
      }

      anchor.addEventListener('click', handleClick);
    });

    return () => {
      items.forEach((li) => {
        const anchor = li.querySelector('a');
        if (anchor) anchor.removeEventListener('click', handleClick);
      });
    };
  }, [location.pathname]);

  // Which menu key is active. Contacts keeps its sub-route (e.g.
  // `contacts/lists`) so the right child highlights; everything else is the
  // first path segment.
  const parts = location.pathname.split('/').filter(Boolean);
  const selectedKey =
    parts[0] === 'contacts'
      ? parts[1]
        ? `contacts/${parts[1]}`
        : 'contacts'
      : parts[0] || 'dashboard';

  // Each leaf renders its label as a real anchor (`#/<path>`) so items are
  // openable in a new tab (cmd/ctrl-click) and expose a real href. Plain
  // left-click is handled by HashRouter via the hash change.
  const navLink = (path: string, icon: React.ReactNode, text: string) => (
    <Link to={path} style={{ color: 'inherit' }}>
      {icon}
      <span style={{ marginInlineStart: 8 }}>{text}</span>
    </Link>
  );

  const menuItems = [
    {
      key: 'dashboard',
      label: navLink(
        '/dashboard',
        <DashboardOutlined />,
        __('Dashboard', 'kelune-crm')
      ),
    },
    {
      key: 'contacts-group',
      label: (
        <span>
          <UserOutlined />
          <span style={{ marginInlineStart: 8 }}>
            {__('Contacts', 'kelune-crm')}
          </span>
        </span>
      ),
      children: [
        {
          key: 'contacts',
          label: navLink(
            '/contacts',
            <TeamOutlined />,
            __('All Contacts', 'kelune-crm')
          ),
        },
        {
          key: 'contacts/lists',
          label: navLink(
            '/contacts/lists',
            <UnorderedListOutlined />,
            __('Lists', 'kelune-crm')
          ),
        },
        {
          key: 'contacts/tags',
          label: navLink(
            '/contacts/tags',
            <TagsOutlined />,
            __('Tags', 'kelune-crm')
          ),
        },
        // Segments are a Pro feature — the nav item appears only when Pro is active.
        ...(isProActive()
          ? [
              {
                key: 'contacts/segments',
                label: navLink(
                  '/contacts/segments',
                  <ApartmentOutlined />,
                  __('Segments', 'kelune-crm')
                ),
              },
            ]
          : []),
      ],
    },
    {
      key: 'campaigns',
      label: navLink(
        '/campaigns',
        <SendOutlined />,
        __('Campaigns', 'kelune-crm')
      ),
    },
    {
      key: 'automations',
      label: navLink(
        '/automations',
        <RobotOutlined />,
        __('Automations', 'kelune-crm')
      ),
    },
    {
      key: 'emails-group',
      label: (
        <span>
          <MailOutlined />
          <span style={{ marginInlineStart: 8 }}>
            {__('Emails', 'kelune-crm')}
          </span>
        </span>
      ),
      children: [
        {
          key: 'email-templates',
          label: navLink(
            '/email-templates',
            <FileTextOutlined />,
            __('Templates', 'kelune-crm')
          ),
        },
        {
          key: 'email-logs',
          label: navLink(
            '/email-logs',
            <InboxOutlined />,
            __('Logs', 'kelune-crm')
          ),
        },
      ],
    },
    {
      key: 'analytics',
      label: navLink(
        '/analytics',
        <BarChartOutlined />,
        __('Analytics', 'kelune-crm')
      ),
    },
    {
      key: 'settings',
      label: navLink(
        '/settings',
        <SettingOutlined />,
        __('Settings', 'kelune-crm')
      ),
    },
  ];

  // Drawer nav: the same items, but on stage 2 (<768px) the "Settings" leaf
  // becomes an expandable submenu holding the Settings page's own sections.
  const settingsChildren = getSettingsSections().map(
    ({ key, icon, text, route }) => ({
      key,
      label: navLink(settingsSectionPath(route), icon, text),
    })
  );

  const drawerMenuItems = menuItems.map((item) =>
    item.key === 'settings' && settingsInDrawer
      ? {
          key: 'settings',
          label: (
            <span>
              <SettingOutlined />
              <span style={{ marginInlineStart: 8 }}>
                {__('Settings', 'kelune-crm')}
              </span>
            </span>
          ),
          children: settingsChildren,
        }
      : item
  );

  // On settings routes at stage 2 the active item is the nested section, not the
  // top-level "settings" key.
  const drawerSelectedKey =
    settingsInDrawer && parts[0] === 'settings'
      ? getSettingsMenuKeyFromPath(location.pathname)
      : selectedKey;

  // Keep the relevant inline submenu(s) open to reflect the current route.
  useEffect(() => {
    const seg = location.pathname.split('/').filter(Boolean)[0];
    const keys: string[] = [];
    if (seg === 'contacts') keys.push('contacts-group');
    if (seg === 'email-templates' || seg === 'email-logs') {
      keys.push('emails-group');
    }
    if (settingsInDrawer && seg === 'settings') keys.push('settings');
    setDrawerOpenKeys(keys);
  }, [location.pathname, settingsInDrawer]);

  // Header sticks below the WP admin bar on large screens; on small screens the
  // admin bar isn't fixed (<=782px), so the header scrolls with the page.
  const headerStyle: React.CSSProperties = {
    background: '#fff',
    padding: 0,
    boxShadow: 'none',
    borderBottom: '1px solid #f0f0f0',
    height: 64,
    lineHeight: '64px',
    position: wps ? 'relative' : 'sticky',
    top: wps ? 0 : 32,
    zIndex: 10,
  };

  return (
    <Layout style={{ background: 'transparent' }}>
      <GlobalLoader />
      <Header style={headerStyle}>
        <Flex
          align="center"
          justify="space-between"
          style={{
            margin: '0 auto',
            maxWidth: MAX_CONTENT_WIDTH,
            padding: drawerMode ? '0 12px 0 16px' : '0 4px 0 20px',
            height: 64,
          }}
        >
          <Link to="/" style={{ color: 'inherit' }}>
            <Flex
              align="center"
              gap={12}
              style={{
                fontSize: 20,
                fontWeight: 600,
                minWidth: drawerMode ? 0 : 200,
                flexShrink: 0,
              }}
            >
              <BrandMark size={30} variant="tile" tileColor={colorPrimary} />
              <span
                style={{
                  whiteSpace: 'nowrap',
                  color: colorPrimary,
                  fontWeight: 600,
                }}
              >
                Kelune CRM
              </span>
            </Flex>
          </Link>
          {drawerMode ? (
            <Button
              type="text"
              aria-label={__('Open menu', 'kelune-crm')}
              icon={<MenuOutlined style={{ fontSize: 18 }} />}
              onClick={() => setDrawerOpen(true)}
            />
          ) : (
            <Menu
              theme="light"
              mode="horizontal"
              selectedKeys={[selectedKey]}
              items={menuItems}
              style={{
                flex: 1,
                minWidth: 0,
                borderBottom: '1px solid #f0f0f0',
                justifyContent: 'flex-end',
              }}
            />
          )}
        </Flex>
      </Header>
      <Drawer
        placement="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={260}
        styles={{ body: { padding: 0 } }}
        title={
          <Typography.Text style={{ fontSize: 16, fontWeight: 500 }}>
            {__('Navigation', 'kelune-crm')}
          </Typography.Text>
        }
      >
        <Menu
          mode="inline"
          selectedKeys={[drawerSelectedKey]}
          openKeys={drawerOpenKeys}
          onOpenChange={setDrawerOpenKeys}
          items={drawerMenuItems}
          style={{ border: 'none' }}
        />
      </Drawer>
      <Content
        style={{
          width: '100%',
          maxWidth: MAX_CONTENT_WIDTH,
          margin: '0 auto',
          padding: 0,
          background: 'transparent',
        }}
      >
        <Layout style={{ background: 'transparent', padding: 0, margin: 0 }}>
          <Content
            style={{
              margin: spacing.margin,
              padding: spacing.padding,
              minHeight: spacing.minHeight,
              background: colorBgContainer,
              borderRadius: 8,
            }}
          >
            <ErrorBoundary>
              <Routes>
                <Route
                  path="/"
                  element={<Navigate to="/dashboard" replace />}
                />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route
                  path="/contacts-group"
                  element={<Navigate to="/contacts" replace />}
                />
                <Route path="/contacts/*" element={<Contacts />} />
                <Route path="/campaigns" element={<Campaigns />} />
                {/* WP "Emails" section header target → its first child. */}
                <Route
                  path="/emails-group"
                  element={<Navigate to="/email-templates" replace />}
                />
                <Route path="/email-templates" element={<EmailTemplates />} />
                <Route
                  path="/email-templates/builder/:id"
                  element={<EmailTemplateBuilderPage />}
                />
                <Route path="/email-logs" element={<EmailLogs />} />
                <Route path="/automations" element={<Automations />} />
                <Route
                  path="/automations/builder/:id"
                  element={<AutomationBuilderPage />}
                />
                <Route path="/analytics/*" element={<Analytics />} />
                <Route path="/settings/*" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </Content>
        </Layout>
      </Content>
    </Layout>
  );
};

/**
 * Top-level gate: on a fresh install (or a resumed/skipped-but-still-running
 * wizard) the first-run setup wizard takes over the whole screen, hiding the CRM
 * chrome. Once finished — and not still running — the normal dashboard mounts.
 */
const AppWithSetupGate = () => {
  const { shouldShowWizard } = useSetupWizard();

  if (shouldShowWizard) {
    return (
      <ErrorBoundary>
        <SetupWizard />
      </ErrorBoundary>
    );
  }

  return <App />;
};

export default AppWithSetupGate;
