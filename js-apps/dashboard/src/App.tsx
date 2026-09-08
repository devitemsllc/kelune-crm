import React, { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Layout, Menu, theme, Flex, Drawer, Button, Typography } from 'antd';
import { __ } from '@wordpress/i18n';
import useScreens from './hooks/useScreens';
import { useSetupWizard } from './hooks/useSetupWizard';
import { useLicense } from './hooks/useLicense';
import { isProActive } from './hooks/useFeature';
import LicenseLoader from './components/license/LicenseLoader';
import BrandMark from './components/common/BrandMark';
import PageLoader from './components/common/PageLoader';
import ErrorBoundary from './components/common/ErrorBoundary';
import GlobalLoader from './components/common/GlobalLoader';
import RequireCapability from './components/common/RequireCapability';
import NoPermission from './components/common/NoPermission';
import { CAP, can, canAny, type Capability } from './utils/capabilities';
import {
  canViewDashboard,
  firstPermittedRoute,
  landingRoute,
} from './utils/landingRoute';
import { getContactTabs } from './config/contactTabs';
import {
  getSettingsSections,
  getSettingsMenuKeyFromPath,
  getSettingsSectionByPath,
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
  KeyOutlined,
} from '@ant-design/icons';

// Route-based code splitting: each page loads on first navigation.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Contacts = lazy(() => import('./pages/Contacts'));
const Campaigns = lazy(() => import('./pages/Campaigns'));
const CampaignBuilderPage = lazy(() => import('./pages/CampaignBuilderPage'));
const Automations = lazy(() => import('./pages/Automations'));
const AutomationBuilderPage = lazy(
  () => import('./pages/AutomationBuilderPage')
);
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const EmailTemplates = lazy(() => import('./pages/EmailTemplates'));
const EmailTemplateBuilderPage = lazy(
  () => import('./pages/EmailTemplateBuilderPage')
);
const EmailLogs = lazy(() => import('./pages/EmailLogs'));
const NotFound = lazy(() => import('./pages/NotFound'));
const SetupWizard = lazy(() => import('./pages/SetupWizard'));
const License = lazy(() => import('./pages/License'));

const { Header, Content } = Layout;

// The capability a nav row and its route need; a list means any one of them.
const NAV_CAPABILITIES: Record<string, Capability | Capability[]> = {
  dashboard: CAP.VIEW_ANALYTICS,
  'contacts-group': [
    CAP.VIEW_CONTACTS,
    CAP.VIEW_LISTS,
    CAP.VIEW_TAGS,
    CAP.VIEW_SEGMENTS,
  ],
  contacts: CAP.VIEW_CONTACTS,
  'contacts/lists': CAP.VIEW_LISTS,
  'contacts/tags': CAP.VIEW_TAGS,
  'contacts/segments': CAP.VIEW_SEGMENTS,
  campaigns: CAP.VIEW_CAMPAIGNS,
  automations: CAP.VIEW_AUTOMATIONS,
  'emails-group': [CAP.VIEW_EMAIL_TEMPLATES, CAP.VIEW_EMAIL_LOGS],
  'email-templates': CAP.VIEW_EMAIL_TEMPLATES,
  'email-logs': CAP.VIEW_EMAIL_LOGS,
  analytics: CAP.VIEW_ANALYTICS,
  settings: [
    CAP.MANAGE_SETTINGS,
    CAP.MANAGE_CUSTOM_FIELDS,
    CAP.MANAGE_EMAIL_PROVIDERS,
    CAP.MANAGE_WEBHOOKS,
    CAP.MANAGE_ROLES,
    CAP.VIEW_SMART_LINKS,
  ],
  license: CAP.MANAGE_SETTINGS,
};

// A section header routes to the first child the user may open.
const firstAllowedPath = (
  children: Array<[Capability, string]>,
  fallback: string
): string => children.find(([capability]) => can(capability))?.[1] ?? fallback;

// A settings sub-route is gated by its own section, not the page's any-of list.
const settingsRouteAllowed = (pathname: string): boolean => {
  const section = getSettingsSectionByPath(pathname);

  return section !== null && can(section.capability);
};

const navAllowed = (key: string): boolean => {
  const required = NAV_CAPABILITIES[key];

  if (!required) {
    return true;
  }

  return canAny(Array.isArray(required) ? required : [required]);
};

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
  // The License page brings its own centred card, so the shell only supplies
  // outer spacing (its background is dropped below).
  license: {
    large: { margin: 16, padding: 8 },
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

// Prefix route match: a submenu stays active for its own route and any nested
// sub-route (e.g. /contacts -> /contacts/lists).
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

// The dashboard is an analytics report: a role without that capability lands on
// its first permitted page instead. The notice remains when it may open nothing.
const DashboardRoute = () => {
  if (canViewDashboard()) {
    return <Dashboard />;
  }

  const fallback = firstPermittedRoute();

  return fallback ? <Navigate to={fallback} replace /> : <NoPermission />;
};

const App = () => {
  const location = useLocation();
  // Active top-level page = first path segment (e.g. 'contacts' from '/contacts/lists').
  const currentPage = location.pathname.split('/')[1] || 'dashboard';
  const {
    token: { colorBgContainer, colorPrimary },
  } = theme.useToken();
  const { xs, sm, md, lg, wps } = useScreens();
  const { isLicenseBlocked } = useLicense();

  // While Pro is unlicensed every route resolves to the license page, so the
  // shell must lay itself out for that page regardless of the URL.
  const licenseBlocked = isLicenseBlocked();
  const onLicensePage = licenseBlocked || currentPage === 'license';

  // Contacts trims its top padding for the tab bar; one tab means no bar.
  const spacingPage = onLicensePage
    ? 'license'
    : currentPage === 'contacts' && getContactTabs().length <= 1
      ? 'default'
      : currentPage;
  const spacing = getRouteSpacing(spacingPage, wps);

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

  // Contacts keeps its sub-route so the right child highlights; every other
  // page is keyed by the first path segment.
  const parts = location.pathname.split('/').filter(Boolean);
  const selectedKey =
    parts[0] === 'contacts'
      ? parts[1]
        ? `contacts/${parts[1]}`
        : 'contacts'
      : parts[0] || 'dashboard';

  // A route the role cannot open, or that names no page, highlights nothing.
  const currentRouteAllowed =
    parts[0] === 'settings'
      ? settingsRouteAllowed(location.pathname)
      : selectedKey in NAV_CAPABILITIES && navAllowed(selectedKey);

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

      // Submenu href: '#/campaigns' -> '/campaigns'. The first item has no hash;
      // map it to the route a hash-less load settles on.
      const hashPart = anchor.href.split('#')[1];
      const hrefPath = hashPart ?? landingRoute();

      li.classList.remove('current');
      anchor.classList.remove('current');

      if (currentRouteAllowed && routeMatched(path, hrefPath)) {
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
  }, [location.pathname, currentRouteAllowed]);

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
        {
          key: 'contacts/segments',
          label: navLink(
            '/contacts/segments',
            <ApartmentOutlined />,
            __('Segments', 'kelune-crm')
          ),
        },
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
    // The license belongs to the Pro add-on — no Pro, nothing to activate.
    ...(isProActive()
      ? [
          {
            key: 'license',
            label: navLink(
              '/license',
              <KeyOutlined />,
              __('License', 'kelune-crm')
            ),
          },
        ]
      : []),
  ];

  // Rows the user holds no capability for never render, header or drawer.
  const visibleMenuItems = menuItems
    .filter((item) => navAllowed(item.key))
    .map((item) =>
      'children' in item && item.children
        ? {
            ...item,
            children: item.children.filter((child) => navAllowed(child.key)),
          }
        : item
    );

  // Drawer nav: the same items, but on stage 2 (<768px) the "Settings" leaf
  // becomes an expandable submenu holding the Settings page's own sections.
  const settingsChildren = getSettingsSections().map(
    ({ key, icon, text, route }) => ({
      key,
      label: navLink(settingsSectionPath(route), icon, text),
    })
  );

  const settingsNested = settingsInDrawer && settingsChildren.length > 1;

  const drawerMenuItems = visibleMenuItems.map((item) =>
    item.key === 'settings' && settingsNested
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
  const activeKey = currentRouteAllowed ? selectedKey : '';

  const drawerSelectedKey =
    settingsNested && parts[0] === 'settings' && currentRouteAllowed
      ? getSettingsMenuKeyFromPath(location.pathname)
      : activeKey;

  // Keep the relevant inline submenu(s) open to reflect the current route.
  useEffect(() => {
    const seg = location.pathname.split('/').filter(Boolean)[0];
    const keys: string[] = [];
    if (seg === 'contacts') keys.push('contacts-group');
    if (seg === 'email-templates' || seg === 'email-logs') {
      keys.push('emails-group');
    }
    if (settingsNested && seg === 'settings') keys.push('settings');
    setDrawerOpenKeys(keys);
  }, [location.pathname, settingsNested]);

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
              selectedKeys={[activeKey]}
              items={visibleMenuItems}
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
              background: onLicensePage ? 'transparent' : colorBgContainer,
              borderRadius: 8,
            }}
          >
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                {licenseBlocked ? (
                  // Pro is active but unlicensed: the license page is the only
                  // reachable route until a valid key is entered.
                  <Routes>
                    <Route path="/license" element={<License />} />
                    <Route
                      path="*"
                      element={<Navigate to="/license" replace />}
                    />
                  </Routes>
                ) : (
                  <Routes>
                    <Route
                      path="/"
                      element={<Navigate to="/dashboard" replace />}
                    />
                    <Route path="/dashboard" element={<DashboardRoute />} />
                    <Route
                      path="/contacts-group"
                      element={
                        <Navigate
                          to={firstAllowedPath(
                            [
                              [CAP.VIEW_CONTACTS, '/contacts'],
                              [CAP.VIEW_LISTS, '/contacts/lists'],
                              [CAP.VIEW_TAGS, '/contacts/tags'],
                              [CAP.VIEW_SEGMENTS, '/contacts/segments'],
                            ],
                            '/contacts'
                          )}
                          replace
                        />
                      }
                    />
                    <Route
                      path="/contacts/*"
                      element={
                        <RequireCapability
                          capability={[
                            CAP.VIEW_CONTACTS,
                            CAP.VIEW_LISTS,
                            CAP.VIEW_TAGS,
                            CAP.VIEW_SEGMENTS,
                          ]}
                        >
                          <Contacts />
                        </RequireCapability>
                      }
                    />
                    <Route
                      path="/campaigns"
                      element={
                        <RequireCapability capability={CAP.VIEW_CAMPAIGNS}>
                          <Campaigns />
                        </RequireCapability>
                      }
                    />
                    <Route
                      path="/campaigns/builder/:id"
                      element={
                        <RequireCapability capability={CAP.EDIT_CAMPAIGNS}>
                          <CampaignBuilderPage />
                        </RequireCapability>
                      }
                    />
                    {/* WP "Emails" section header target → its first child. */}
                    <Route
                      path="/emails-group"
                      element={
                        <Navigate
                          to={firstAllowedPath(
                            [
                              [CAP.VIEW_EMAIL_TEMPLATES, '/email-templates'],
                              [CAP.VIEW_EMAIL_LOGS, '/email-logs'],
                            ],
                            '/email-templates'
                          )}
                          replace
                        />
                      }
                    />
                    <Route
                      path="/email-templates"
                      element={
                        <RequireCapability
                          capability={CAP.VIEW_EMAIL_TEMPLATES}
                        >
                          <EmailTemplates />
                        </RequireCapability>
                      }
                    />
                    <Route
                      path="/email-templates/builder/:id"
                      element={
                        <RequireCapability
                          capability={CAP.EDIT_EMAIL_TEMPLATES}
                        >
                          <EmailTemplateBuilderPage />
                        </RequireCapability>
                      }
                    />
                    <Route
                      path="/email-logs"
                      element={
                        <RequireCapability capability={CAP.VIEW_EMAIL_LOGS}>
                          <EmailLogs />
                        </RequireCapability>
                      }
                    />
                    <Route
                      path="/automations"
                      element={
                        <RequireCapability capability={CAP.VIEW_AUTOMATIONS}>
                          <Automations />
                        </RequireCapability>
                      }
                    />
                    <Route
                      path="/automations/builder/:id"
                      element={
                        <RequireCapability capability={CAP.EDIT_AUTOMATIONS}>
                          <AutomationBuilderPage />
                        </RequireCapability>
                      }
                    />
                    <Route
                      path="/analytics/*"
                      element={
                        <RequireCapability capability={CAP.VIEW_ANALYTICS}>
                          <Analytics />
                        </RequireCapability>
                      }
                    />
                    <Route
                      path="/settings/*"
                      element={
                        <RequireCapability
                          capability={[
                            CAP.MANAGE_SETTINGS,
                            CAP.MANAGE_CUSTOM_FIELDS,
                            CAP.MANAGE_EMAIL_PROVIDERS,
                            CAP.MANAGE_WEBHOOKS,
                            CAP.MANAGE_ROLES,
                            CAP.VIEW_SMART_LINKS,
                          ]}
                        >
                          <Settings />
                        </RequireCapability>
                      }
                    />
                    {/* Without Pro there is nothing to license, so a bookmarked
                        or stale #/license goes home rather than to Not Found. */}
                    <Route
                      path="/license"
                      element={
                        isProActive() ? (
                          <RequireCapability capability={CAP.MANAGE_SETTINGS}>
                            <License />
                          </RequireCapability>
                        ) : (
                          <Navigate to="/dashboard" replace />
                        )
                      }
                    />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                )}
              </Suspense>
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
        <Suspense fallback={<PageLoader />}>
          <SetupWizard />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return <App />;
};

/**
 * The license is resolved before anything renders, so both gates below it — the
 * setup wizard's license step and the dashboard's license lock — decide on a
 * settled answer rather than flashing the wrong screen first.
 */
const Root = () => (
  <LicenseLoader>
    <AppWithSetupGate />
  </LicenseLoader>
);

export default Root;
