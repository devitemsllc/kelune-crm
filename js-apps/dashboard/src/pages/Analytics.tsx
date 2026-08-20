import React, { useEffect, useState } from 'react';
import { Tabs, DatePicker } from 'antd';
import type { RangePickerProps } from 'antd/es/date-picker';
import { Link, useLocation } from 'react-router-dom';
import dayjs from 'dayjs';
import { __ } from '@wordpress/i18n';
import { dateRangePresets } from '../utils/dateRangePresets';
import { useDispatch, useSelector } from '@store/hooks';
import { ListPageHeader } from '../components/common/list';
import {
  setRange,
  fetchOverview,
  fetchContactsAnalytics,
  fetchEmailsAnalytics,
  fetchCampaignsAnalytics,
} from '../store/slices/analyticsSlice';
import OverviewTab from '../components/analytics/OverviewTab';
import ContactsTab from '../components/analytics/ContactsTab';
import EmailsTab from '../components/analytics/EmailsTab';
import CampaignsTab from '../components/analytics/CampaignsTab';

const { RangePicker } = DatePicker;

// Tab key ⇄ sub-route segment (empty = /analytics landing).
const TAB_PATHS: Record<string, string> = {
  overview: '/analytics',
  contacts: '/analytics/contacts',
  emails: '/analytics/emails',
  campaigns: '/analytics/campaigns',
};

const Analytics: React.FC = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const range = useSelector((s) => s.analytics.range);
  const [activeTab, setActiveTab] = useState('overview');

  // Derive the active tab from the router sub-route (/analytics/<tab>).
  useEffect(() => {
    const sub = location.pathname.split('/')[2];
    setActiveTab(sub || 'overview');
  }, [location.pathname]);

  const handleRangeChange: RangePickerProps['onChange'] = (dates) => {
    if (!dates || !dates[0] || !dates[1]) {
      return;
    }
    dispatch(
      setRange({
        date_from: dates[0].format('YYYY-MM-DD'),
        date_to: dates[1].format('YYYY-MM-DD'),
      })
    );
  };

  const handleReload = () => {
    switch (activeTab) {
      case 'contacts':
        dispatch(fetchContactsAnalytics(range));
        break;
      case 'emails':
        dispatch(fetchEmailsAnalytics(range));
        break;
      case 'campaigns':
        dispatch(fetchCampaignsAnalytics(range));
        break;
      default:
        dispatch(fetchOverview());
    }
  };

  const tabLink = (key: string, label: string) => (
    <Link to={TAB_PATHS[key]} style={{ color: 'inherit' }}>
      {label}
    </Link>
  );

  return (
    <div>
      <ListPageHeader
        title={__('Analytics', 'kelune-crm')}
        marginBottom={12}
        onReload={handleReload}
        extra={
          activeTab !== 'overview' ? (
            <RangePicker
              allowClear={false}
              presets={dateRangePresets}
              value={[dayjs(range.date_from), dayjs(range.date_to)]}
              onChange={handleRangeChange}
            />
          ) : undefined
        }
      />

      <Tabs activeKey={activeTab} tabBarStyle={{ marginBottom: 24 }}>
        <Tabs.TabPane
          tab={tabLink('overview', __('Overview', 'kelune-crm'))}
          key="overview"
        >
          <OverviewTab />
        </Tabs.TabPane>
        <Tabs.TabPane
          tab={tabLink('contacts', __('Contacts', 'kelune-crm'))}
          key="contacts"
        >
          <ContactsTab />
        </Tabs.TabPane>
        <Tabs.TabPane
          tab={tabLink('emails', __('Emails', 'kelune-crm'))}
          key="emails"
        >
          <EmailsTab />
        </Tabs.TabPane>
        <Tabs.TabPane
          tab={tabLink('campaigns', __('Campaigns', 'kelune-crm'))}
          key="campaigns"
        >
          <CampaignsTab />
        </Tabs.TabPane>
      </Tabs>
    </div>
  );
};

export default Analytics;
