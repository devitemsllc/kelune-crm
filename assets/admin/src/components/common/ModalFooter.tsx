import React from 'react';
import { Button, Space } from 'antd';
import type { ButtonProps } from 'antd';
import { __ } from '@wordpress/i18n';

interface ModalFooterProps {
  onOk?: () => void;
  onCancel?: () => void;
  okText?: string;
  cancelText?: string;
  okButtonProps?: ButtonProps;
  cancelButtonProps?: ButtonProps;
  confirmLoading?: boolean;
  extra?: React.ReactNode;
}

// Standard modal footer: primary action first, then secondary actions, all
// left-aligned. Real markup order (no CSS reordering). Pass `extra` for any
// additional buttons that should sit after Cancel.
const ModalFooter = ({
  onOk,
  onCancel,
  okText = __('OK', 'kelune-crm'),
  cancelText = __('Cancel', 'kelune-crm'),
  okButtonProps,
  cancelButtonProps,
  confirmLoading,
  extra,
}: ModalFooterProps) => (
  <div style={{ textAlign: 'left' }}>
    <Space>
      {onOk && (
        <Button
          type="primary"
          onClick={onOk}
          loading={confirmLoading}
          {...okButtonProps}
        >
          {okText}
        </Button>
      )}
      {onCancel && (
        <Button onClick={onCancel} {...cancelButtonProps}>
          {cancelText}
        </Button>
      )}
      {extra}
    </Space>
  </div>
);

export default ModalFooter;
