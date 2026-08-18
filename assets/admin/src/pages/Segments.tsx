import React, { useCallback, useEffect, useState } from 'react';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { useDispatch, useSelector } from '@store/hooks';
import {
  Table,
  Button,
  Space,
  Drawer,
  message,
  Typography,
  Tag,
  Tooltip,
  Dropdown,
} from 'antd';
import {
  EditOutlined,
  ReloadOutlined,
  MoreOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import type { Key } from 'react';
import type { MenuProps } from 'antd';
import { __, _n, sprintf } from '@wordpress/i18n';
import type { Segment, ID } from '@/types/models';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { useListState } from '../hooks/useListState';
import {
  fetchSegments,
  deleteSegment,
  refreshSegment,
} from '../store/slices/segmentsSlice';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../store/slices/globalLoadingSlice';
import api from '../services/api';
import SegmentBuilder from '../components/segments/SegmentBuilder';
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
} from '../components/contacts/segmentSortOptions';
import type { SortOrder } from '../components/contacts/segmentSortOptions';
import { timeDiff, timeFormat } from '../utils/time';

const { Text } = Typography;

const MATCH_TYPE_OPTIONS = [
  { value: 'all', label: __('Match All', 'kelune-crm') },
  { value: 'any', label: __('Match Any', 'kelune-crm') },
];

const AUTO_REFRESH_OPTIONS = [
  { value: '1', label: __('Enabled', 'kelune-crm') },
  { value: '0', label: __('Disabled', 'kelune-crm') },
];

interface VisibleColumn extends ColumnType<Segment> {
  visible?: boolean;
}

// Persisted view-state shape for the segments page. Stored (with other list
// pages) under one localStorage object via useListState('segments').
interface SegmentsView {
  search: string;
  matchType: string;
  autoRefresh: string;
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
  sortField: string;
  sortOrder: SortOrder;
}

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  contact_count: true,
  match_type: false,
  auto_refresh: false,
  last_calculated: false,
  created: false,
  updated: false,
};

const DEFAULT_SEGMENTS_VIEW: SegmentsView = {
  search: '',
  matchType: '',
  autoRefresh: '',
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
};

const matchTypeLabel = (val?: string): string =>
  val === 'any' ? __('Match Any', 'kelune-crm') : __('Match All', 'kelune-crm');

const Segments = () => {
  const dispatch = useDispatch();
  const { items, loading, pagination } = useSelector((state) => state.segments);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [refreshingId, setRefreshingId] = useState<ID | null>(null);
  // Which row's action dropdown is open (kept controlled for inline confirms).
  const [openMenuId, setOpenMenuId] = useState<ID | null>(null);

  // Persisted view-state: search, filters, sort, page/limit and visible columns
  // are all kept in localStorage so they survive reloads and direct visits.
  const [view, updateView] = useListState<SegmentsView>(
    'segments',
    DEFAULT_SEGMENTS_VIEW
  );

  const filters = view;
  const visibleColumns = view.columns;

  // Any filter/search/sort change resets to page 1.
  const setFilters = useCallback(
    (updater: Partial<SegmentsView> | ((prev: SegmentsView) => SegmentsView)) =>
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

  const loadSegments = useCallback(() => {
    dispatch(
      fetchSegments({
        page: view.page,
        per_page: view.perPage,
        search: view.search,
        match_type: view.matchType,
        auto_refresh: view.autoRefresh,
        orderby: view.sortField,
        order: view.sortOrder,
      })
    );
  }, [
    dispatch,
    view.page,
    view.perPage,
    view.search,
    view.matchType,
    view.autoRefresh,
    view.sortField,
    view.sortOrder,
  ]);

  useEffect(() => {
    loadSegments();
  }, [loadSegments]);

  const handleCreate = () => {
    setEditingSegment(null);
    setDrawerVisible(true);
  };

  const handleEdit = (record: Segment) => {
    setEditingSegment(record);
    setDrawerVisible(true);
  };

  const handleDelete = async (id: ID) => {
    try {
      await dispatch(deleteSegment(id)).unwrap();
      message.success(__('Segment deleted successfully', 'kelune-crm'));
      loadSegments();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete segment', 'kelune-crm'))
      );
    }
  };

  const handleRefresh = async (id: ID) => {
    setRefreshingId(id);
    try {
      await dispatch(refreshSegment(id)).unwrap();
      message.success(__('Segment refreshed successfully', 'kelune-crm'));
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to refresh segment', 'kelune-crm'))
      );
    } finally {
      setRefreshingId(null);
    }
  };

  const handleExport = async (id: ID) => {
    dispatch(startGlobalLoading());
    try {
      const response = await api.segments.export(id);
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
      link.download = `segment-${id}-${date}-${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      message.success(__('Segment exported successfully', 'kelune-crm'));
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to export segment', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      await Promise.all(ids.map((id) => api.segments.delete(id)));
      message.success(
        sprintf(
          /* translators: %d: number of segments deleted */
          _n(
            '%d segment deleted',
            '%d segments deleted',
            ids.length,
            'kelune-crm'
          ),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      loadSegments();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete segments', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkAction = (action: string, _value: BulkActionValue) => {
    if (action === 'delete') {
      handleBulkDelete();
    }
  };

  const handleSaveSegment = () => {
    setDrawerVisible(false);
    loadSegments();
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
  };

  // Row action menu items (Export / Delete). The Delete item embeds an inline
  // ActionConfirm; the Dropdown is kept open (see openMenuId guard) so the
  // confirm anchor survives.
  const rowMenuItems = (record: Segment): MenuProps['items'] => [
    {
      key: 'export',
      label: <span>{__('Export', 'kelune-crm')}</span>,
      onClick: () => {
        setOpenMenuId(null);
        handleExport(record.id);
      },
    },
    { type: 'divider' },
    {
      key: 'delete',
      danger: true,
      label: (
        <ActionConfirm
          action="delete"
          onConfirm={() => {
            setOpenMenuId(null);
            handleDelete(record.id);
          }}
          onCancel={() => setOpenMenuId(null)}
        >
          <span>{__('Delete', 'kelune-crm')}</span>
        </ActionConfirm>
      ),
    },
  ];

  const allColumns: VisibleColumn[] = [
    {
      title: __('Segment', 'kelune-crm'),
      key: 'segment',
      visible: true,
      render: (_, record) => (
        <div>
          <Text style={{ fontWeight: 500, display: 'block' }}>
            {record.name || __('(untitled)', 'kelune-crm')}
          </Text>
          {record.description && (
            <div style={{ color: 'rgba(0, 0, 0, 0.60)', fontSize: 12 }}>
              {record.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: __('Contacts', 'kelune-crm'),
      dataIndex: 'contact_count',
      key: 'contact_count',
      visible: visibleColumns.contact_count,
      align: 'center',
      render: (count) => count || 0,
    },
    {
      title: __('Match Type', 'kelune-crm'),
      dataIndex: 'match_type',
      key: 'match_type',
      visible: visibleColumns.match_type,
      render: (type) => (
        <Tag bordered={false} color={type === 'any' ? 'orange' : 'green'}>
          {matchTypeLabel(type)}
        </Tag>
      ),
    },
    {
      title: __('Auto Refresh', 'kelune-crm'),
      dataIndex: 'auto_refresh',
      key: 'auto_refresh',
      visible: visibleColumns.auto_refresh,
      align: 'center',
      render: (autoRefresh) =>
        autoRefresh ? (
          <Tag bordered={false} color="success">
            {__('Enabled', 'kelune-crm')}
          </Tag>
        ) : (
          <Tag bordered={false}>{__('Disabled', 'kelune-crm')}</Tag>
        ),
    },
    {
      title: __('Last Calculated', 'kelune-crm'),
      dataIndex: 'last_calculated',
      key: 'last_calculated',
      visible: visibleColumns.last_calculated,
      render: (date) =>
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
      render: (date) =>
        date ? (
          <Tooltip title={timeFormat(date)}>
            <span>{timeDiff(date)}</span>
          </Tooltip>
        ) : (
          '-'
        ),
    },
    {
      title: __('Updated', 'kelune-crm'),
      dataIndex: 'updated_at',
      key: 'updated',
      visible: visibleColumns.updated,
      render: (date) =>
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
          <Tooltip title={__('Refresh membership', 'kelune-crm')}>
            <Button
              shape="default"
              size="small"
              icon={<ReloadOutlined />}
              loading={refreshingId === record.id}
              onClick={() => handleRefresh(record.id)}
            />
          </Tooltip>
          <Tooltip title={__('Edit', 'kelune-crm')}>
            <Button
              shape="default"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Dropdown
            menu={{ items: rowMenuItems(record) }}
            trigger={['click']}
            overlayClassName="kelune-crm-cc-confirm-dropdown"
            open={openMenuId === record.id}
            onOpenChange={(nextOpen, info) => {
              // Ignore menu-item clicks (source 'menu') so an inline confirm
              // can show without the dropdown closing under it.
              if (info.source === 'trigger' || nextOpen) {
                setOpenMenuId(nextOpen ? record.id : null);
              }
            }}
          >
            <Tooltip title={__('More actions', 'kelune-crm')}>
              <Button shape="default" size="small" icon={<MoreOutlined />} />
            </Tooltip>
          </Dropdown>
        </Space>
      ),
    },
  ];

  const columns = allColumns.filter(
    (col) => col.visible
  ) as ColumnsType<Segment>;

  const columnOptions = [
    { key: 'contact_count', label: __('Contacts', 'kelune-crm') },
    { key: 'match_type', label: __('Match Type', 'kelune-crm') },
    { key: 'auto_refresh', label: __('Auto Refresh', 'kelune-crm') },
    {
      key: 'last_calculated',
      label: __('Last Calculated', 'kelune-crm'),
    },
    { key: 'created', label: __('Created Date', 'kelune-crm') },
    { key: 'updated', label: __('Updated Date', 'kelune-crm') },
  ];

  // Filter drill-down config + value bag for the reusable ListFilterMenu.
  const filterMenuGroups: FilterMenuGroup[] = [
    {
      key: 'matchType',
      label: __('Match Type', 'kelune-crm'),
      mode: 'single',
      options: MATCH_TYPE_OPTIONS,
    },
    {
      key: 'autoRefresh',
      label: __('Auto Refresh', 'kelune-crm'),
      mode: 'single',
      options: AUTO_REFRESH_OPTIONS,
    },
  ];

  const filterMenuValue: FilterMenuValue = {
    matchType: filters.matchType,
    autoRefresh: filters.autoRefresh,
  };

  // Active-filter chip groups shown on the filter card's second row.
  const activeFilterGroups: FilterGroup[] = [];

  if (filters.matchType) {
    activeFilterGroups.push({
      label: __('Match Type', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, matchType: '' })),
      chips: [
        {
          key: `match-${filters.matchType}`,
          label: matchTypeLabel(filters.matchType),
          onClose: () => setFilters((prev) => ({ ...prev, matchType: '' })),
        },
      ],
    });
  }
  if (filters.autoRefresh) {
    activeFilterGroups.push({
      label: __('Auto Refresh', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, autoRefresh: '' })),
      chips: [
        {
          key: `auto-${filters.autoRefresh}`,
          label:
            filters.autoRefresh === '1'
              ? __('Enabled', 'kelune-crm')
              : __('Disabled', 'kelune-crm'),
          onClose: () => setFilters((prev) => ({ ...prev, autoRefresh: '' })),
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
  const hasFilters = Boolean(filters.matchType) || Boolean(filters.autoRefresh);
  const sortActive = isSortActive({
    field: view.sortField,
    order: view.sortOrder,
  });
  const clearAll = () =>
    setFilters((prev) => ({
      ...prev,
      matchType: '',
      autoRefresh: '',
      sortField: DEFAULT_SORT.field,
      sortOrder: DEFAULT_SORT.order,
    }));

  return (
    <div className="kelune-crm-cc-segments-container">
      <ListPageHeader
        title={__('Segments', 'kelune-crm')}
        primaryAction={{
          label: __('Create Segment', 'kelune-crm'),
          onClick: handleCreate,
        }}
        onReload={loadSegments}
      />

      <ListFilterCard
        search={filters.search}
        onSearchChange={(term) =>
          setFilters((prev) => ({ ...prev, search: term }))
        }
        searchPlaceholder={__('Search segments...', 'kelune-crm')}
        filterGroups={activeFilterGroups}
        onClearAll={hasFilters || sortActive ? clearAll : undefined}
        controls={
          <>
            <ListFilterMenu
              groups={filterMenuGroups}
              value={filterMenuValue}
              onChange={(next) =>
                setFilters((prev) => ({
                  ...prev,
                  matchType: next.matchType as string,
                  autoRefresh: next.autoRefresh as string,
                }))
              }
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
            total={pagination.total}
            onChange={(nextPage, nextSize) =>
              updateView({ page: nextPage, perPage: nextSize })
            }
          />
        )}
      />

      <Drawer
        title={
          editingSegment
            ? __('Edit Segment', 'kelune-crm')
            : __('Create Segment', 'kelune-crm')
        }
        width={900}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        bodyStyle={{ paddingBottom: 80 }}
        destroyOnHidden
      >
        <SegmentBuilder
          segment={editingSegment}
          onSave={handleSaveSegment}
          onCancel={() => setDrawerVisible(false)}
        />
      </Drawer>
    </div>
  );
};

export default Segments;
