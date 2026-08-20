import React from 'react';
import { Tag } from 'antd';
import { CrownOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';

/**
 * Crown chip marking a control only the Pro add-on unlocks. The icon sits in the
 * children rather than the `icon` prop, whose 7px gap is oversized at this font.
 */
export const ProTag = () => (
  <Tag
    color="gold"
    style={{
      marginInlineEnd: 0,
      fontSize: 11,
      lineHeight: '18px',
      paddingInline: 6,
    }}
  >
    <span
      style={{ display: 'inline-flex', alignItems: 'center', columnGap: 4 }}
    >
      <CrownOutlined />
      {__('Pro', 'kelune-crm')}
    </span>
  </Tag>
);

export default ProTag;
