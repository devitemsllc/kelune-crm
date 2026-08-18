import React, { useCallback, useEffect, useState } from 'react';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { useDispatch, useSelector } from '@store/hooks';
import {
  Table,
  Button,
  Space,
  Tag,
  message,
  Typography,
  Dropdown,
  Modal,
  Tooltip,
  Drawer,
} from 'antd';
import {
  EditOutlined,
  MoreOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import type { Key } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import {
  fetchWebhooks,
  deleteWebhook,
  regenerateWebhookKey,
  toggleWebhookStatus,
} from '../../store/slices/webhooksSlice';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../../store/slices/globalLoadingSlice';
import { useListState } from '../../hooks/useListState';
import WebhookForm from './WebhookForm';
import WebhookLogs from './WebhookLogs';
import ActionConfirm from '../common/ActionConfirm';
import BulkActionsBar from '../common/BulkActionsBar';
import type { BulkActionValue } from '../common/BulkActionsBar';
import {
  ListPageHeader,
  ListFilterCard,
  ListFilterMenu,
  ListSort,
  ColumnsButton,
  ListTableFooter,
} from '../common/list';
import { buildWebhookUrl } from '@/utils/webhookUrl';
import type {
  FilterGroup,
  FilterMenuGroup,
  FilterMenuValue,
} from '../common/list';
import {
  DEFAULT_SORT,
  SORT_OPTIONS,
  CHRONOLOGICAL_FIELDS,
  NUMERIC_FIELDS,
  isSortActive,
  sortFieldLabel,
} from './incomingWebhookSortOptions';
import type { SortOrder } from './incomingWebhookSortOptions';
import api from '../../services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { timeDiff, timeFormat } from '../../utils/time';
import type { Webhook, ID, Tag as TagModel, ContactList } from '@/types/models';

const { Text } = Typography;

interface VisibleColumn extends ColumnType<Webhook> {
  visible?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'active', label: __('Active', 'kelune-crm') },
  { value: 'inactive', label: __('Inactive', 'kelune-crm') },
];

// Labels for the allowed_actions machine values (mirrors WebhookForm).
const ACTION_LABELS: Record<string, string> = {
  create_contact: __('Create Contact', 'kelune-crm'),
  update_contact: __('Update Contact', 'kelune-crm'),
  add_tag: __('Add Tag', 'kelune-crm'),
  remove_tag: __('Remove Tag', 'kelune-crm'),
  add_list: __('Add to List', 'kelune-crm'),
  remove_list: __('Remove from List', 'kelune-crm'),
};

const statusLabel = (status?: string): string =>
  STATUS_OPTIONS.find((option) => option.value === status)?.label ?? '';

// Persisted view-state shape for the incoming webhooks list page.
interface WebhooksView {
  search: string;
  status: string;
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
  sortField: string;
  sortOrder: SortOrder;
}

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  endpoint: true,
  allowed_actions: true,
  status: true,
  total_requests: true,
  last_used: true,
  default_lists: false,
  default_tags: false,
  ip_whitelist: false,
  created: false,
  updated: false,
};

const DEFAULT_WEBHOOKS_VIEW: WebhooksView = {
  search: '',
  status: '',
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
};

const WebhookList = () => {
  const dispatch = useDispatch();
  const { webhooks, loading, pagination } = useSelector(
    (state) => state.webhooks
  );
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [logsVisible, setLogsVisible] = useState(false);
  // Which row's action dropdown is open (kept controlled for inline confirms).
  const [openMenuId, setOpenMenuId] = useState<ID | null>(null);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  // True right after a create so the drawer opens on the Usage tab.
  const [justCreated, setJustCreated] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [listsMap, setListsMap] = useState<Record<string, string>>({});
  const [tagsMap, setTagsMap] = useState<Record<string, string>>({});

  // Persisted view-state: search, filters, page/limit and visible columns are
  // all kept in localStorage so they survive reloads and direct visits.
  const [view, updateView] = useListState<WebhooksView>(
    'incoming-webhooks',
    DEFAULT_WEBHOOKS_VIEW
  );

  const filters = view;
  const visibleColumns = view.columns;

  // Any filter/search/sort change resets to page 1.
  const setFilters = useCallback(
    (updater: Partial<WebhooksView> | ((prev: WebhooksView) => WebhooksView)) =>
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

  const loadWebhooks = useCallback(() => {
    dispatch(
      fetchWebhooks({
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
    loadWebhooks();
  }, [loadWebhooks]);

  // Lists/tags lookups for the (default-off) default_lists / default_tags
  // columns. Ids are normalised to numbers so they match the API's numeric ids.
  const loadListsAndTags = useCallback(async () => {
    try {
      const [listsResponse, tagsResponse] = await Promise.all([
        api.get<ContactList[]>('/lists', { params: { per_page: 100 } }),
        api.get<TagModel[]>('/tags', { params: { per_page: 100 } }),
      ]);
      const listMap: Record<string, string> = {};
      (listsResponse.data || []).forEach((list) => {
        listMap[String(Number(list.id))] = list.name ?? '';
      });
      setListsMap(listMap);
      const tagMap: Record<string, string> = {};
      (tagsResponse.data || []).forEach((tag) => {
        tagMap[String(Number(tag.id))] = tag.name ?? '';
      });
      setTagsMap(tagMap);
    } catch (error) {
      console.error('Failed to load lists and tags:', error);
    }
  }, []);

  useEffect(() => {
    loadListsAndTags();
  }, [loadListsAndTags]);

  const handleCreate = () => {
    setEditingWebhook(null);
    setJustCreated(false);
    setDrawerVisible(true);
  };

  const handleEdit = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setJustCreated(false);
    setDrawerVisible(true);
  };

  const handleDelete = async (id: ID) => {
    try {
      // Thunk wraps the global loading overlay + reload happens on success.
      await dispatch(deleteWebhook(id)).unwrap();
      message.success(__('Webhook deleted successfully', 'kelune-crm'));
      loadWebhooks();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete webhook', 'kelune-crm'))
      );
    }
  };

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      await Promise.all(ids.map((id) => api.delete(`/webhooks/${id}`)));
      message.success(
        sprintf(
          // translators: %d: number of webhooks deleted
          _n(
            '%d webhook deleted',
            '%d webhooks deleted',
            ids.length,
            'kelune-crm'
          ),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      loadWebhooks();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete webhooks', 'kelune-crm'))
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

  const handleRegenerateKey = (webhook: Webhook) => {
    Modal.confirm({
      centered: true,
      title: __('Regenerate Webhook Key?', 'kelune-crm'),
      content: __(
        'This will invalidate the current webhook key. All integrations using this webhook will need to be updated with the new key.',
        'kelune-crm'
      ),
      okText: __('Regenerate', 'kelune-crm'),
      okType: 'danger',
      onOk: async () => {
        try {
          await dispatch(regenerateWebhookKey(webhook.id)).unwrap();
          message.success(
            __('Webhook key regenerated successfully', 'kelune-crm')
          );
          loadWebhooks();
        } catch (error) {
          message.error(
            getErrorMessage(error, __('Failed to regenerate key', 'kelune-crm'))
          );
        }
      },
    });
  };

  const handleToggleStatus = async (webhook: Webhook) => {
    try {
      await dispatch(toggleWebhookStatus(webhook.id)).unwrap();
      message.success(__('Webhook status updated successfully', 'kelune-crm'));
      loadWebhooks();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to update status', 'kelune-crm'))
      );
    }
  };

  const handleViewLogs = (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setLogsVisible(true);
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
  };

  // Row action menu items (View Logs, Toggle Status, Regenerate Key, Delete).
  // The Delete item embeds an inline ActionConfirm; the Dropdown is kept open
  // (see openMenuId guard) so the confirm anchor survives.
  const rowMenuItems = (record: Webhook): MenuProps['items'] => [
    {
      key: 'logs',
      label: <span>{__('View Logs', 'kelune-crm')}</span>,
      onClick: () => {
        setOpenMenuId(null);
        handleViewLogs(record);
      },
    },
    {
      key: 'toggle',
      label: (
        <span>
          {record.status === 'active'
            ? __('Deactivate', 'kelune-crm')
            : __('Activate', 'kelune-crm')}
        </span>
      ),
      onClick: () => {
        setOpenMenuId(null);
        handleToggleStatus(record);
      },
    },
    {
      key: 'regenerate',
      label: <span>{__('Regenerate Key', 'kelune-crm')}</span>,
      onClick: () => {
        setOpenMenuId(null);
        handleRegenerateKey(record);
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

  const webhookUrl = (key?: string) => buildWebhookUrl(key);

  const allColumns: VisibleColumn[] = [
    {
      title: __('Name', 'kelune-crm'),
      key: 'name',
      visible: true,
      render: (_, record) => (
        <div>
          <Text
            style={{ fontWeight: 500, cursor: 'pointer', display: 'block' }}
            onClick={() => handleEdit(record)}
          >
            {record.webhook_name || __('(untitled)', 'kelune-crm')}
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
      title: __('Endpoint', 'kelune-crm'),
      dataIndex: 'webhook_key',
      key: 'endpoint',
      visible: visibleColumns.endpoint,
      render: (key: string | undefined) =>
        key ? (
          <Typography.Text
            copyable={{
              text: webhookUrl(key),
              tooltips: [
                __('Copy URL', 'kelune-crm'),
                __('Copied!', 'kelune-crm'),
              ],
            }}
            style={{ fontSize: 12 }}
          >
            {__('Copy URL', 'kelune-crm')}
          </Typography.Text>
        ) : (
          '-'
        ),
    },
    {
      title: __('Allowed Actions', 'kelune-crm'),
      dataIndex: 'allowed_actions',
      key: 'allowed_actions',
      visible: visibleColumns.allowed_actions,
      render: (actions: string[] | undefined) =>
        actions && actions.length > 0 ? (
          <>
            {actions.slice(0, 2).map((action) => (
              <Tag bordered={false} key={action}>
                {ACTION_LABELS[action] ?? action}
              </Tag>
            ))}
            {actions.length > 2 && (
              <Tooltip
                title={actions
                  .slice(2)
                  .map((action) => ACTION_LABELS[action] ?? action)
                  .join(', ')}
              >
                <Tag bordered={false} style={{ cursor: 'default' }}>
                  +{actions.length - 2}
                </Tag>
              </Tooltip>
            )}
          </>
        ) : (
          <Text type="secondary">{__('None', 'kelune-crm')}</Text>
        ),
    },
    {
      title: __('Status', 'kelune-crm'),
      dataIndex: 'status',
      key: 'status',
      visible: visibleColumns.status,
      render: (status: string | undefined) => (
        <Tag bordered={false} color={status === 'active' ? 'green' : 'red'}>
          {statusLabel(status) || '-'}
        </Tag>
      ),
    },
    {
      title: __('Requests', 'kelune-crm'),
      dataIndex: 'total_requests',
      key: 'total_requests',
      visible: visibleColumns.total_requests,
      align: 'center',
      render: (count) => count || 0,
    },
    {
      title: __('Last Used', 'kelune-crm'),
      dataIndex: 'last_used_at',
      key: 'last_used',
      visible: visibleColumns.last_used,
      render: (date) =>
        date ? (
          <Tooltip title={timeFormat(date)}>
            <span>{timeDiff(date)}</span>
          </Tooltip>
        ) : (
          <Text type="secondary">{__('Never', 'kelune-crm')}</Text>
        ),
    },
    {
      title: __('Default Lists', 'kelune-crm'),
      dataIndex: 'default_lists',
      key: 'default_lists',
      visible: visibleColumns.default_lists,
      render: (lists: ID[] | undefined) =>
        lists && lists.length > 0 ? (
          <>
            {lists.slice(0, 2).map((id) => (
              <Tag bordered={false} key={id}>
                {listsMap[String(Number(id))] || `#${id}`}
              </Tag>
            ))}
            {lists.length > 2 && (
              <Tooltip
                title={lists
                  .slice(2)
                  .map((id) => listsMap[String(Number(id))] || `#${id}`)
                  .join(', ')}
              >
                <Tag bordered={false} style={{ cursor: 'default' }}>
                  +{lists.length - 2}
                </Tag>
              </Tooltip>
            )}
          </>
        ) : (
          <Text type="secondary">{__('None', 'kelune-crm')}</Text>
        ),
    },
    {
      title: __('Default Tags', 'kelune-crm'),
      dataIndex: 'default_tags',
      key: 'default_tags',
      visible: visibleColumns.default_tags,
      render: (tags: ID[] | undefined) =>
        tags && tags.length > 0 ? (
          <>
            {tags.slice(0, 2).map((id) => (
              <Tag bordered={false} key={id}>
                {tagsMap[String(Number(id))] || `#${id}`}
              </Tag>
            ))}
            {tags.length > 2 && (
              <Tooltip
                title={tags
                  .slice(2)
                  .map((id) => tagsMap[String(Number(id))] || `#${id}`)
                  .join(', ')}
              >
                <Tag bordered={false} style={{ cursor: 'default' }}>
                  +{tags.length - 2}
                </Tag>
              </Tooltip>
            )}
          </>
        ) : (
          <Text type="secondary">{__('None', 'kelune-crm')}</Text>
        ),
    },
    {
      title: __('IP Whitelist', 'kelune-crm'),
      dataIndex: 'ip_whitelist',
      key: 'ip_whitelist',
      visible: visibleColumns.ip_whitelist,
      render: (ip: string | undefined) =>
        ip ? (
          <Text code>{ip}</Text>
        ) : (
          <Text type="secondary">{__('Any', 'kelune-crm')}</Text>
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
  ) as ColumnsType<Webhook>;

  const columnOptions = [
    { key: 'endpoint', label: __('Endpoint', 'kelune-crm') },
    {
      key: 'allowed_actions',
      label: __('Allowed Actions', 'kelune-crm'),
    },
    { key: 'status', label: __('Status', 'kelune-crm') },
    { key: 'total_requests', label: __('Requests', 'kelune-crm') },
    { key: 'last_used', label: __('Last Used', 'kelune-crm') },
    { key: 'default_lists', label: __('Default Lists', 'kelune-crm') },
    { key: 'default_tags', label: __('Default Tags', 'kelune-crm') },
    { key: 'ip_whitelist', label: __('IP Whitelist', 'kelune-crm') },
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
    <div className="kelune-crm-cc-webhooks-container">
      <ListPageHeader
        title={__('Incoming Webhooks', 'kelune-crm')}
        primaryAction={{
          label: __('Create Webhook', 'kelune-crm'),
          onClick: handleCreate,
        }}
        onReload={loadWebhooks}
      />

      <ListFilterCard
        search={filters.search}
        onSearchChange={(term) =>
          setFilters((prev) => ({ ...prev, search: term }))
        }
        searchPlaceholder={__('Search webhooks...', 'kelune-crm')}
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
        dataSource={webhooks}
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
          editingWebhook
            ? __('Edit Webhook', 'kelune-crm')
            : __('Create Webhook', 'kelune-crm')
        }
        width={640}
        open={drawerVisible}
        destroyOnHidden
        // With a tab strip (edit mode) the body hugs the tabs; the plain create
        // form keeps an even 20px padding.
        styles={{
          body: {
            padding: editingWebhook ? '8px 20px 20px 20px' : '20px',
          },
        }}
        onClose={() => {
          setDrawerVisible(false);
          setEditingWebhook(null);
          setJustCreated(false);
        }}
      >
        <WebhookForm
          editingWebhook={editingWebhook}
          // Settings is the default tab; open on Usage straight after a create.
          defaultTab={justCreated ? 'usage' : 'config'}
          onCancel={() => {
            setDrawerVisible(false);
            setEditingWebhook(null);
            setJustCreated(false);
          }}
          onSuccess={loadWebhooks}
          // After create, keep the drawer open and flip it into edit mode so the
          // Usage tab (URL + accepted fields) shows immediately.
          onCreated={(webhook) => {
            setJustCreated(true);
            setEditingWebhook(webhook);
          }}
        />
      </Drawer>

      <WebhookLogs
        visible={logsVisible}
        onCancel={() => {
          setLogsVisible(false);
          setSelectedWebhook(null);
        }}
        webhook={selectedWebhook}
      />
    </div>
  );
};

export default WebhookList;
