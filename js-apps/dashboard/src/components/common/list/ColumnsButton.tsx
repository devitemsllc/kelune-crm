import React from 'react';
import { Dropdown, Button } from 'antd';
import { LayoutOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import ColumnSettings from '../ColumnSettings';
import type { ColumnOption } from './listTypes';

interface ColumnsButtonProps {
  /** Current visibility map, keyed by column key. */
  visible: Record<string, boolean>;
  onChange: (visible: Record<string, boolean>) => void;
  /** Toggleable columns (fixed columns like Contact/Actions are omitted). */
  options: ColumnOption[];
  /** Restores the page's default column visibility. */
  onReset: () => void;
}

/**
 * The "Columns" dropdown: a scrollable checkbox list of toggleable columns with
 * a Reset Columns footer. Wraps the shared ColumnSettings in `simple` mode.
 */
const ColumnsButton = ({
  visible,
  onChange,
  options,
  onReset,
}: ColumnsButtonProps) => (
  <Dropdown
    arrow
    trigger={['click']}
    dropdownRender={() => (
      <div
        style={{
          background: '#fff',
          padding: '12px 0',
          borderRadius: 8,
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.12)',
          width: 220,
        }}
      >
        <div style={{ maxHeight: 252, overflowY: 'auto', padding: '0 12px' }}>
          <ColumnSettings
            simple
            visible={visible}
            onChange={onChange}
            options={options}
          />
        </div>
        <div
          style={{
            padding: '12px 12px 0',
            marginTop: 12,
            borderTop: '1px solid #f0f0f0',
          }}
        >
          <Button block size="small" onClick={onReset}>
            {__('Reset Columns', 'kelune-crm')}
          </Button>
        </div>
      </div>
    )}
  >
    <Button icon={<LayoutOutlined />}>{__('Columns', 'kelune-crm')}</Button>
  </Dropdown>
);

export default ColumnsButton;
