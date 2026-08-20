import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { ConfigProvider, message } from 'antd';
import type { Locale } from 'antd/es/locale';
import type { ThemeConfig } from 'antd';
import { HashRouter } from 'react-router-dom';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import weekday from 'dayjs/plugin/weekday';
import localeData from 'dayjs/plugin/localeData';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import weekYear from 'dayjs/plugin/weekYear';
import dayOfYear from 'dayjs/plugin/dayOfYear';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import { store } from './store';
import { loadLocale } from '@utils/locale';
import App from './App';
import './styles/base.css';
import './styles/main.css';

// dayjs plugins required by Ant Design DatePicker.
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.extend(advancedFormat);
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(weekOfYear);
dayjs.extend(weekYear);
dayjs.extend(dayOfYear);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

// Ant Design theme configuration - structural tokens only (stock Ant colors)
const theme: ThemeConfig = {
  token: {
    // ===== Z-Index Configuration =====
    zIndexPopupBase: 100000,

    borderRadius: 6,
    borderRadiusLG: 8,
    borderRadiusSM: 4,
    borderRadiusXS: 2,

    // ===== Typography =====
    fontSize: 14,
    fontSizeLG: 16,
    fontSizeSM: 12,
    fontSizeHeading1: 32,
    fontSizeHeading2: 24,
    fontSizeHeading3: 20,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,

    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
    fontWeightStrong: 600,

    lineHeight: 1.5714,
    lineHeightLG: 1.5,
    lineHeightSM: 1.66,

    // ===== Spacing =====
    padding: 16,
    paddingLG: 24,
    paddingSM: 12,
    paddingXS: 8,
    paddingXXS: 4,

    margin: 16,
    marginLG: 24,
    marginSM: 12,
    marginXS: 8,
    marginXXS: 4,

    // ===== Motion =====
    motionDurationSlow: '0.3s',
    motionDurationMid: '0.2s',
    motionDurationFast: '0.1s',
  },

  // ===== Component-specific tokens (structural only) =====
  components: {
    Modal: {
      headerMarginBottom: 20,
      titleFontSize: 16,
    } as NonNullable<ThemeConfig['components']>['Modal'],
    Message: {
      zIndexPopup: 200100,
    },
  },
};

// Offset toast messages below the WordPress admin bar (32px) so they never
// overlap it. Static `message.*` calls share this global config app-wide.
message.config({ top: 32 });

function renderApp(locale: Locale | undefined): void {
  const rootElement = document.getElementById('kelune-crm-dashboard');

  if (!rootElement) {
    return;
  }

  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <React.StrictMode>
      <Provider store={store}>
        <ConfigProvider
          prefixCls="kelune-crm-ant"
          theme={theme}
          locale={locale}
        >
          <HashRouter>
            <App />
          </HashRouter>
        </ConfigProvider>
      </Provider>
    </React.StrictMode>
  );
}

document.addEventListener('DOMContentLoaded', () => {
  // Load the Ant Design + dayjs locale for the WordPress site locale, then
  // render. Failure to resolve a pack falls back to the English defaults, so a
  // rejected promise must never block the app from mounting.
  loadLocale()
    .then(renderApp)
    .catch(() => renderApp(undefined));
});
