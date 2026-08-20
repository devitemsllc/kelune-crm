import React from 'react';
import { Typography } from 'antd';

const { Title } = Typography;

interface SettingsSectionTitleProps {
  name: string;
  action?: React.ReactNode;
}

// Title row for a settings section — mirrors the Campaigns page header
// (level-3 title, optional right-aligned action, 24px gap below). Flex-wrap so
// title and action keep a vertical gap when they stack on narrow screens.
const SettingsSectionTitle = ({ name, action }: SettingsSectionTitleProps) => (
  <div
    style={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 24,
    }}
  >
    <Title level={3} style={{ margin: 0 }}>
      {name}
    </Title>
    {action}
  </div>
);

export default SettingsSectionTitle;
