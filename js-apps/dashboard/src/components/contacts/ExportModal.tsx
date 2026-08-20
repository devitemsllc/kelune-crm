import React, { useMemo, useState } from 'react';
import {
  Modal,
  Card,
  Checkbox,
  Row,
  Col,
  InputNumber,
  Divider,
  Typography,
  message,
} from 'antd';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../../store/slices/globalLoadingSlice';
import ModalFooter from '../common/ModalFooter';
import api from '../../services/api';
import type { ID } from '@/types/models';

const { Text } = Typography;

interface ExportFilters {
  search: string;
  status: string;
  tags: ID[];
  lists: ID[];
}

interface ExportModalProps {
  visible: boolean;
  onClose: () => void;
  filters: ExportFilters;
  total: number;
}

// Must mirror the backend's exportableColumns() keys/order exactly.
const EXPORT_COLUMNS: { value: string; label: string }[] = [
  { value: 'email', label: __('Email', 'kelune-crm') },
  { value: 'first_name', label: __('First Name', 'kelune-crm') },
  { value: 'last_name', label: __('Last Name', 'kelune-crm') },
  { value: 'company', label: __('Company', 'kelune-crm') },
  { value: 'phone', label: __('Phone', 'kelune-crm') },
  { value: 'address_line1', label: __('Address Line 1', 'kelune-crm') },
  { value: 'address_line2', label: __('Address Line 2', 'kelune-crm') },
  { value: 'city', label: __('City', 'kelune-crm') },
  { value: 'state', label: __('State/Province', 'kelune-crm') },
  { value: 'postal_code', label: __('Postal Code', 'kelune-crm') },
  { value: 'country', label: __('Country', 'kelune-crm') },
  { value: 'status', label: __('Status', 'kelune-crm') },
  { value: 'source', label: __('Source', 'kelune-crm') },
  { value: 'lead_score', label: __('Lead Score', 'kelune-crm') },
  { value: 'lists', label: __('Lists', 'kelune-crm') },
  { value: 'tags', label: __('Tags', 'kelune-crm') },
  { value: 'created_at', label: __('Created At', 'kelune-crm') },
];

const ALL_KEYS = EXPORT_COLUMNS.map((c) => c.value);
const DEFAULT_KEYS = ['email', 'first_name', 'last_name'];

const ExportModal = ({
  visible,
  onClose,
  filters,
  total,
}: ExportModalProps) => {
  const dispatch = useDispatch();
  const [selected, setSelected] = useState<string[]>(DEFAULT_KEYS);
  const [limit, setLimit] = useState<number | null>(null);
  const [offset, setOffset] = useState<number | null>(0);
  const [exporting, setExporting] = useState(false);

  const allChecked = selected.length === ALL_KEYS.length;
  const indeterminate = selected.length > 0 && !allChecked;

  // Keep the canonical column order regardless of click order.
  const orderedSelected = useMemo(
    () => ALL_KEYS.filter((key) => selected.includes(key)),
    [selected]
  );

  // Restore defaults after the modal closes so the next open is clean.
  const resetState = () => {
    setSelected(DEFAULT_KEYS);
    setLimit(null);
    setOffset(0);
  };

  const handleExport = async () => {
    if (orderedSelected.length === 0) {
      message.error(__('Select at least one column', 'kelune-crm'));
      return;
    }

    const params: Record<string, unknown> = {
      columns: orderedSelected.join(','),
    };
    if (filters.search) params.search = filters.search;
    if (filters.status) params.status = filters.status;
    if (filters.tags.length) params.tags = filters.tags.join(',');
    if (filters.lists.length) params.lists = filters.lists.join(',');
    if (limit && limit > 0) params.limit = limit;
    if (offset && offset > 0) params.offset = offset;

    setExporting(true);
    dispatch(startGlobalLoading());
    try {
      const response = await api.contacts.export(params);
      const blob =
        response.data instanceof Blob
          ? response.data
          : new Blob([String(response.data)], { type: 'text/csv' });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const timestamp = Math.floor(now.getTime() / 1000);
      link.download = `contacts-${date}-${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      message.success(__('Contacts exported successfully', 'kelune-crm'));
      onClose();
    } catch (error) {
      message.error(__('Failed to export contacts', 'kelune-crm'));
    } finally {
      setExporting(false);
      dispatch(stopGlobalLoading());
    }
  };

  return (
    <Modal
      destroyOnHidden
      centered
      title={__('Export Contacts', 'kelune-crm')}
      open={visible}
      onCancel={onClose}
      afterClose={resetState}
      width={560}
      footer={
        <ModalFooter
          onOk={handleExport}
          okText={__('Export', 'kelune-crm')}
          confirmLoading={exporting}
          onCancel={onClose}
        />
      }
    >
      <Text type="secondary">
        {sprintf(
          // translators: %d: number of contacts matching the filters
          _n(
            '%d contact matches the current filters. Choose the columns and range to export.',
            '%d contacts match the current filters. Choose the columns and range to export.',
            total,
            'kelune-crm'
          ),
          total
        )}
      </Text>

      <Card
        size="small"
        title={__('Columns', 'kelune-crm')}
        extra={
          <Checkbox
            indeterminate={indeterminate}
            checked={allChecked}
            onChange={(e) => setSelected(e.target.checked ? [...ALL_KEYS] : [])}
          >
            {__('Select all', 'kelune-crm')}
          </Checkbox>
        }
        bodyStyle={{ padding: 12 }}
        style={{ marginTop: 16 }}
      >
        <Checkbox.Group
          value={selected}
          onChange={(vals: string[]) => setSelected(vals)}
          style={{ width: '100%' }}
        >
          <Row gutter={[8, 8]}>
            {EXPORT_COLUMNS.map((col) => (
              <Col span={8} key={col.value}>
                <Checkbox value={col.value}>{col.label}</Checkbox>
              </Col>
            ))}
          </Row>
        </Checkbox.Group>
      </Card>

      <Divider
        orientation="left"
        orientationMargin="0"
        style={{ margin: '16px 0 12px' }}
      >
        {__('Range', 'kelune-crm')}
      </Divider>
      <Row gutter={16}>
        <Col span={12}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
            {__('Limit', 'kelune-crm')}
          </Text>
          <InputNumber
            min={0}
            style={{ width: '100%' }}
            placeholder={__('All matching', 'kelune-crm')}
            value={limit}
            onChange={setLimit}
          />
        </Col>
        <Col span={12}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
            {__('Offset', 'kelune-crm')}
          </Text>
          <InputNumber
            min={0}
            style={{ width: '100%' }}
            placeholder="0"
            value={offset}
            onChange={setOffset}
          />
        </Col>
      </Row>
    </Modal>
  );
};

export default ExportModal;
