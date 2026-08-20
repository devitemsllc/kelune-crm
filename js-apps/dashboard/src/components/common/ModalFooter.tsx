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
  /** Buttons that sit between Cancel and the primary action (Previous, …). */
  secondary?: React.ReactNode;
  /** Button pushed to the far left, away from the main action group. */
  start?: React.ReactNode;
}

// Standard modal and drawer footer: Cancel first, then secondary actions, then
// the primary action last, all right-aligned. Real markup order (no CSS
// reordering).
const ModalFooter = ({
  onOk,
  onCancel,
  okText = __('OK', 'kelune-crm'),
  cancelText = __('Cancel', 'kelune-crm'),
  okButtonProps,
  cancelButtonProps,
  confirmLoading,
  secondary,
  start,
}: ModalFooterProps) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    }}
  >
    <div>{start}</div>
    <Space>
      {onCancel && (
        <Button onClick={onCancel} {...cancelButtonProps}>
          {cancelText}
        </Button>
      )}
      {secondary}
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
    </Space>
  </div>
);

export default ModalFooter;
