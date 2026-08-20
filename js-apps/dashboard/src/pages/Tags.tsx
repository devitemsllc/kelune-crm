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
import type { Tag, ID } from '@/types/models';
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
  ListSort,
  ColumnsButton,
  ListTableFooter,
} from '../components/common/list';
import type { FilterGroup } from '../components/common/list';
import {
  DEFAULT_SORT,
  SORT_OPTIONS,
  CHRONOLOGICAL_FIELDS,
  NUMERIC_FIELDS,
  isSortActive,
  sortFieldLabel,
} from '../components/contacts/tagSortOptions';
import type { SortOrder } from '../components/contacts/tagSortOptions';
import { timeDiff, timeFormat } from '../utils/time';
import SubmitOnEnter from '../components/common/SubmitOnEnter';

const { Text } = Typography;
const { TextArea } = Input;

interface VisibleColumn extends ColumnType<Tag> {
  visible?: boolean;
}

// Persisted view-state shape for the tags page. Stored (with other list pages)
// under one localStorage object via useListState('tags').
interface TagsView {
  search: string;
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
  sortField: string;
  sortOrder: SortOrder;
}

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  id: true,
  contact_count: true,
  created: false,
};

const DEFAULT_TAGS_VIEW: TagsView = {
  search: '',
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
};

const Tags = () => {
  const dispatch = useDispatch();
  const [items, setItems] = useState<Tag[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [form] = Form.useForm();

  // Persisted view-state: search, sort, page/limit and visible columns are all
  // kept in localStorage so they survive reloads and direct visits.
  const [view, updateView] = useListState<TagsView>('tags', DEFAULT_TAGS_VIEW);

  const filters = view;
  const visibleColumns = view.columns;

  // Any search/sort change resets to page 1.
  const setFilters = useCallback(
    (updater: Partial<TagsView> | ((prev: TagsView) => TagsView)) =>
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

  const loadTags = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.tags.getAll({
        page: view.page,
        per_page: view.perPage,
        search: view.search,
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
        getErrorMessage(error, __('Failed to fetch tags', 'kelune-crm'))
      );
    } finally {
      setLoading(false);
    }
  }, [view.page, view.perPage, view.search, view.sortField, view.sortOrder]);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleCreate = () => {
    setEditingTag(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Tag) => {
    setEditingTag(record);
    form.setFieldsValue({
      name: record.name,
      description: record.description,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: ID) => {
    dispatch(startGlobalLoading());
    try {
      await api.tags.delete(id);
      message.success(__('Tag deleted successfully', 'kelune-crm'));
      loadTags();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete tag', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      await Promise.all(ids.map((id) => api.tags.delete(id)));
      message.success(
        sprintf(
          /* translators: %d: number of tags deleted */
          _n('%d tag deleted', '%d tags deleted', ids.length, 'kelune-crm'),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      loadTags();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete tags', 'kelune-crm'))
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
      if (editingTag) {
        await api.tags.update(editingTag.id, values);
        message.success(__('Tag updated successfully', 'kelune-crm'));
      } else {
        await api.tags.create(values);
        message.success(__('Tag created successfully', 'kelune-crm'));
      }
      setModalVisible(false);
      loadTags();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to save tag', 'kelune-crm'))
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
      title: __('Tag', 'kelune-crm'),
      key: 'tag',
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

  const columns = allColumns.filter((col) => col.visible) as ColumnsType<Tag>;

  const columnOptions = [
    { key: 'id', label: __('ID', 'kelune-crm') },
    { key: 'contact_count', label: __('Contacts', 'kelune-crm') },
    { key: 'created', label: __('Created Date', 'kelune-crm') },
  ];

  // Active-filter chip groups shown on the filter card's second row. Tags have
  // no filters, so only the active sort surfaces here.
  const activeFilterGroups: FilterGroup[] = [];

  const sortActive = isSortActive({
    field: view.sortField,
    order: view.sortOrder,
  });
  if (sortActive) {
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

  // Tags have no filters, so "Clear All" only needs to reset the sort.
  const clearAll = () =>
    setFilters((prev) => ({
      ...prev,
      sortField: DEFAULT_SORT.field,
      sortOrder: DEFAULT_SORT.order,
    }));

  return (
    <div className="kelune-crm-cc-tags-container">
      <ListPageHeader
        title={__('Tags', 'kelune-crm')}
        primaryAction={{
          label: __('Create Tag', 'kelune-crm'),
          onClick: handleCreate,
        }}
        onReload={loadTags}
      />

      <ListFilterCard
        search={filters.search}
        onSearchChange={(term) =>
          setFilters((prev) => ({ ...prev, search: term }))
        }
        searchPlaceholder={__('Search tags...', 'kelune-crm')}
        filterGroups={activeFilterGroups}
        onClearAll={sortActive ? clearAll : undefined}
        controls={
          <>
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
          editingTag
            ? __('Edit Tag', 'kelune-crm')
            : __('Create Tag', 'kelune-crm')
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={
          <ModalFooter
            onOk={() => form.submit()}
            onCancel={() => setModalVisible(false)}
            okText={
              editingTag
                ? __('Update', 'kelune-crm')
                : __('Create', 'kelune-crm')
            }
          />
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label={__('Tag Name', 'kelune-crm')}
            rules={[
              {
                required: true,
                message: __('Please enter tag name', 'kelune-crm'),
              },
            ]}
          >
            <Input placeholder={__('e.g., VIP Customer', 'kelune-crm')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={__('Description', 'kelune-crm')}
            style={{ marginBottom: 0 }}
          >
            <TextArea
              rows={3}
              placeholder={__('Describe this tag...', 'kelune-crm')}
            />
          </Form.Item>
          <SubmitOnEnter />
        </Form>
      </Modal>
    </div>
  );
};

export default Tags;
