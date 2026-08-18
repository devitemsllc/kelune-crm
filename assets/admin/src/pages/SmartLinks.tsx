import React, { useCallback, useEffect, useState } from 'react';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { useDispatch, useSelector } from '@store/hooks';
import {
  Table,
  Button,
  Space,
  Drawer,
  Form,
  Input,
  Select,
  Modal,
  Alert,
  message,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  CopyOutlined,
  CheckOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import type { Key } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { useListState } from '../hooks/useListState';
import {
  fetchSmartLinks,
  createSmartLink,
  updateSmartLink,
  deleteSmartLink,
} from '../store/slices/smartLinksSlice';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../store/slices/globalLoadingSlice';
import api from '../services/api';
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
} from '../components/contacts/smartLinkSortOptions';
import type { SortOrder } from '../components/contacts/smartLinkSortOptions';
import { timeDiff, timeFormat } from '../utils/time';
import type {
  SmartLink,
  Tag as TagModel,
  ContactList,
  Automation,
  ID,
} from '@/types/models';

const { Text } = Typography;
const { TextArea } = Input;

const STATUS_OPTIONS = [
  { value: 'active', label: __('Active', 'kelune-crm') },
  { value: 'inactive', label: __('Inactive', 'kelune-crm') },
];

const TYPE_OPTIONS = [
  { value: 'general', label: __('General', 'kelune-crm') },
  { value: 'campaign', label: __('Campaign', 'kelune-crm') },
  { value: 'automation', label: __('Automation', 'kelune-crm') },
  { value: 'website', label: __('Website', 'kelune-crm') },
];

// Tag colours per link type (mirrors the four supported link_type values).
const TYPE_COLORS: Record<string, string> = {
  general: 'blue',
  campaign: 'green',
  automation: 'purple',
  website: 'orange',
};

interface VisibleColumn extends ColumnType<SmartLink> {
  visible?: boolean;
}

// Persisted view-state shape for the smart links page. Stored (with other list
// pages) under one localStorage object via useListState('smartLinks').
interface SmartLinksView {
  search: string;
  status: string;
  linkType: string;
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
  sortField: string;
  sortOrder: SortOrder;
}

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  link_type: true,
  tracking_url: true,
  clicks: true,
  status: true,
  last_clicked: false,
  expires: false,
  created: false,
};

const DEFAULT_SMART_LINKS_VIEW: SmartLinksView = {
  search: '',
  status: '',
  linkType: '',
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
};

const statusLabel = (val: string): string =>
  val ? val.charAt(0).toUpperCase() + val.slice(1) : '';

const typeLabel = (val: string): string =>
  TYPE_OPTIONS.find((opt) => opt.value === val)?.label ?? val;

const SmartLinks = () => {
  const dispatch = useDispatch();
  const { items, total, loading } = useSelector((state) => state.smartLinks);

  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [editingLink, setEditingLink] = useState<SmartLink | null>(null);
  // Tracking URL shown after a link is created (copyable), null when hidden.
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  // Toggles the modal copy button icon to a check for ~2s after copying.
  const [copied, setCopied] = useState(false);
  const [form] = Form.useForm();

  const [tags, setTags] = useState<TagModel[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);

  // Persisted view-state: search, filters, sort, page/limit and visible columns
  // are all kept in localStorage so they survive reloads and direct visits.
  const [view, updateView] = useListState<SmartLinksView>(
    'smartLinks',
    DEFAULT_SMART_LINKS_VIEW
  );

  const filters = view;
  const visibleColumns = view.columns;

  // Any filter/search/sort change resets to page 1.
  const setFilters = useCallback(
    (
      updater:
        | Partial<SmartLinksView>
        | ((prev: SmartLinksView) => SmartLinksView)
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

  const loadSmartLinks = useCallback(() => {
    dispatch(
      fetchSmartLinks({
        page: view.page,
        per_page: view.perPage,
        search: view.search,
        status: view.status,
        link_type: view.linkType,
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
    view.linkType,
    view.sortField,
    view.sortOrder,
  ]);

  const loadTagsListsAutomations = useCallback(async () => {
    try {
      const [tagsRes, listsRes, automationsRes] = await Promise.all([
        api.tags.getAll(),
        api.lists.getAll(),
        api.automations.getAll({ status: 'active' }),
      ]);
      // Normalise ids to numbers (API may send strings) so they match the
      // numeric Select option values below.
      setTags(
        (tagsRes.data || []).map((tag) => ({ ...tag, id: Number(tag.id) }))
      );
      setLists(
        (listsRes.data || []).map((list) => ({ ...list, id: Number(list.id) }))
      );
      const automationsData = automationsRes.data?.data || [];
      setAutomations(
        automationsData.map((auto: Automation) => ({
          ...auto,
          id: Number(auto.id),
        }))
      );
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to load tags and lists', 'kelune-crm')
        )
      );
    }
  }, []);

  useEffect(() => {
    loadSmartLinks();
  }, [loadSmartLinks]);

  useEffect(() => {
    loadTagsListsAutomations();
  }, [loadTagsListsAutomations]);

  const handleCreate = () => {
    setEditingLink(null);
    form.resetFields();
    setDrawerVisible(true);
  };

  const handleCopyUrl = async (url: string) => {
    if (!url) return;
    try {
      // navigator.clipboard needs a secure context (HTTPS); fall back to a
      // hidden textarea + execCommand on plain-HTTP sites (e.g. *.test).
      if (window.isSecureContext && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        textarea.remove();
        if (!ok) {
          throw new Error('execCommand copy failed');
        }
      }
      message.success(__('Tracking URL copied', 'kelune-crm'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error(__('Failed to copy URL', 'kelune-crm'));
    }
  };

  const handleEdit = (record: SmartLink) => {
    setEditingLink(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
      link_type: record.link_type,
      redirect_url: record.redirect_url,
      // Coerce to numbers so they match the numeric Select option values.
      add_tags: (record.add_tags || []).map(Number),
      remove_tags: (record.remove_tags || []).map(Number),
      add_lists: (record.add_lists || []).map(Number),
      remove_lists: (record.remove_lists || []).map(Number),
      trigger_automations: (record.trigger_automations || []).map(Number),
      status: record.status,
    });
    setDrawerVisible(true);
  };

  const handleDelete = async (id: ID) => {
    try {
      await dispatch(deleteSmartLink(id)).unwrap();
      message.success(__('Smart link deleted successfully', 'kelune-crm'));
      loadSmartLinks();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete smart link', 'kelune-crm'))
      );
    }
  };

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      await Promise.all(ids.map((id) => api.smartLinks.delete(id)));
      message.success(
        sprintf(
          /* translators: %d: number of smart links deleted */
          _n(
            '%d smart link deleted',
            '%d smart links deleted',
            ids.length,
            'kelune-crm'
          ),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      loadSmartLinks();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete smart links', 'kelune-crm'))
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

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      if (editingLink) {
        await dispatch(
          updateSmartLink({ id: editingLink.id, data: values })
        ).unwrap();
        message.success(__('Smart link updated successfully', 'kelune-crm'));
      } else {
        const result = await dispatch(createSmartLink(values)).unwrap();
        message.success(__('Smart link created successfully', 'kelune-crm'));

        // Surface the freshly-minted tracking URL for immediate copy.
        setCopied(false);
        setCreatedUrl(result.tracking_url ?? '');
      }
      setDrawerVisible(false);
      form.resetFields();
      loadSmartLinks();
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          editingLink
            ? __('Failed to update smart link', 'kelune-crm')
            : __('Failed to create smart link', 'kelune-crm')
        )
      );
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
  };

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
      title: __('Type', 'kelune-crm'),
      dataIndex: 'link_type',
      key: 'link_type',
      visible: visibleColumns.link_type,
      render: (type: string) => (
        <Tag bordered={false} color={TYPE_COLORS[type] || 'default'}>
          {typeLabel(type)}
        </Tag>
      ),
    },
    {
      title: __('Tracking URL', 'kelune-crm'),
      dataIndex: 'tracking_url',
      key: 'tracking_url',
      visible: visibleColumns.tracking_url,
      render: (url: string) =>
        url ? (
          <Text
            copyable={{
              text: url,
              tooltips: [
                __('Click to copy', 'kelune-crm'),
                __('Copied!', 'kelune-crm'),
              ],
            }}
            style={{ fontSize: 13 }}
          >
            {__('Copy URL', 'kelune-crm')}
          </Text>
        ) : (
          '-'
        ),
    },
    {
      title: __('Clicks', 'kelune-crm'),
      key: 'clicks',
      visible: visibleColumns.clicks,
      render: (_, record) => (
        <div>
          <div>
            {sprintf(
              /* translators: %d: total number of clicks */
              __('Total: %d', 'kelune-crm'),
              record.total_clicks ?? 0
            )}
          </div>
          <div style={{ color: 'rgba(0, 0, 0, 0.60)', fontSize: 12 }}>
            {sprintf(
              /* translators: %d: number of unique clicks */
              __('Unique: %d', 'kelune-crm'),
              record.unique_clicks ?? 0
            )}
          </div>
        </div>
      ),
    },
    {
      title: __('Status', 'kelune-crm'),
      dataIndex: 'status',
      key: 'status',
      visible: visibleColumns.status,
      render: (status: string) => (
        <Tag bordered={false} color={status === 'active' ? 'green' : 'default'}>
          {statusLabel(status)}
        </Tag>
      ),
    },
    {
      title: __('Last Clicked', 'kelune-crm'),
      dataIndex: 'last_clicked_at',
      key: 'last_clicked',
      visible: visibleColumns.last_clicked,
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
      title: __('Expires', 'kelune-crm'),
      dataIndex: 'expires_at',
      key: 'expires',
      visible: visibleColumns.expires,
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
  ) as ColumnsType<SmartLink>;

  const columnOptions = [
    { key: 'link_type', label: __('Type', 'kelune-crm') },
    { key: 'tracking_url', label: __('Tracking URL', 'kelune-crm') },
    { key: 'clicks', label: __('Clicks', 'kelune-crm') },
    { key: 'status', label: __('Status', 'kelune-crm') },
    { key: 'last_clicked', label: __('Last Clicked', 'kelune-crm') },
    { key: 'expires', label: __('Expires', 'kelune-crm') },
    { key: 'created', label: __('Created Date', 'kelune-crm') },
  ];

  // Filter drill-down config + value bag for the reusable ListFilterMenu.
  const filterMenuGroups: FilterMenuGroup[] = [
    {
      key: 'status',
      label: __('Status', 'kelune-crm'),
      mode: 'single',
      options: STATUS_OPTIONS,
    },
    {
      key: 'linkType',
      label: __('Type', 'kelune-crm'),
      mode: 'single',
      options: TYPE_OPTIONS,
    },
  ];

  const filterMenuValue: FilterMenuValue = {
    status: filters.status,
    linkType: filters.linkType,
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
  if (filters.linkType) {
    activeFilterGroups.push({
      label: __('Type', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, linkType: '' })),
      chips: [
        {
          key: `type-${filters.linkType}`,
          label: typeLabel(filters.linkType),
          onClose: () => setFilters((prev) => ({ ...prev, linkType: '' })),
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
  const hasFilters = Boolean(filters.status) || Boolean(filters.linkType);
  const sortActive = isSortActive({
    field: view.sortField,
    order: view.sortOrder,
  });
  const clearAll = () =>
    setFilters((prev) => ({
      ...prev,
      status: '',
      linkType: '',
      sortField: DEFAULT_SORT.field,
      sortOrder: DEFAULT_SORT.order,
    }));

  return (
    <div className="kelune-crm-cc-smart-links-container">
      <ListPageHeader
        title={__('Smart Links', 'kelune-crm')}
        primaryAction={{
          label: __('Create Link', 'kelune-crm'),
          onClick: handleCreate,
        }}
        onReload={loadSmartLinks}
      />

      <ListFilterCard
        search={filters.search}
        onSearchChange={(term) =>
          setFilters((prev) => ({ ...prev, search: term }))
        }
        searchPlaceholder={__('Search smart links...', 'kelune-crm')}
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
                  linkType: next.linkType as string,
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
            total={total}
            onChange={(nextPage, nextSize) =>
              updateView({ page: nextPage, perPage: nextSize })
            }
          />
        )}
      />

      <Drawer
        title={
          editingLink
            ? __('Edit Smart Link', 'kelune-crm')
            : __('Create Smart Link', 'kelune-crm')
        }
        width={640}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label={__('Link Name', 'kelune-crm')}
            rules={[
              {
                required: true,
                message: __('Please enter link name', 'kelune-crm'),
              },
            ]}
          >
            <Input
              placeholder={__('e.g., Webinar Registration Link', 'kelune-crm')}
            />
          </Form.Item>

          <Form.Item name="description" label={__('Description', 'kelune-crm')}>
            <TextArea
              rows={2}
              placeholder={__(
                'Brief description of this link...',
                'kelune-crm'
              )}
            />
          </Form.Item>

          <Form.Item
            name="link_type"
            label={__('Link Type', 'kelune-crm')}
            initialValue="general"
          >
            <Select options={TYPE_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="redirect_url"
            label={__('Redirect URL', 'kelune-crm')}
            rules={[
              {
                required: true,
                message: __('Please enter redirect URL', 'kelune-crm'),
              },
              {
                type: 'url',
                message: __('Please enter a valid URL', 'kelune-crm'),
              },
            ]}
          >
            <Input placeholder="https://example.com/destination" />
          </Form.Item>

          <Form.Item name="add_tags" label={__('Add Tags', 'kelune-crm')}>
            <Select
              mode="multiple"
              allowClear
              placeholder={__('Select tags to add on click', 'kelune-crm')}
              options={tags.map((tag) => ({
                label: tag.name,
                value: Number(tag.id),
              }))}
            />
          </Form.Item>

          <Form.Item name="remove_tags" label={__('Remove Tags', 'kelune-crm')}>
            <Select
              mode="multiple"
              allowClear
              placeholder={__('Select tags to remove on click', 'kelune-crm')}
              options={tags.map((tag) => ({
                label: tag.name,
                value: Number(tag.id),
              }))}
            />
          </Form.Item>

          <Form.Item name="add_lists" label={__('Add to Lists', 'kelune-crm')}>
            <Select
              mode="multiple"
              allowClear
              placeholder={__('Select lists to add contact to', 'kelune-crm')}
              options={lists.map((list) => ({
                label: list.name,
                value: Number(list.id),
              }))}
            />
          </Form.Item>

          <Form.Item
            name="remove_lists"
            label={__('Remove from Lists', 'kelune-crm')}
          >
            <Select
              mode="multiple"
              allowClear
              placeholder={__(
                'Select lists to remove contact from',
                'kelune-crm'
              )}
              options={lists.map((list) => ({
                label: list.name,
                value: Number(list.id),
              }))}
            />
          </Form.Item>

          <Form.Item
            name="trigger_automations"
            label={__('Trigger Automations', 'kelune-crm')}
          >
            <Select
              mode="multiple"
              allowClear
              placeholder={__('Select automations to trigger', 'kelune-crm')}
              options={automations.map((auto) => ({
                label: auto.name,
                value: Number(auto.id),
              }))}
            />
          </Form.Item>

          <Form.Item
            name="status"
            label={__('Status', 'kelune-crm')}
            initialValue="active"
          >
            <Select options={STATUS_OPTIONS} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingLink
                  ? __('Update Link', 'kelune-crm')
                  : __('Create Link', 'kelune-crm')}
              </Button>
              <Button onClick={() => setDrawerVisible(false)}>
                {__('Cancel', 'kelune-crm')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Drawer>

      <Modal
        destroyOnHidden
        centered
        title={__('Smart Link Created!', 'kelune-crm')}
        open={createdUrl !== null}
        onCancel={() => setCreatedUrl(null)}
        footer={null}
      >
        <Alert
          type="info"
          showIcon={false}
          style={{
            background: '#fafafa',
            border: 'none',
            marginBottom: 24,
          }}
          message={
            <span style={{ wordBreak: 'break-all' }}>{createdUrl ?? ''}</span>
          }
          action={
            <Tooltip
              title={
                copied
                  ? __('Copied!', 'kelune-crm')
                  : __('Copy URL', 'kelune-crm')
              }
            >
              <Button
                size="small"
                icon={
                  copied ? (
                    <CheckOutlined style={{ color: '#52c41a' }} />
                  ) : (
                    <CopyOutlined />
                  )
                }
                style={{ marginLeft: 12 }}
                onClick={() => handleCopyUrl(createdUrl ?? '')}
              />
            </Tooltip>
          }
        />
        <Button type="primary" onClick={() => setCreatedUrl(null)}>
          {__('Done', 'kelune-crm')}
        </Button>
      </Modal>
    </div>
  );
};

export default SmartLinks;
