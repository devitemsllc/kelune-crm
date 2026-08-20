import React, { useCallback, useEffect, useState } from 'react';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { useDispatch, useSelector } from '@store/hooks';
import { Table, Button, Space, Tag, message, Tooltip, Typography } from 'antd';
import {
  DownloadOutlined,
  SendOutlined,
  DeleteOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import {
  fetchEmailLogs,
  fetchEmailLog,
  deleteEmailLog,
  bulkDeleteEmailLogs,
  resendEmail,
  exportCSV,
} from '../store/slices/emailLogsSlice';
import { useListState } from '../hooks/useListState';
import EmailLogStats from '../components/email-logs/EmailLogStats';
import EmailLogDetail from '../components/email-logs/EmailLogDetail';
import ActionConfirm from '../components/common/ActionConfirm';
import BulkActionsBar from '../components/common/BulkActionsBar';
import type { BulkActionValue } from '../components/common/BulkActionsBar';
import {
  ListPageHeader,
  ListFilterCard,
  ListFilterMenu,
  ListSort,
  ColumnsButton,
  ListTableFooter,
} from '../components/common/list';
import type {
  DateRangeFilterValue,
  FilterGroup,
  FilterMenuGroup,
  FilterMenuValue,
} from '../components/common/list';
import {
  DEFAULT_SORT,
  SORT_OPTIONS,
  CHRONOLOGICAL_FIELDS,
  NUMERIC_FIELDS,
  isSortActive,
  sortFieldLabel,
} from '../components/email-logs/emailLogSortOptions';
import type { SortOrder } from '../components/email-logs/emailLogSortOptions';
import { timeDiff, timeFormat } from '../utils/time';
import type { EmailLog, ID } from '@/types/models';
import type { MenuProps } from 'antd';
import type { Key } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';

const { Text } = Typography;

interface VisibleColumn extends ColumnType<EmailLog> {
  visible?: boolean;
}

const TYPE_OPTIONS = [
  { value: 'campaign', label: __('Campaign', 'kelune-crm') },
  { value: 'automation', label: __('Automation', 'kelune-crm') },
  { value: 'test', label: __('Test', 'kelune-crm') },
  { value: 'transactional', label: __('Transactional', 'kelune-crm') },
];

const STATUS_OPTIONS = [
  { value: 'queued', label: __('Queued', 'kelune-crm') },
  { value: 'sending', label: __('Sending', 'kelune-crm') },
  { value: 'sent', label: __('Sent', 'kelune-crm') },
  { value: 'delivered', label: __('Delivered', 'kelune-crm') },
  { value: 'opened', label: __('Opened', 'kelune-crm') },
  { value: 'clicked', label: __('Clicked', 'kelune-crm') },
  { value: 'failed', label: __('Failed', 'kelune-crm') },
  // Queued, then withheld at send time because the contact stopped being
  // mailable (see Models\Contact::isSendableStatus).
  { value: 'cancelled', label: __('Cancelled', 'kelune-crm') },
  { value: 'bounced', label: __('Bounced', 'kelune-crm') },
];

const PROVIDER_OPTIONS = [
  { value: 'wp_mail', label: __('WordPress', 'kelune-crm') },
  { value: 'smtp', label: 'SMTP' },
  { value: 'sendgrid', label: 'SendGrid' },
  { value: 'mailgun', label: 'Mailgun' },
  { value: 'ses', label: __('Amazon SES', 'kelune-crm') },
];

const STATUS_COLORS: Record<string, string> = {
  queued: 'default',
  sending: 'processing',
  sent: 'blue',
  delivered: 'cyan',
  opened: 'purple',
  clicked: 'magenta',
  failed: 'red',
  cancelled: 'default',
  bounced: 'orange',
};

const TYPE_COLORS: Record<string, string> = {
  campaign: 'blue',
  automation: 'purple',
  test: 'orange',
  transactional: 'green',
};

const optionLabel = (
  options: { value: string; label: string }[],
  value: string
): string => options.find((o) => o.value === value)?.label ?? value;

// Persisted view-state for the email-logs list page. Stored (with the other
// list pages) under one localStorage object via useListState('email-logs').
interface EmailLogsView {
  search: string;
  email_type: string;
  status: string;
  provider: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
  sortField: string;
  sortOrder: SortOrder;
}

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  type: true,
  status: true,
  provider: true,
  opens: true,
  clicks: true,
  sent_at: true,
  from: false,
  created: false,
};

const DEFAULT_EMAIL_LOGS_VIEW: EmailLogsView = {
  search: '',
  email_type: '',
  status: '',
  provider: '',
  dateFrom: '',
  dateTo: '',
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
};

const EmailLogs = () => {
  const dispatch = useDispatch();
  const { items, total, loading, currentLog } = useSelector(
    (state) => state.emailLogs
  );

  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [detailVisible, setDetailVisible] = useState(false);

  const [view, updateView] = useListState<EmailLogsView>(
    'email-logs',
    DEFAULT_EMAIL_LOGS_VIEW
  );

  const filters = view;
  const visibleColumns = view.columns;

  // Any filter/search/sort change resets to page 1.
  const setFilters = useCallback(
    (
      updater: Partial<EmailLogsView> | ((prev: EmailLogsView) => EmailLogsView)
    ) =>
      updateView((prev) => {
        const patch = typeof updater === 'function' ? updater(prev) : updater;
        return { ...prev, ...patch, page: 1 };
      }),
    [updateView]
  );

  const setVisibleColumns = useCallback(
    (columns: Record<string, boolean>) => updateView({ columns }),
    [updateView]
  );

  const loadEmailLogs = useCallback(() => {
    dispatch(
      fetchEmailLogs({
        page: view.page,
        per_page: view.perPage,
        search: view.search,
        email_type: view.email_type,
        status: view.status,
        provider: view.provider,
        date_from: view.dateFrom,
        date_to: view.dateTo,
        orderby: view.sortField,
        order: view.sortOrder,
      })
    );
  }, [
    dispatch,
    view.page,
    view.perPage,
    view.search,
    view.email_type,
    view.status,
    view.provider,
    view.dateFrom,
    view.dateTo,
    view.sortField,
    view.sortOrder,
  ]);

  useEffect(() => {
    loadEmailLogs();
  }, [loadEmailLogs]);

  const handleView = async (record: EmailLog) => {
    try {
      await dispatch(fetchEmailLog(record.id)).unwrap();
      setDetailVisible(true);
    } catch (error) {
      message.error(__('Failed to load email log details', 'kelune-crm'));
    }
  };

  const handleDelete = async (id: ID) => {
    try {
      await dispatch(deleteEmailLog(id)).unwrap();
      message.success(__('Email log deleted successfully', 'kelune-crm'));
      loadEmailLogs();
    } catch (error) {
      message.error(__('Failed to delete email log', 'kelune-crm'));
    }
  };

  const handleResend = async (record: EmailLog) => {
    try {
      await dispatch(resendEmail(record.id)).unwrap();
      message.success(__('Email resent successfully', 'kelune-crm'));
      loadEmailLogs();
    } catch (error) {
      message.error(__('Failed to resend email', 'kelune-crm'));
    }
  };

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as ID[];
    try {
      await dispatch(bulkDeleteEmailLogs(ids)).unwrap();
      message.success(
        sprintf(
          /* translators: %d: number of email logs deleted */
          _n(
            '%d email log deleted',
            '%d email logs deleted',
            ids.length,
            'kelune-crm'
          ),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      loadEmailLogs();
    } catch (error) {
      message.error(__('Failed to delete email logs', 'kelune-crm'));
    }
  };

  const handleBulkAction = (action: string, _value: BulkActionValue) => {
    if (action === 'delete') {
      handleBulkDelete();
    }
  };

  const handleExport = async () => {
    try {
      const params: Record<string, unknown> = {
        search: view.search,
        email_type: view.email_type,
        status: view.status,
        provider: view.provider,
        date_from: view.dateFrom,
        date_to: view.dateTo,
      };
      Object.keys(params).forEach((key) => {
        if (params[key] == null || params[key] === '') {
          delete params[key];
        }
      });

      const blob = await dispatch(exportCSV(params)).unwrap();
      if (!(blob instanceof Blob)) {
        throw new Error('Unexpected export response');
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const now = new Date();
      const date = now.toISOString().split('T')[0];
      const timestamp = Math.floor(now.getTime() / 1000);
      link.download = `email-logs-${date}-${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      message.success(__('Email logs exported successfully', 'kelune-crm'));
    } catch (error) {
      message.error(__('Failed to export email logs', 'kelune-crm'));
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
  };

  const allColumns: VisibleColumn[] = [
    {
      title: __('Email', 'kelune-crm'),
      key: 'email',
      visible: true,
      render: (_, record) => (
        <div>
          <Text
            style={{ fontWeight: 500, cursor: 'pointer', display: 'block' }}
            onClick={() => handleView(record)}
          >
            {record.subject || __('(no subject)', 'kelune-crm')}
          </Text>
          {record.email_to && (
            <div style={{ color: 'rgba(0, 0, 0, 0.60)', fontSize: 12 }}>
              {record.email_to}
            </div>
          )}
        </div>
      ),
    },
    {
      title: __('Type', 'kelune-crm'),
      dataIndex: 'email_type',
      key: 'type',
      visible: visibleColumns.type,
      render: (type: string | undefined) =>
        type ? (
          <Tag bordered={false} color={TYPE_COLORS[type] ?? 'default'}>
            {optionLabel(TYPE_OPTIONS, type)}
          </Tag>
        ) : (
          '-'
        ),
    },
    {
      title: __('Status', 'kelune-crm'),
      dataIndex: 'status',
      key: 'status',
      visible: visibleColumns.status,
      render: (status: string | undefined) =>
        status ? (
          <Tag bordered={false} color={STATUS_COLORS[status] ?? 'default'}>
            {optionLabel(STATUS_OPTIONS, status)}
          </Tag>
        ) : (
          '-'
        ),
    },
    {
      title: __('Provider', 'kelune-crm'),
      dataIndex: 'provider',
      key: 'provider',
      visible: visibleColumns.provider,
      render: (provider: string | undefined) =>
        provider ? (
          <Tag bordered={false}>{optionLabel(PROVIDER_OPTIONS, provider)}</Tag>
        ) : (
          '-'
        ),
    },
    {
      title: __('Opens', 'kelune-crm'),
      dataIndex: 'open_count',
      key: 'opens',
      visible: visibleColumns.opens,
      align: 'center',
      render: (count: number | undefined) => count || 0,
    },
    {
      title: __('Clicks', 'kelune-crm'),
      dataIndex: 'click_count',
      key: 'clicks',
      visible: visibleColumns.clicks,
      align: 'center',
      render: (count: number | undefined) => count || 0,
    },
    {
      title: __('From', 'kelune-crm'),
      dataIndex: 'email_from',
      key: 'from',
      visible: visibleColumns.from,
      render: (email: string | undefined) => email || '-',
    },
    {
      title: __('Sent At', 'kelune-crm'),
      dataIndex: 'sent_at',
      key: 'sent_at',
      visible: visibleColumns.sent_at,
      render: (date: string | null | undefined) =>
        date ? (
          <Tooltip title={timeFormat(date)}>
            <span>{timeDiff(date)}</span>
          </Tooltip>
        ) : (
          '-'
        ),
    },
    {
      title: __('Created', 'kelune-crm'),
      dataIndex: 'created_at',
      key: 'created',
      visible: visibleColumns.created,
      render: (date: string | null | undefined) =>
        date ? (
          <Tooltip title={timeFormat(date)}>
            <span>{timeDiff(date)}</span>
          </Tooltip>
        ) : (
          '-'
        ),
    },
    {
      title: __('Actions', 'kelune-crm'),
      key: 'actions',
      visible: true,
      align: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title={__('Resend', 'kelune-crm')}>
            <Button
              shape="default"
              size="small"
              icon={<SendOutlined />}
              onClick={() => handleResend(record)}
              disabled={
                record.status === 'queued' || record.status === 'sending'
              }
            />
          </Tooltip>
          <ActionConfirm
            action="delete"
            onConfirm={() => handleDelete(record.id)}
          >
            <Tooltip title={__('Delete', 'kelune-crm')}>
              <Button
                shape="default"
                size="small"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </ActionConfirm>
        </Space>
      ),
    },
  ];

  const columns = allColumns.filter(
    (col) => col.visible
  ) as ColumnsType<EmailLog>;

  const columnOptions = [
    { key: 'type', label: __('Type', 'kelune-crm') },
    { key: 'status', label: __('Status', 'kelune-crm') },
    { key: 'provider', label: __('Provider', 'kelune-crm') },
    { key: 'opens', label: __('Opens', 'kelune-crm') },
    { key: 'clicks', label: __('Clicks', 'kelune-crm') },
    { key: 'from', label: __('From', 'kelune-crm') },
    { key: 'sent_at', label: __('Sent At', 'kelune-crm') },
    { key: 'created', label: __('Created Date', 'kelune-crm') },
  ];

  const moreItems: MenuProps['items'] = [
    {
      key: 'export',
      icon: <DownloadOutlined />,
      label: __('Export', 'kelune-crm'),
      onClick: handleExport,
    },
  ];

  // Filter drill-down config + value bag for the reusable ListFilterMenu.
  const filterMenuGroups: FilterMenuGroup[] = [
    {
      key: 'email_type',
      label: __('Type', 'kelune-crm'),
      mode: 'single',
      options: TYPE_OPTIONS,
    },
    {
      key: 'status',
      label: __('Status', 'kelune-crm'),
      mode: 'single',
      options: STATUS_OPTIONS,
    },
    {
      key: 'provider',
      label: __('Provider', 'kelune-crm'),
      mode: 'single',
      options: PROVIDER_OPTIONS,
    },
    {
      key: 'date',
      label: __('Date range', 'kelune-crm'),
      mode: 'daterange',
    },
  ];

  const filterMenuValue: FilterMenuValue = {
    email_type: filters.email_type,
    status: filters.status,
    provider: filters.provider,
    date: { from: filters.dateFrom, to: filters.dateTo },
  };

  // Active-filter chip groups shown on the filter card's second row.
  const activeFilterGroups: FilterGroup[] = [];

  if (filters.email_type) {
    activeFilterGroups.push({
      label: __('Type', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, email_type: '' })),
      chips: [
        {
          key: `type-${filters.email_type}`,
          label: optionLabel(TYPE_OPTIONS, filters.email_type),
          onClose: () => setFilters((prev) => ({ ...prev, email_type: '' })),
        },
      ],
    });
  }
  if (filters.status) {
    activeFilterGroups.push({
      label: __('Status', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, status: '' })),
      chips: [
        {
          key: `status-${filters.status}`,
          label: optionLabel(STATUS_OPTIONS, filters.status),
          onClose: () => setFilters((prev) => ({ ...prev, status: '' })),
        },
      ],
    });
  }
  if (filters.provider) {
    activeFilterGroups.push({
      label: __('Provider', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, provider: '' })),
      chips: [
        {
          key: `provider-${filters.provider}`,
          label: optionLabel(PROVIDER_OPTIONS, filters.provider),
          onClose: () => setFilters((prev) => ({ ...prev, provider: '' })),
        },
      ],
    });
  }
  if (filters.dateFrom && filters.dateTo) {
    const clearDate = () =>
      setFilters((prev) => ({ ...prev, dateFrom: '', dateTo: '' }));
    activeFilterGroups.push({
      label: __('Date', 'kelune-crm'),
      onClear: clearDate,
      chips: [
        {
          key: `date-${filters.dateFrom}-${filters.dateTo}`,
          label: `${filters.dateFrom} → ${filters.dateTo}`,
          onClose: clearDate,
        },
      ],
    });
  }
  if (isSortActive({ field: view.sortField, order: view.sortOrder })) {
    const resetSort = () =>
      setFilters((prev) => ({
        ...prev,
        sortField: DEFAULT_SORT.field,
        sortOrder: DEFAULT_SORT.order,
      }));
    activeFilterGroups.push({
      label: __('Sort', 'kelune-crm'),
      onClear: resetSort,
      chips: [
        {
          key: `sort-${view.sortField}`,
          label: sortFieldLabel(view.sortField),
          icon:
            view.sortOrder === 'ASC' ? (
              <SortAscendingOutlined />
            ) : (
              <SortDescendingOutlined />
            ),
          onClose: resetSort,
        },
      ],
    });
  }

  // Global "Clear All" resets filters + sort (search and columns untouched).
  const hasFilters = Boolean(
    filters.email_type ||
    filters.status ||
    filters.provider ||
    (filters.dateFrom && filters.dateTo)
  );
  const sortActive = isSortActive({
    field: view.sortField,
    order: view.sortOrder,
  });
  const clearAll = () =>
    setFilters((prev) => ({
      ...prev,
      email_type: '',
      status: '',
      provider: '',
      dateFrom: '',
      dateTo: '',
      sortField: DEFAULT_SORT.field,
      sortOrder: DEFAULT_SORT.order,
    }));

  return (
    <div className="kelune-crm-cc-email-logs-container">
      <ListPageHeader
        title={__('Email Logs', 'kelune-crm')}
        onReload={loadEmailLogs}
        moreItems={moreItems}
      />

      <EmailLogStats
        dateRange={{
          date_from: view.dateFrom || undefined,
          date_to: view.dateTo || undefined,
        }}
      />

      <ListFilterCard
        search={filters.search}
        onSearchChange={(term) =>
          setFilters((prev) => ({ ...prev, search: term }))
        }
        searchPlaceholder={__('Search by subject, recipient...', 'kelune-crm')}
        filterGroups={activeFilterGroups}
        onClearAll={hasFilters || sortActive ? clearAll : undefined}
        controls={
          <>
            <ListFilterMenu
              groups={filterMenuGroups}
              value={filterMenuValue}
              onChange={(next) => {
                const range = next.date as DateRangeFilterValue | undefined;
                setFilters((prev) => ({
                  ...prev,
                  email_type: next.email_type as string,
                  status: next.status as string,
                  provider: next.provider as string,
                  dateFrom: range?.from ?? '',
                  dateTo: range?.to ?? '',
                }));
              }}
            />
            <ListSort
              value={{ field: view.sortField, order: view.sortOrder }}
              options={SORT_OPTIONS}
              defaultSort={DEFAULT_SORT}
              chronologicalFields={CHRONOLOGICAL_FIELDS}
              numericFields={NUMERIC_FIELDS}
              onChange={(next) =>
                setFilters((prev) => ({
                  ...prev,
                  sortField: next.field,
                  sortOrder: next.order,
                }))
              }
            />
            <ColumnsButton
              visible={visibleColumns}
              onChange={setVisibleColumns}
              options={columnOptions}
              onReset={() => setVisibleColumns({ ...DEFAULT_VISIBLE_COLUMNS })}
            />
          </>
        }
      />

      <BulkActionsBar
        selectedCount={selectedRowKeys.length}
        actions={[
          {
            value: 'delete',
            label: __('Delete', 'kelune-crm'),
            danger: true,
            confirm: 'delete',
          },
        ]}
        onConfirm={handleBulkAction}
        onClear={() => setSelectedRowKeys([])}
      />

      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={items}
        rowKey="id"
        loading={loading}
        scroll={{ x: 'max-content' }}
        pagination={false}
        footer={() => (
          <ListTableFooter
            page={view.page}
            perPage={view.perPage}
            total={total}
            onChange={(nextPage, nextSize) =>
              updateView({ page: nextPage, perPage: nextSize })
            }
          />
        )}
      />

      <EmailLogDetail
        visible={detailVisible}
        log={currentLog}
        onClose={() => setDetailVisible(false)}
        onResent={loadEmailLogs}
      />
    </div>
  );
};

export default EmailLogs;
