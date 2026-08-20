import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { __, sprintf } from '@wordpress/i18n';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { useDispatch, useSelector } from '@store/hooks';
import {
  Table,
  Button,
  Space,
  Tag,
  Row,
  Col,
  Card,
  Statistic,
  Modal,
  Dropdown,
  Tooltip,
  message,
} from 'antd';
import {
  EditOutlined,
  MoreOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import {
  fetchAutomations,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  duplicateAutomation,
  activateAutomation,
  pauseAutomation,
  bulkActionAutomations,
  fetchSummaryStats,
} from '../store/slices/automationsSlice';
import { useListState } from '../hooks/useListState';
import AutomationInfoModal from '../components/automations/AutomationInfoModal';
import type { AutomationInfoValues } from '../components/automations/AutomationInfoModal';
import AutomationStats from '../components/automations/AutomationStats';
import TemplateSelectionModal from '../components/automations/TemplateSelectionModal';
import {
  automationStatusLabel,
  triggerTypeLabel,
} from '../components/automations/typeLabels';
import {
  TRIGGER_OPTIONS,
  findTriggerType,
} from '../components/automations/triggerTypes';
import ActionConfirm from '../components/common/ActionConfirm';
import InlineSwitch from '../components/common/InlineSwitch';
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
} from '../components/automations/automationSortOptions';
import type { SortOrder } from '../components/automations/automationSortOptions';
import BulkActionsBar from '../components/common/BulkActionsBar';
import type { BulkActionValue } from '../components/common/BulkActionsBar';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { timeDiff, timeFormat } from '../utils/time';
import type { Automation, AutomationSummaryStats, ID } from '@/types/models';
import type { Key } from 'react';

const STATUS_OPTIONS = [
  { value: 'active', label: __('Active', 'kelune-crm') },
  { value: 'paused', label: __('Paused', 'kelune-crm') },
  { value: 'draft', label: __('Draft', 'kelune-crm') },
];

const statusFilterLabel = (val: string) =>
  STATUS_OPTIONS.find((option) => option.value === val)?.label ?? val;

const toNumber = (val?: number | string): number => {
  const num = Number(val ?? 0);
  return Number.isFinite(num) ? num : 0;
};

interface SummaryCard {
  key: string;
  title: string;
  value: (stats: AutomationSummaryStats | null) => number;
  precision?: number;
  suffix?: string;
  color?: string;
  background: string;
  border: string;
}

// Dashboard summary band shown above the filter card. Soft tinted backgrounds
// (one hue per metric) mirror the Campaigns page styling.
const SUMMARY_CARDS: SummaryCard[] = [
  {
    key: 'total',
    title: __('Total Automations', 'kelune-crm'),
    value: (s) => toNumber(s?.total_automations),
    background: 'linear-gradient(135deg, #eff6ff 0%, #f5f9ff 100%)',
    border: '#bae0ff',
  },
  {
    key: 'active',
    title: __('Active Automations', 'kelune-crm'),
    value: (s) => toNumber(s?.active_automations),
    color: '#3f8600',
    background: 'linear-gradient(135deg, #f0fdf4 0%, #f6fdf9 100%)',
    border: '#b7eb8f',
  },
  {
    key: 'enrolled',
    title: __('Total Enrolled', 'kelune-crm'),
    value: (s) => toNumber(s?.total_enrolled),
    background: 'linear-gradient(135deg, #fff7ed 0%, #fffaf5 100%)',
    border: '#ffd591',
  },
  {
    key: 'completion',
    title: __('Avg Completion Rate', 'kelune-crm'),
    value: (s) => toNumber(s?.avg_completion_rate),
    precision: 2,
    suffix: '%',
    background: 'linear-gradient(135deg, #faf5ff 0%, #fbf8ff 100%)',
    border: '#d3adf7',
  },
];

// Persisted view-state shape for the automations list page. Stored (with the
// other list pages) under one localStorage object via useListState.
interface AutomationsView {
  search: string;
  status: string;
  trigger_type: string;
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
  sortField: string;
  sortOrder: SortOrder;
}

// Status, Trigger and Enrolled show by default; the rest are toggleable and
// default off.
const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  status: true,
  trigger: true,
  enrolled: true,
  active: false,
  completed: false,
  conversion: false,
  last_triggered: false,
  created: false,
  updated: false,
};

const DEFAULT_AUTOMATIONS_VIEW: AutomationsView = {
  search: '',
  status: '',
  trigger_type: '',
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
};

interface VisibleColumn extends ColumnType<Automation> {
  visible?: boolean;
}

const Automations = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, total, loading, summaryStats } = useSelector(
    (state) => state.automations
  );

  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(
    null
  );
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [selectedAutomation, setSelectedAutomation] =
    useState<Automation | null>(null);
  // Which row's action dropdown is open (kept controlled for inline confirms).
  const [openMenuId, setOpenMenuId] = useState<ID | null>(null);

  const [view, updateView] = useListState<AutomationsView>(
    'automations',
    DEFAULT_AUTOMATIONS_VIEW
  );

  const filters = view;
  const visibleColumns = view.columns;

  // Any filter/search/sort change resets to page 1.
  const setFilters = useCallback(
    (
      updater:
        | Partial<AutomationsView>
        | ((prev: AutomationsView) => AutomationsView)
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

  const loadAutomations = useCallback(() => {
    dispatch(
      fetchAutomations({
        page: view.page,
        per_page: view.perPage,
        search: view.search,
        status: view.status,
        trigger_type: view.trigger_type,
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
    view.trigger_type,
    view.sortField,
    view.sortOrder,
  ]);

  useEffect(() => {
    loadAutomations();
  }, [loadAutomations]);

  useEffect(() => {
    dispatch(fetchSummaryStats());
  }, [dispatch]);

  const reload = useCallback(() => {
    loadAutomations();
    dispatch(fetchSummaryStats());
  }, [loadAutomations, dispatch]);

  const handleCreate = () => {
    setTemplateModalVisible(true);
  };

  const handleEditInfo = (record: Automation) => {
    setEditingAutomation(record);
    setFormModalVisible(true);
  };

  const closeInfoModal = () => {
    setFormModalVisible(false);
    setEditingAutomation(null);
  };

  // Creating persists the automation and continues straight to the builder,
  // which is where the workflow is actually assembled. Editing touches only the
  // name and description, and stays on the list.
  const handleInfoSubmit = async (values: AutomationInfoValues) => {
    try {
      if (editingAutomation) {
        await dispatch(
          updateAutomation({ id: editingAutomation.id, data: { ...values } })
        ).unwrap();
        message.success(__('Automation settings saved', 'kelune-crm'));
        closeInfoModal();
        reload();
        return;
      }

      const created = await dispatch(
        createAutomation({ ...values, status: 'draft' })
      ).unwrap();
      message.success(__('Automation created successfully', 'kelune-crm'));
      closeInfoModal();
      navigate(`/automations/builder/${String(created?.id)}`);
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to save automation', 'kelune-crm'))
      );
    }
  };

  const handleViewStats = (record: Automation) => {
    setSelectedAutomation(record);
    setStatsModalVisible(true);
  };

  const handleDelete = async (id: ID) => {
    try {
      await dispatch(deleteAutomation(id)).unwrap();
      message.success(__('Automation deleted successfully', 'kelune-crm'));
      reload();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete automation', 'kelune-crm'))
      );
    }
  };

  const handleDuplicate = async (id: ID) => {
    try {
      await dispatch(duplicateAutomation(id)).unwrap();
      message.success(__('Automation duplicated successfully', 'kelune-crm'));
      reload();
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to duplicate automation', 'kelune-crm')
        )
      );
    }
  };

  const handleActivate = async (id: ID) => {
    try {
      await dispatch(activateAutomation(id)).unwrap();
      message.success(__('Automation activated', 'kelune-crm'));
      reload();
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to activate automation', 'kelune-crm')
        )
      );
    }
  };

  const handlePause = async (id: ID) => {
    try {
      await dispatch(pauseAutomation(id)).unwrap();
      message.success(__('Automation paused', 'kelune-crm'));
      reload();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to pause automation', 'kelune-crm'))
      );
    }
  };

  const handleBulkAction = async (action: string, _value: BulkActionValue) => {
    const ids = selectedRowKeys as (string | number)[];
    if (ids.length === 0) {
      return;
    }
    try {
      await dispatch(bulkActionAutomations({ action, ids })).unwrap();
      message.success(
        sprintf(
          /* translators: %s: bulk action name */
          __('Bulk %s completed', 'kelune-crm'),
          action
        )
      );
      setSelectedRowKeys([]);
      reload();
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          sprintf(
            /* translators: %s: bulk action name */
            __('Failed to %s automations', 'kelune-crm'),
            action
          )
        )
      );
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
  };

  const getTriggerTag = (triggerType: string | undefined) => {
    if (!triggerType) {
      return '-';
    }
    return (
      <Tag bordered={false} color={findTriggerType(triggerType)?.color}>
        {triggerTypeLabel(triggerType)}
      </Tag>
    );
  };

  // Row action menu items. Delete embeds an inline ActionConfirm; the Dropdown
  // is kept open (see openMenuId guard) so the confirm anchor survives.
  const rowMenuItems = (record: Automation) => {
    return [
      {
        key: 'edit-info',
        label: <span>{__('Edit info', 'kelune-crm')}</span>,
        onClick: () => {
          setOpenMenuId(null);
          handleEditInfo(record);
        },
      },
      {
        key: 'duplicate',
        label: <span>{__('Duplicate', 'kelune-crm')}</span>,
        onClick: () => {
          setOpenMenuId(null);
          handleDuplicate(record.id);
        },
      },
      {
        key: 'view-stats',
        label: <span>{__('View stats', 'kelune-crm')}</span>,
        onClick: () => {
          setOpenMenuId(null);
          handleViewStats(record);
        },
      },
      { type: 'divider' as const },
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
  };

  const allColumns: VisibleColumn[] = [
    {
      title: __('Automation', 'kelune-crm'),
      key: 'automation',
      visible: true,
      render: (_, record) => (
        <div>
          <Link
            to={`/automations/builder/${record.id}`}
            style={{ fontWeight: 500, display: 'block', color: 'inherit' }}
          >
            {record.name || __('(untitled)', 'kelune-crm')}
          </Link>
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
      render: (status: string | undefined, record) => (
        <InlineSwitch
          inline
          style={{ marginBottom: 0 }}
          label={automationStatusLabel(status)}
          checked={status === 'active'}
          onChange={(checked) =>
            checked ? handleActivate(record.id) : handlePause(record.id)
          }
        />
      ),
    },
    {
      title: __('Trigger', 'kelune-crm'),
      dataIndex: 'trigger_type',
      key: 'trigger',
      visible: visibleColumns.trigger,
      render: (triggerType: string | undefined) => getTriggerTag(triggerType),
    },
    {
      title: __('Enrolled', 'kelune-crm'),
      dataIndex: 'total_enrolled',
      key: 'enrolled',
      visible: visibleColumns.enrolled,
      align: 'center',
      render: (count: number | undefined) => count ?? 0,
    },
    {
      title: __('Active', 'kelune-crm'),
      dataIndex: 'active_contacts',
      key: 'active',
      visible: visibleColumns.active,
      align: 'center',
      render: (count: number | undefined) => count ?? 0,
    },
    {
      title: __('Completed', 'kelune-crm'),
      dataIndex: 'completed_contacts',
      key: 'completed',
      visible: visibleColumns.completed,
      align: 'center',
      render: (count: number | undefined) => count ?? 0,
    },
    {
      title: __('Conversion', 'kelune-crm'),
      dataIndex: 'conversion_rate',
      key: 'conversion',
      visible: visibleColumns.conversion,
      align: 'center',
      render: (rate: number | undefined) => `${rate ?? 0}%`,
    },
    {
      title: __('Last Triggered', 'kelune-crm'),
      dataIndex: 'last_triggered_at',
      key: 'last_triggered',
      visible: visibleColumns.last_triggered,
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
      render: (date: string | undefined) =>
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
      render: (date: string | undefined) =>
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
          <Tooltip title={__('Edit workflow', 'kelune-crm')}>
            <Button
              size="small"
              icon={<EditOutlined />}
              href={`#/automations/builder/${record.id}`}
            />
          </Tooltip>
          <Dropdown
            menu={{ items: rowMenuItems(record) }}
            trigger={['click']}
            overlayClassName="kelune-crm-cc-confirm-dropdown"
            open={openMenuId === record.id}
            onOpenChange={(nextOpen, info) => {
              if (info.source === 'trigger' || nextOpen) {
                setOpenMenuId(nextOpen ? record.id : null);
              }
            }}
          >
            <Tooltip title={__('More actions', 'kelune-crm')}>
              <Button size="small" icon={<MoreOutlined />} />
            </Tooltip>
          </Dropdown>
        </Space>
      ),
    },
  ];

  const columns = allColumns.filter(
    (col) => col.visible
  ) as ColumnsType<Automation>;

  const columnOptions = [
    { key: 'status', label: __('Status', 'kelune-crm') },
    { key: 'trigger', label: __('Trigger', 'kelune-crm') },
    { key: 'enrolled', label: __('Enrolled', 'kelune-crm') },
    { key: 'active', label: __('Active', 'kelune-crm') },
    { key: 'completed', label: __('Completed', 'kelune-crm') },
    { key: 'conversion', label: __('Conversion', 'kelune-crm') },
    { key: 'last_triggered', label: __('Last Triggered', 'kelune-crm') },
    { key: 'created', label: __('Created Date', 'kelune-crm') },
    { key: 'updated', label: __('Updated Date', 'kelune-crm') },
  ];

  const filterMenuGroups: FilterMenuGroup[] = [
    {
      key: 'status',
      label: __('Status', 'kelune-crm'),
      mode: 'single',
      options: STATUS_OPTIONS,
    },
    {
      key: 'trigger_type',
      label: __('Trigger', 'kelune-crm'),
      mode: 'single',
      searchable: true,
      options: TRIGGER_OPTIONS,
    },
  ];

  const filterMenuValue: FilterMenuValue = {
    status: filters.status,
    trigger_type: filters.trigger_type,
  };

  const activeFilterGroups: FilterGroup[] = [];

  if (filters.status) {
    activeFilterGroups.push({
      label: __('Status', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, status: '' })),
      chips: [
        {
          key: `status-${filters.status}`,
          label: statusFilterLabel(filters.status),
          onClose: () => setFilters((prev) => ({ ...prev, status: '' })),
        },
      ],
    });
  }
  if (filters.trigger_type) {
    activeFilterGroups.push({
      label: __('Trigger', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, trigger_type: '' })),
      chips: [
        {
          key: `trigger-${filters.trigger_type}`,
          label: triggerTypeLabel(filters.trigger_type),
          onClose: () => setFilters((prev) => ({ ...prev, trigger_type: '' })),
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

  const hasFilters = Boolean(filters.status) || Boolean(filters.trigger_type);
  const sortActive = isSortActive({
    field: view.sortField,
    order: view.sortOrder,
  });
  const clearAll = () =>
    setFilters((prev) => ({
      ...prev,
      status: '',
      trigger_type: '',
      sortField: DEFAULT_SORT.field,
      sortOrder: DEFAULT_SORT.order,
    }));

  return (
    <div className="kelune-crm-cc-automations-container">
      <ListPageHeader
        title={__('Automations', 'kelune-crm')}
        primaryAction={{
          label: __('Create Automation', 'kelune-crm'),
          onClick: handleCreate,
        }}
        onReload={reload}
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
        searchPlaceholder={__('Search automations...', 'kelune-crm')}
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
                  trigger_type: next.trigger_type as string,
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
          { value: 'activate', label: __('Activate', 'kelune-crm') },
          { value: 'pause', label: __('Pause', 'kelune-crm') },
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

      <TemplateSelectionModal
        visible={templateModalVisible}
        onCancel={() => setTemplateModalVisible(false)}
        onSelectTemplate={(automation) => {
          setTemplateModalVisible(false);
          reload();
          const automationId = automation.id;
          if (
            typeof automationId === 'number' ||
            typeof automationId === 'string'
          ) {
            navigate(`/automations/builder/${automationId}`);
          }
        }}
        onCreateFromScratch={() => {
          setTemplateModalVisible(false);
          setEditingAutomation(null);
          setFormModalVisible(true);
        }}
      />

      <AutomationInfoModal
        open={formModalVisible}
        automation={editingAutomation}
        onCancel={closeInfoModal}
        onSubmit={handleInfoSubmit}
      />

      <Modal
        destroyOnHidden
        centered
        title={sprintf(
          /* translators: %s: automation name */
          __('Statistics: %s', 'kelune-crm'),
          selectedAutomation?.name || __('Automation', 'kelune-crm')
        )}
        open={statsModalVisible}
        onCancel={() => {
          setStatsModalVisible(false);
          setSelectedAutomation(null);
        }}
        footer={null}
        width={900}
      >
        {selectedAutomation && (
          <AutomationStats automationId={selectedAutomation.id} />
        )}
      </Modal>
    </div>
  );
};

export default Automations;
