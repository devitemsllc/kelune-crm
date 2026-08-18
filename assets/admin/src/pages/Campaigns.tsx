import React, { useCallback, useEffect, useState } from 'react';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { useDispatch, useSelector } from '@store/hooks';
import {
  Table,
  Button,
  Space,
  Tag,
  Typography,
  Dropdown,
  Popconfirm,
  Tooltip,
  message,
  Row,
  Col,
  Card,
  Statistic,
} from 'antd';
import {
  EditOutlined,
  MoreOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import type { Key } from 'react';
import type { MenuProps } from 'antd';
import {
  fetchCampaigns,
  deleteCampaign,
  duplicateCampaign,
  sendCampaign,
  pauseCampaign,
  resumeCampaign,
  bulkActionCampaigns,
  fetchSummaryStats,
} from '../store/slices/campaignsSlice';
import { useListState } from '../hooks/useListState';
import { isProActive } from '../hooks/useFeature';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../store/slices/globalLoadingSlice';
import CampaignForm from '../components/campaigns/CampaignForm';
import ABTestConfig from '../components/campaigns/ABTestConfig';
import CampaignAnalytics from '../components/campaigns/CampaignAnalytics';
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
} from '../components/campaigns/campaignSortOptions';
import type { SortOrder } from '../components/campaigns/campaignSortOptions';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { timeDiff, timeFormat } from '../utils/time';
import type { Campaign, CampaignSummaryStats, ID } from '@/types/models';

const { Text } = Typography;

const STATUS_OPTIONS = [
  { value: 'draft', label: __('Draft', 'kelune-crm') },
  { value: 'scheduled', label: __('Scheduled', 'kelune-crm') },
  { value: 'sending', label: __('Sending', 'kelune-crm') },
  { value: 'sent', label: __('Sent', 'kelune-crm') },
  { value: 'paused', label: __('Paused', 'kelune-crm') },
];

const STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  scheduled: 'blue',
  sending: 'processing',
  sent: 'success',
  paused: 'warning',
};

const statusColor = (status?: string): string =>
  (status && STATUS_COLORS[status]) || 'default';

const statusLabel = (val?: string): string =>
  val ? val.charAt(0).toUpperCase() + val.slice(1) : '';

const toRate = (rate?: number | string): number => {
  const num = parseFloat(String(rate ?? 0));
  return Number.isFinite(num) ? num : 0;
};

const toNumber = (val?: number | string): number => {
  const num = Number(val ?? 0);
  return Number.isFinite(num) ? num : 0;
};

interface SummaryCard {
  key: string;
  title: string;
  value: (stats: CampaignSummaryStats | null) => number;
  precision?: number;
  suffix?: string;
  color?: string;
  background: string;
  border: string;
}

// Dashboard summary band shown above the filter card. Soft tinted backgrounds
// (one hue per metric) mirror the template-gallery card styling.
const SUMMARY_CARDS: SummaryCard[] = [
  {
    key: 'total',
    title: __('Total Campaigns', 'kelune-crm'),
    value: (s) => toNumber(s?.total_campaigns),
    background: 'linear-gradient(135deg, #eff6ff 0%, #f5f9ff 100%)',
    border: '#bae0ff',
  },
  {
    key: 'active',
    title: __('Active Campaigns', 'kelune-crm'),
    value: (s) => toNumber(s?.active_campaigns),
    color: '#3f8600',
    background: 'linear-gradient(135deg, #f0fdf4 0%, #f6fdf9 100%)',
    border: '#b7eb8f',
  },
  {
    key: 'open',
    title: __('Avg Open Rate', 'kelune-crm'),
    value: (s) => toNumber(s?.avg_open_rate),
    precision: 2,
    suffix: '%',
    background: 'linear-gradient(135deg, #fff7ed 0%, #fffaf5 100%)',
    border: '#ffd591',
  },
  {
    key: 'click',
    title: __('Avg Click Rate', 'kelune-crm'),
    value: (s) => toNumber(s?.avg_click_rate),
    precision: 2,
    suffix: '%',
    background: 'linear-gradient(135deg, #faf5ff 0%, #fbf8ff 100%)',
    border: '#d3adf7',
  },
];

interface VisibleColumn extends ColumnType<Campaign> {
  visible?: boolean;
}

// Persisted view-state shape for the campaigns page. Stored (with other list
// pages) under one localStorage object via useListState('campaigns').
interface CampaignsView {
  search: string;
  status: string;
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
  sortField: string;
  sortOrder: SortOrder;
}

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  status: true,
  sent: true,
  open_rate: true,
  click_rate: false,
  scheduled_at: false,
  sent_at: false,
  created: false,
  updated: false,
};

const DEFAULT_CAMPAIGNS_VIEW: CampaignsView = {
  search: '',
  status: '',
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
};

const Campaigns = () => {
  const dispatch = useDispatch();
  // A/B testing (campaign variants) is a Pro feature; hide the action when Pro
  // is absent so it can't open a modal that has no backend route to talk to.
  const proActive = isProActive();
  const { items, total, loading, summaryStats } = useSelector(
    (state) => state.campaigns
  );
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [abTestModalVisible, setAbTestModalVisible] = useState(false);
  const [analyticsModalVisible, setAnalyticsModalVisible] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(
    null
  );
  // Which row's action dropdown is open (kept controlled for inline confirms).
  const [openMenuId, setOpenMenuId] = useState<ID | null>(null);

  // Persisted view-state: search, filters, sort, page/limit and visible columns
  // are all kept in localStorage so they survive reloads and direct visits.
  const [view, updateView] = useListState<CampaignsView>(
    'campaigns',
    DEFAULT_CAMPAIGNS_VIEW
  );

  const filters = view;
  const visibleColumns = view.columns;

  // Any filter/search/sort change resets to page 1.
  const setFilters = useCallback(
    (
      updater: Partial<CampaignsView> | ((prev: CampaignsView) => CampaignsView)
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

  const loadCampaigns = useCallback(() => {
    dispatch(
      fetchCampaigns({
        page: view.page,
        per_page: view.perPage,
        search: view.search,
        status: view.status,
        orderby: view.sortField,
        order: view.sortOrder,
      })
    );
  }, [
    dispatch,
    view.page,
    view.perPage,
    view.search,
    view.status,
    view.sortField,
    view.sortOrder,
  ]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Summary band is independent of list filters — refresh it on mount and on
  // every write (writes call loadCampaigns → we also refresh the summary there).
  useEffect(() => {
    dispatch(fetchSummaryStats());
  }, [dispatch]);

  // Reload both the list and the (filter-independent) summary band after a write.
  const reloadAll = useCallback(() => {
    loadCampaigns();
    dispatch(fetchSummaryStats());
  }, [dispatch, loadCampaigns]);

  const handleCreate = () => {
    setEditingCampaign(null);
    setCreateModalVisible(true);
  };

  const handleEdit = (record: Campaign) => {
    setEditingCampaign(record);
    setCreateModalVisible(true);
  };

  const handleCloseForm = () => {
    setCreateModalVisible(false);
    setEditingCampaign(null);
    reloadAll();
  };

  const handleDelete = async (id: ID) => {
    try {
      await dispatch(deleteCampaign(id)).unwrap();
      message.success(__('Campaign deleted successfully', 'kelune-crm'));
      reloadAll();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete campaign', 'kelune-crm'))
      );
    }
  };

  const handleDuplicate = async (id: ID) => {
    try {
      await dispatch(duplicateCampaign(id)).unwrap();
      message.success(__('Campaign duplicated successfully', 'kelune-crm'));
      reloadAll();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to duplicate campaign', 'kelune-crm'))
      );
    }
  };

  const handleSend = async (id: ID) => {
    try {
      await dispatch(sendCampaign(id)).unwrap();
      message.success(__('Campaign queued for sending', 'kelune-crm'));
      reloadAll();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to send campaign', 'kelune-crm'))
      );
    }
  };

  const handlePause = async (id: ID) => {
    try {
      await dispatch(pauseCampaign(id)).unwrap();
      message.success(__('Campaign paused', 'kelune-crm'));
      reloadAll();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to pause campaign', 'kelune-crm'))
      );
    }
  };

  const handleResume = async (id: ID) => {
    try {
      await dispatch(resumeCampaign(id)).unwrap();
      message.success(__('Campaign resumed', 'kelune-crm'));
      reloadAll();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to resume campaign', 'kelune-crm'))
      );
    }
  };

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      await dispatch(bulkActionCampaigns({ action: 'delete', ids })).unwrap();
      message.success(
        sprintf(
          /* translators: %d: number of campaigns deleted */
          _n(
            '%d campaign deleted',
            '%d campaigns deleted',
            ids.length,
            'kelune-crm'
          ),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      reloadAll();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete campaigns', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkAction = async (action: string, _value: BulkActionValue) => {
    if (action === 'delete') {
      handleBulkDelete();
      return;
    }
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      await dispatch(bulkActionCampaigns({ action, ids })).unwrap();
      message.success(
        sprintf(
          /* translators: %s: bulk action name */
          __('Bulk %s completed', 'kelune-crm'),
          action
        )
      );
      setSelectedRowKeys([]);
      reloadAll();
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          sprintf(
            /* translators: %s: bulk action name */
            __('Failed to %s campaigns', 'kelune-crm'),
            action
          )
        )
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
  };

  // Row action menu items. The Delete item embeds an inline ActionConfirm; the
  // Dropdown is kept open (see openMenuId guard) so the confirm anchor survives.
  const rowMenuItems = (record: Campaign): MenuProps['items'] => {
    const items: MenuProps['items'] = [];

    if (record.status === 'draft') {
      items.push({
        key: 'send',
        label: (
          <Popconfirm
            title={__('Send campaign', 'kelune-crm')}
            description={__('Send this campaign now?', 'kelune-crm')}
            okText={__('Yes', 'kelune-crm')}
            cancelText={__('No', 'kelune-crm')}
            onConfirm={() => {
              setOpenMenuId(null);
              handleSend(record.id);
            }}
            onCancel={() => setOpenMenuId(null)}
          >
            <span>{__('Send now', 'kelune-crm')}</span>
          </Popconfirm>
        ),
      });
    }
    if (record.status === 'sending') {
      items.push({
        key: 'pause',
        label: <span>{__('Pause', 'kelune-crm')}</span>,
        onClick: () => {
          setOpenMenuId(null);
          handlePause(record.id);
        },
      });
    }
    if (record.status === 'paused') {
      items.push({
        key: 'resume',
        label: <span>{__('Resume', 'kelune-crm')}</span>,
        onClick: () => {
          setOpenMenuId(null);
          handleResume(record.id);
        },
      });
    }

    items.push(
      {
        key: 'duplicate',
        label: <span>{__('Duplicate', 'kelune-crm')}</span>,
        onClick: () => {
          setOpenMenuId(null);
          handleDuplicate(record.id);
        },
      },
      {
        key: 'analytics',
        label: <span>{__('Analytics', 'kelune-crm')}</span>,
        onClick: () => {
          setOpenMenuId(null);
          setSelectedCampaign(record);
          setAnalyticsModalVisible(true);
        },
      },
      ...(proActive
        ? [
            {
              key: 'abtest',
              label: <span>{__('A/B Testing', 'kelune-crm')}</span>,
              onClick: () => {
                setOpenMenuId(null);
                setSelectedCampaign(record);
                setAbTestModalVisible(true);
              },
            },
          ]
        : []),
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
      }
    );

    return items;
  };

  const allColumns: VisibleColumn[] = [
    {
      title: __('Campaign', 'kelune-crm'),
      key: 'campaign',
      visible: true,
      render: (_, record) => (
        <div>
          <Text
            style={{ fontWeight: 500, cursor: 'pointer', display: 'block' }}
            onClick={() => handleEdit(record)}
          >
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
      title: __('Status', 'kelune-crm'),
      dataIndex: 'status',
      key: 'status',
      visible: visibleColumns.status,
      render: (status) => (
        <Tag bordered={false} color={statusColor(status)}>
          {statusLabel(status)}
        </Tag>
      ),
    },
    {
      title: __('Sent', 'kelune-crm'),
      key: 'sent',
      visible: visibleColumns.sent,
      align: 'center',
      render: (_, record) => record.stats?.total_sent || 0,
    },
    {
      title: __('Open Rate', 'kelune-crm'),
      key: 'open_rate',
      visible: visibleColumns.open_rate,
      align: 'center',
      render: (_, record) => `${toRate(record.stats?.open_rate)}%`,
    },
    {
      title: __('Click Rate', 'kelune-crm'),
      key: 'click_rate',
      visible: visibleColumns.click_rate,
      align: 'center',
      render: (_, record) => `${toRate(record.stats?.click_rate)}%`,
    },
    {
      title: __('Scheduled', 'kelune-crm'),
      dataIndex: 'scheduled_at',
      key: 'scheduled_at',
      visible: visibleColumns.scheduled_at,
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
      title: __('Sent Date', 'kelune-crm'),
      dataIndex: 'sent_at',
      key: 'sent_at',
      visible: visibleColumns.sent_at,
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
  ) as ColumnsType<Campaign>;

  const columnOptions = [
    { key: 'status', label: __('Status', 'kelune-crm') },
    { key: 'sent', label: __('Sent', 'kelune-crm') },
    { key: 'open_rate', label: __('Open Rate', 'kelune-crm') },
    { key: 'click_rate', label: __('Click Rate', 'kelune-crm') },
    { key: 'scheduled_at', label: __('Scheduled Date', 'kelune-crm') },
    { key: 'sent_at', label: __('Sent Date', 'kelune-crm') },
    { key: 'created', label: __('Created Date', 'kelune-crm') },
    { key: 'updated', label: __('Updated Date', 'kelune-crm') },
  ];

  // Filter drill-down config + value bag for the reusable ListFilterMenu.
  const filterMenuGroups: FilterMenuGroup[] = [
    {
      key: 'status',
      label: __('Status', 'kelune-crm'),
      mode: 'single',
      options: STATUS_OPTIONS,
    },
  ];

  const filterMenuValue: FilterMenuValue = {
    status: filters.status,
  };

  // Active-filter chip groups shown on the filter card's second row.
  const activeFilterGroups: FilterGroup[] = [];

  if (filters.status) {
    activeFilterGroups.push({
      label: __('Status', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, status: '' })),
      chips: [
        {
          key: `status-${filters.status}`,
          label: statusLabel(filters.status),
          onClose: () => setFilters((prev) => ({ ...prev, status: '' })),
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
  const hasFilters = Boolean(filters.status);
  const sortActive = isSortActive({
    field: view.sortField,
    order: view.sortOrder,
  });
  const clearAll = () =>
    setFilters((prev) => ({
      ...prev,
      status: '',
      sortField: DEFAULT_SORT.field,
      sortOrder: DEFAULT_SORT.order,
    }));

  return (
    <div className="kelune-crm-cc-campaigns-container">
      <ListPageHeader
        title={__('Campaigns', 'kelune-crm')}
        primaryAction={{
          label: __('Create Campaign', 'kelune-crm'),
          onClick: handleCreate,
        }}
        onReload={reloadAll}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {SUMMARY_CARDS.map((card) => (
          <Col key={card.key} xs={24} sm={12} xl={6}>
            <Card
              size="small"
              variant="outlined"
              style={{
                background: card.background,
                height: '100%',
                border: `1px solid ${card.border}`,
                boxShadow: 'none',
              }}
            >
              <Statistic
                title={card.title}
                value={card.value(summaryStats)}
                precision={card.precision}
                suffix={card.suffix}
                valueStyle={{ color: card.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <ListFilterCard
        search={filters.search}
        onSearchChange={(term) =>
          setFilters((prev) => ({ ...prev, search: term }))
        }
        searchPlaceholder={__('Search campaigns...', 'kelune-crm')}
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
                  status: next.status as string,
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
          { value: 'pause', label: __('Pause', 'kelune-crm') },
          { value: 'resume', label: __('Resume', 'kelune-crm') },
          { value: 'duplicate', label: __('Duplicate', 'kelune-crm') },
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

      <CampaignForm
        visible={createModalVisible}
        onCancel={handleCloseForm}
        editingCampaign={editingCampaign}
      />

      <ABTestConfig
        visible={abTestModalVisible}
        onCancel={() => {
          setAbTestModalVisible(false);
          setSelectedCampaign(null);
        }}
        campaign={selectedCampaign}
      />

      <CampaignAnalytics
        visible={analyticsModalVisible}
        onCancel={() => {
          setAnalyticsModalVisible(false);
          setSelectedCampaign(null);
        }}
        campaign={selectedCampaign}
      />
    </div>
  );
};

export default Campaigns;
