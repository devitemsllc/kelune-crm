import React, { useCallback, useEffect, useState } from 'react';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { useDispatch } from '@store/hooks';
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  message,
  Typography,
  Tag,
  Tooltip,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import type { Key } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import type { ContactList, ID } from '@/types/models';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { useListState } from '../hooks/useListState';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../store/slices/globalLoadingSlice';
import api from '../services/api';
import ActionConfirm from '../components/common/ActionConfirm';
import ModalFooter from '../components/common/ModalFooter';
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
} from '../components/contacts/listSortOptions';
import type { SortOrder } from '../components/contacts/listSortOptions';
import { timeDiff, timeFormat } from '../utils/time';

const { Text } = Typography;
const { TextArea } = Input;

interface VisibleColumn extends ColumnType<ContactList> {
  visible?: boolean;
}

const TYPE_OPTIONS = [
  { value: 'manual', label: __('Manual', 'kelune-crm') },
  { value: 'dynamic', label: __('Dynamic', 'kelune-crm') },
];

// Persisted view-state shape for the lists page. Stored (with other list pages)
// under one localStorage object via useListState('lists').
interface ListsView {
  search: string;
  type: string;
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
  sortField: string;
  sortOrder: SortOrder;
}

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  id: true,
  contact_count: true,
  type: false,
  created: false,
  updated: false,
};

const DEFAULT_LISTS_VIEW: ListsView = {
  search: '',
  type: '',
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
};

const titleCase = (val?: string): string =>
  val ? val.charAt(0).toUpperCase() + val.slice(1) : '';

const Lists = () => {
  const dispatch = useDispatch();
  const [items, setItems] = useState<ContactList[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingList, setEditingList] = useState<ContactList | null>(null);
  const [form] = Form.useForm();

  // Persisted view-state: search, filters, page/limit and visible columns are
  // all kept in localStorage so they survive reloads and direct visits.
  const [view, updateView] = useListState<ListsView>(
    'lists',
    DEFAULT_LISTS_VIEW
  );

  const filters = view;
  const visibleColumns = view.columns;

  // Any filter/search/sort change resets to page 1.
  const setFilters = useCallback(
    (updater: Partial<ListsView> | ((prev: ListsView) => ListsView)) =>
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

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.lists.getAll({
        page: view.page,
        per_page: view.perPage,
        search: view.search,
        type: view.type,
        orderby: view.sortField,
        order: view.sortOrder,
      });
      setItems(response.data || []);
      const headerTotal = Number(response.headers['x-wp-total']);
      setTotal(
        Number.isFinite(headerTotal)
          ? headerTotal
          : (response.data || []).length
      );
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to fetch lists', 'kelune-crm'))
      );
    } finally {
      setLoading(false);
    }
  }, [
    view.page,
    view.perPage,
    view.search,
    view.type,
    view.sortField,
    view.sortOrder,
  ]);

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const handleCreate = () => {
    setEditingList(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: ContactList) => {
    setEditingList(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: ID) => {
    dispatch(startGlobalLoading());
    try {
      await api.lists.delete(id);
      message.success(__('List deleted successfully', 'kelune-crm'));
      loadLists();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete list', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      await Promise.all(ids.map((id) => api.lists.delete(id)));
      message.success(
        sprintf(
          /* translators: %d: number of lists deleted */
          _n('%d list deleted', '%d lists deleted', ids.length, 'kelune-crm'),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      loadLists();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete lists', 'kelune-crm'))
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
    dispatch(startGlobalLoading());
    try {
      if (editingList) {
        await api.lists.update(editingList.id, values);
        message.success(__('List updated successfully', 'kelune-crm'));
      } else {
        await api.lists.create(values);
        message.success(__('List created successfully', 'kelune-crm'));
      }
      setModalVisible(false);
      loadLists();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to save list', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
  };

  const allColumns: VisibleColumn[] = [
    {
      title: __('ID', 'kelune-crm'),
      dataIndex: 'id',
      key: 'id',
      visible: visibleColumns.id !== false,
      width: 70,
    },
    {
      title: __('List', 'kelune-crm'),
      key: 'list',
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
      title: __('Type', 'kelune-crm'),
      dataIndex: 'type',
      key: 'type',
      visible: visibleColumns.type,
      render: (type) =>
        type ? (
          <Tag bordered={false} color="purple">
            {titleCase(type)}
          </Tag>
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
  ) as ColumnsType<ContactList>;

  const columnOptions = [
    { key: 'id', label: __('ID', 'kelune-crm') },
    { key: 'contact_count', label: __('Contacts', 'kelune-crm') },
    { key: 'type', label: __('Type', 'kelune-crm') },
    { key: 'created', label: __('Created Date', 'kelune-crm') },
    { key: 'updated', label: __('Updated Date', 'kelune-crm') },
  ];

  // Filter drill-down config + value bag for the reusable ListFilterMenu.
  const filterMenuGroups: FilterMenuGroup[] = [
    {
      key: 'type',
      label: __('Type', 'kelune-crm'),
      mode: 'single',
      options: TYPE_OPTIONS,
    },
  ];

  const filterMenuValue: FilterMenuValue = {
    type: filters.type,
  };

  // Active-filter chip groups shown on the filter card's second row.
  const activeFilterGroups: FilterGroup[] = [];

  if (filters.type) {
    activeFilterGroups.push({
      label: __('Type', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, type: '' })),
      chips: [
        {
          key: `type-${filters.type}`,
          label: titleCase(filters.type),
          onClose: () => setFilters((prev) => ({ ...prev, type: '' })),
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
  const hasFilters = Boolean(filters.type);
  const sortActive = isSortActive({
    field: view.sortField,
    order: view.sortOrder,
  });
  const clearAll = () =>
    setFilters((prev) => ({
      ...prev,
      type: '',
      sortField: DEFAULT_SORT.field,
      sortOrder: DEFAULT_SORT.order,
    }));

  return (
    <div className="kelune-crm-cc-lists-container">
      <ListPageHeader
        title={__('Lists', 'kelune-crm')}
        primaryAction={{
          label: __('Create List', 'kelune-crm'),
          onClick: handleCreate,
        }}
        onReload={loadLists}
      />

      <ListFilterCard
        search={filters.search}
        onSearchChange={(term) =>
          setFilters((prev) => ({ ...prev, search: term }))
        }
        searchPlaceholder={__('Search lists...', 'kelune-crm')}
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
                  type: next.type as string,
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

      <Modal
        destroyOnHidden
        centered
        title={
          editingList
            ? __('Edit List', 'kelune-crm')
            : __('Create List', 'kelune-crm')
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label={__('List Name', 'kelune-crm')}
            rules={[
              {
                required: true,
                message: __('Please enter list name', 'kelune-crm'),
              },
            ]}
          >
            <Input
              placeholder={__('e.g., Newsletter Subscribers', 'kelune-crm')}
            />
          </Form.Item>

          <Form.Item
            name="description"
            label={__('Description', 'kelune-crm')}
            style={{ marginBottom: 0 }}
          >
            <TextArea
              rows={3}
              placeholder={__('Describe this list...', 'kelune-crm')}
            />
          </Form.Item>
        </Form>

        <div style={{ marginTop: 24 }}>
          <ModalFooter
            onOk={() => form.submit()}
            onCancel={() => setModalVisible(false)}
            okText={
              editingList
                ? __('Update', 'kelune-crm')
                : __('Create', 'kelune-crm')
            }
          />
        </div>
      </Modal>
    </div>
  );
};

export default Lists;
