import React from 'react';
import { Popconfirm } from 'antd';
import type { PopconfirmProps } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';

export type ConfirmAction =
  | 'delete'
  | 'activate'
  | 'deactivate'
  | 'restore'
  | 'duplicate'
  | 'archive';

interface ConfirmPreset {
  title: string;
  description: string;
  color: string;
}

const PRESETS: Record<ConfirmAction, ConfirmPreset> = {
  delete: {
    title: __('Delete', 'kelune-crm'),
    description: __('Are you sure you want to delete?', 'kelune-crm'),
    color: '#ff4d4f',
  },
  activate: {
    title: __('Activate', 'kelune-crm'),
    description: __('Are you sure you want to activate?', 'kelune-crm'),
    color: '#faad14',
  },
  deactivate: {
    title: __('Deactivate', 'kelune-crm'),
    description: __('Are you sure you want to deactivate?', 'kelune-crm'),
    color: '#faad14',
  },
  restore: {
    title: __('Restore', 'kelune-crm'),
    description: __('Are you sure you want to restore?', 'kelune-crm'),
    color: '#faad14',
  },
  duplicate: {
    title: __('Duplicate', 'kelune-crm'),
    description: __('Are you sure you want to duplicate?', 'kelune-crm'),
    color: '#faad14',
  },
  archive: {
    title: __('Archive', 'kelune-crm'),
    description: __('Are you sure you want to archive?', 'kelune-crm'),
    color: '#faad14',
  },
};

interface ActionConfirmProps extends Omit<PopconfirmProps, 'title'> {
  /** Preset that fills in the title, description and icon color. */
  action: ConfirmAction;
  /** Overrides the preset description when set. */
  customDescription?: string;
  children: React.ReactNode;
}

/**
 * Wraps a trigger in a Popconfirm preconfigured per action type. Mirrors the
 * support-genix ActionConfirm: lightweight inline confirmation for low-risk,
 * confirmation-only bulk/row actions (delete, activate, deactivate, …).
 */
const ActionConfirm = ({
  action,
  customDescription,
  children,
  ...rest
}: ActionConfirmProps) => {
  const info = PRESETS[action];

  return (
    <Popconfirm
      okText={__('Yes', 'kelune-crm')}
      cancelText={__('No', 'kelune-crm')}
      {...rest}
      title={info.title}
      description={customDescription ?? info.description}
      icon={<InfoCircleOutlined style={{ color: info.color }} />}
      overlayStyle={{ maxWidth: 300 }}
    >
      {children}
    </Popconfirm>
  );
};

export default ActionConfirm;
