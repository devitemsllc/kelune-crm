import React from 'react';
import { __ } from '@wordpress/i18n';
import {
  TeamOutlined,
  UnorderedListOutlined,
  TagsOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';
import { CAP, can, type Capability } from '../utils/capabilities';

// Single source of truth for the contact sub-pages, in tab order. Consumed by
// the Contacts page's tab bar and by the app shell's per-route spacing.
export interface ContactTab {
  key: string;
  path: string;
  icon: React.ReactNode;
  /** A function so `__()` resolves at render time, once i18n is ready. */
  label: () => string;
  capability: Capability;
}

export const getContactTabs = (): ContactTab[] =>
  allContactTabs().filter(({ capability }) => can(capability));

/** Every tab, capability aside. */
export const allContactTabs = (): ContactTab[] => [
  {
    key: 'contacts',
    path: '/contacts',
    icon: <TeamOutlined />,
    label: () => __('All Contacts', 'kelune-crm'),
    capability: CAP.VIEW_CONTACTS,
  },
  {
    key: 'lists',
    path: '/contacts/lists',
    icon: <UnorderedListOutlined />,
    label: () => __('Lists', 'kelune-crm'),
    capability: CAP.VIEW_LISTS,
  },
  {
    key: 'tags',
    path: '/contacts/tags',
    icon: <TagsOutlined />,
    label: () => __('Tags', 'kelune-crm'),
    capability: CAP.VIEW_TAGS,
  },
  {
    key: 'segments',
    path: '/contacts/segments',
    icon: <ApartmentOutlined />,
    label: () => __('Segments', 'kelune-crm'),
    capability: CAP.VIEW_SEGMENTS,
  },
];
