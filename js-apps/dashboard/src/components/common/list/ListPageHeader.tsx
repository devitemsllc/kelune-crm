import React from 'react';
import { Space, Button, Dropdown, Tooltip, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { PlusOutlined, ReloadOutlined, MoreOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';

const { Title } = Typography;

interface PrimaryAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

interface ListPageHeaderProps {
  /** Page title, e.g. "Contacts". */
  title: string;
  /** The single filled primary action, e.g. "Add Contact". */
  primaryAction?: PrimaryAction;
  /** Reload button handler; omit to hide the button. */
  onReload?: () => void;
  /** Items for the icon-only "More" menu (Export, Import, …). */
  moreItems?: MenuProps['items'];
  /** Extra controls rendered before the More/Reload/primary cluster. */
  extra?: React.ReactNode;
  /** Bottom margin below the header. Defaults to 24. */
  marginBottom?: number;
}

const ListPageHeader = ({
  title,
  primaryAction,
  onReload,
  moreItems,
  extra,
  marginBottom = 24,
}: ListPageHeaderProps) => (
  // Flex-wrap (not Row/Col) so title and actions keep a vertical `gap` when they
  // wrap onto separate lines on narrow screens — Row wrapping leaves them glued.
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom,
    }}
  >
    <Title level={3} style={{ margin: 0 }}>
      {title}
    </Title>
    <Space wrap>
      {extra}
      {moreItems && moreItems.length > 0 && (
        <Dropdown trigger={['click']} menu={{ items: moreItems }}>
          <Tooltip title={__('More', 'kelune-crm')}>
            <Button icon={<MoreOutlined />} />
          </Tooltip>
        </Dropdown>
      )}
      {onReload && (
        <Tooltip title={__('Reload', 'kelune-crm')}>
          <Button icon={<ReloadOutlined />} onClick={onReload} />
        </Tooltip>
      )}
      {primaryAction && (
        <Button
          type="primary"
          icon={primaryAction.icon ?? <PlusOutlined />}
          onClick={primaryAction.onClick}
        >
          {primaryAction.label}
        </Button>
      )}
    </Space>
  </div>
);

export default ListPageHeader;
