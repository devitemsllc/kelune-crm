import React, { useState } from 'react';
import { Card, Row, Col, Select, Button, Space, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import ActionConfirm from './ActionConfirm';
import type { ConfirmAction } from './ActionConfirm';

const { Text } = Typography;

interface BulkActionSecondary {
  /** Placeholder shown in the dependent select. */
  placeholder?: string;
  /** Pass 'multiple' to allow selecting several values. */
  mode?: 'multiple';
  /** Options for the dependent select. */
  options: { value: string | number; label: string }[];
}

interface BulkAction {
  value: string;
  label: string;
  /** When set, a second select appears and Confirm waits for a value. */
  secondary?: BulkActionSecondary;
  /** Styles Confirm as a danger button (e.g. Delete). */
  danger?: boolean;
  /** When set, Confirm asks for an inline Popconfirm before firing. */
  confirm?: ConfirmAction;
}

export type BulkActionValue = string | number | (string | number)[] | undefined;

interface BulkActionsBarProps {
  /** Number of selected rows. The bar hides itself when 0. */
  selectedCount: number;
  /** Primary actions shown in the "Bulk Actions" select. */
  actions: BulkAction[];
  /** Fired on Confirm with the chosen action and its dependent value. */
  onConfirm: (action: string, value: BulkActionValue) => void;
  /** Clears the current selection. */
  onClear: () => void;
  /** Disables Confirm while a bulk request is in flight. */
  loading?: boolean;
}

const isValuePresent = (value: BulkActionValue): boolean =>
  Array.isArray(value)
    ? value.length > 0
    : value !== undefined && value !== null && value !== '';

/**
 * Bulk-action bar shown between the filter card and the table when rows are
 * selected. Left column holds the "Bulk Actions" select (plus a dependent
 * select and Confirm); the right column holds the selection count and Clear.
 */
const BulkActionsBar = ({
  selectedCount,
  actions,
  onConfirm,
  onClear,
  loading = false,
}: BulkActionsBarProps) => {
  const [action, setAction] = useState<string | undefined>(undefined);
  const [value, setValue] = useState<BulkActionValue>(undefined);

  if (selectedCount <= 0) {
    return null;
  }

  const activeAction = actions.find((a) => a.value === action);
  const needsValue = Boolean(activeAction?.secondary);
  const canConfirm = Boolean(action) && (!needsValue || isValuePresent(value));

  const reset = () => {
    setAction(undefined);
    setValue(undefined);
  };

  const handleActionChange = (next: string) => {
    setAction(next);
    setValue(undefined);
  };

  const handleConfirm = () => {
    if (!action || !canConfirm) {
      return;
    }
    onConfirm(action, value);
    reset();
  };

  const handleClear = () => {
    reset();
    onClear();
  };

  const confirmButton = (
    <Button
      type="primary"
      disabled={!canConfirm}
      loading={loading}
      danger={activeAction?.danger}
      onClick={activeAction?.confirm ? undefined : handleConfirm}
    >
      {__('Confirm', 'kelune-crm')}
    </Button>
  );

  return (
    <Card
      style={{
        marginBottom: 16,
        background: '#e6f7ff',
        border: '1px solid #91d5ff',
        boxShadow: 'none',
      }}
      bodyStyle={{ padding: '12px 16px' }}
    >
      <Row align="middle" justify="space-between" gutter={[8, 8]}>
        <Col>
          <Space size={8} wrap>
            <Select
              placeholder={__('Bulk Actions', 'kelune-crm')}
              value={action ?? null}
              onChange={handleActionChange}
              style={{ minWidth: 150 }}
              options={actions.map((a) => ({ value: a.value, label: a.label }))}
            />
            {activeAction?.secondary && (
              <Select
                mode={activeAction.secondary.mode}
                placeholder={
                  activeAction.secondary.placeholder ??
                  __('Select', 'kelune-crm')
                }
                value={value as never}
                onChange={(next) => setValue(next)}
                options={activeAction.secondary.options}
                maxTagCount="responsive"
                style={{ minWidth: 180 }}
              />
            )}
            {activeAction?.confirm ? (
              <ActionConfirm
                action={activeAction.confirm}
                onConfirm={handleConfirm}
                disabled={!canConfirm}
              >
                {confirmButton}
              </ActionConfirm>
            ) : (
              confirmButton
            )}
          </Space>
        </Col>
        <Col>
          <Space size={12}>
            <Text style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
              {sprintf(
                /* translators: %d: number of selected rows. */
                __('%d selected', 'kelune-crm'),
                selectedCount
              )}
            </Text>
            <Button
              color="default"
              variant="filled"
              icon={<CloseOutlined />}
              onClick={handleClear}
              aria-label={__('Clear selection', 'kelune-crm')}
            />
          </Space>
        </Col>
      </Row>
    </Card>
  );
};

export default BulkActionsBar;
