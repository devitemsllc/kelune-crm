import React from 'react';
import {
  MailOutlined,
  TagOutlined,
  TagsOutlined,
  UnorderedListOutlined,
  MinusCircleOutlined,
  EditOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { __ } from '@wordpress/i18n';

export interface ActionTypeOption {
  value: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  /** Executed by the Pro add-on's AdvancedActionProcessor. */
  pro?: boolean;
}
/**
 * Every action an automation step can run.
 *
 * `update_field` and `webhook` are executed by the Pro add-on
 * (AdvancedActionProcessor, registered onto `kelune_crm_automation_processors`)
 * — in Free they are offered but locked, rather than silently accepted and never
 * executed at run time.
 */
export const ACTION_TYPES: ActionTypeOption[] = [
  {
    value: 'send_email',
    title: __('Send Email', 'kelune-crm'),
    description: __(
      'Send a custom email to the contact in this automation.',
      'kelune-crm'
    ),
    icon: <MailOutlined />,
  },
  {
    value: 'add_list',
    title: __('Add to Lists', 'kelune-crm'),
    description: __(
      'Subscribe the contact to one or more lists.',
      'kelune-crm'
    ),
    icon: <UnorderedListOutlined />,
  },
  {
    value: 'remove_list',
    title: __('Remove from Lists', 'kelune-crm'),
    description: __(
      'Unsubscribe the contact from one or more lists.',
      'kelune-crm'
    ),
    icon: <MinusCircleOutlined />,
  },
  {
    value: 'add_tag',
    title: __('Add Tags', 'kelune-crm'),
    description: __('Apply one or more tags to the contact.', 'kelune-crm'),
    icon: <TagOutlined />,
  },
  {
    value: 'remove_tag',
    title: __('Remove Tags', 'kelune-crm'),
    description: __('Take one or more tags off the contact.', 'kelune-crm'),
    icon: <TagsOutlined />,
  },
  {
    value: 'update_field',
    title: __('Update Field', 'kelune-crm'),
    description: __(
      'Set a contact field or custom field to a value.',
      'kelune-crm'
    ),
    icon: <EditOutlined />,
    pro: true,
  },
  {
    value: 'webhook',
    title: __('Trigger Webhook', 'kelune-crm'),
    description: __(
      "Send the contact's data to an external URL.",
      'kelune-crm'
    ),
    icon: <ApiOutlined />,
    pro: true,
  },
];

export const findActionType = (value?: string): ActionTypeOption | undefined =>
  ACTION_TYPES.find((a) => a.value === value);
