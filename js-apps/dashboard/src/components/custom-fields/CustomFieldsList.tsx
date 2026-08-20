import React, { useCallback, useEffect, useState } from 'react';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { Table, Button, Space, Tag, message, Tooltip, Typography } from 'antd';
import { EditOutlined, DeleteOutlined, MenuOutlined } from '@ant-design/icons';
import { DndContext } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { __, _n, sprintf } from '@wordpress/i18n';
import type { Key } from 'react';
import CustomFieldForm from './CustomFieldForm';
import { useDispatch } from '@store/hooks';
import api from '../../services/api';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../../store/slices/globalLoadingSlice';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { useListState } from '../../hooks/useListState';
import ActionConfirm from '../common/ActionConfirm';
import BulkActionsBar from '../common/BulkActionsBar';
import type { BulkActionValue } from '../common/BulkActionsBar';
import {
  ListPageHeader,
  ListFilterCard,
  ListFilterMenu,
  ColumnsButton,
  ListTableFooter,
} from '../common/list';
import type {
  FilterGroup,
  FilterMenuGroup,
  FilterMenuValue,
} from '../common/list';
import { timeDiff, timeFormat } from '../../utils/time';

const { Text } = Typography;

/** Custom field definition row (GET /custom-fields). */
interface CustomField {
  id: number;
  field_label?: string;
  field_key?: string;
  field_type?: string;
  field_required?: number;
  field_order?: number;
  created_at?: string;
}

/** Single field order entry sent to POST /custom-fields/reorder. */
interface FieldOrder {
  id: number;
  field_order: number;
}

interface VisibleColumn extends ColumnType<CustomField> {
  visible?: boolean;
}

// Field types the entity supports (mirrors CustomField::$valid_types and the
// create/edit form). Used for both the Type filter and the Type badge label.
const FIELD_TYPE_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'text', label: __('Text', 'kelune-crm'), color: 'blue' },
  {
    value: 'textarea',
    label: __('Textarea', 'kelune-crm'),
    color: 'blue',
  },
  { value: 'number', label: __('Number', 'kelune-crm'), color: 'cyan' },
  { value: 'email', label: __('Email', 'kelune-crm'), color: 'purple' },
  { value: 'url', label: __('URL', 'kelune-crm'), color: 'purple' },
  { value: 'phone', label: __('Phone', 'kelune-crm'), color: 'purple' },
  { value: 'select', label: __('Select', 'kelune-crm'), color: 'green' },
  { value: 'radio', label: __('Radio', 'kelune-crm'), color: 'green' },
  {
    value: 'checkbox',
    label: __('Checkbox', 'kelune-crm'),
    color: 'green',
  },
  { value: 'date', label: __('Date', 'kelune-crm'), color: 'orange' },
  {
    value: 'datetime',
    label: __('DateTime', 'kelune-crm'),
    color: 'orange',
  },
];

const REQUIRED_OPTIONS = [
  { value: '1', label: __('Required', 'kelune-crm') },
  { value: '0', label: __('Optional', 'kelune-crm') },
];

// Persisted view-state shape for the custom-fields page. Stored (with other
// list pages) under one localStorage object via useListState('customFields').
// No sort field: this page keeps drag-to-reorder (field_order) as its ordering
// mechanism, so the list is always shown in field_order and column sorting is
// intentionally omitted.
interface CustomFieldsView {
  search: string;
  fieldType: string; // '' = all
  required: string; // '' | '0' | '1'
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
}

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  field_type: true,
  field_required: true,
  field_order: true,
  created: false,
};

// Large default page size so drag-to-reorder covers the full set on one page
// (reorder writes field_order for the visible rows only).
const DEFAULT_CUSTOM_FIELDS_VIEW: CustomFieldsView = {
  search: '',
  fieldType: '',
  required: '',
  page: 1,
  perPage: 100,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
};

interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  'data-row-key': string;
}

// Sortable table row — the drag handle lives in the cell keyed 'drag'.
const Row = (props: RowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: props['data-row-key'],
  });

  const style: React.CSSProperties = {
    ...props.style,
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999 } : {}),
  };

  return (
    <tr {...props} ref={setNodeRef} style={style} {...attributes}>
      {React.Children.map(props.children, (child) => {
        if (React.isValidElement(child) && child.key === 'drag') {
          return React.cloneElement(
            child as React.ReactElement<{ children?: React.ReactNode }>,
            {
              children: (
                <MenuOutlined
                  ref={setActivatorNodeRef}
                  style={{ touchAction: 'none', cursor: 'move', color: '#999' }}
                  {...listeners}
                />
              ),
            }
          );
        }
        return child;
      })}
    </tr>
  );
};

const CustomFieldsList = () => {
  const dispatch = useDispatch();
  const [fields, setFields] = useState<CustomField[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [formVisible, setFormVisible] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);

  // Persisted view-state: search, filters, page/limit and visible columns are
  // all kept in localStorage so they survive reloads and direct visits.
  const [view, updateView] = useListState<CustomFieldsView>(
    'customFields',
    DEFAULT_CUSTOM_FIELDS_VIEW
  );

  const filters = view;
  const visibleColumns = view.columns;

  // Any filter/search change resets to page 1.
  const setFilters = useCallback(
    (
      updater:
        | Partial<CustomFieldsView>
        | ((prev: CustomFieldsView) => CustomFieldsView)
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

  const loadFields = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<CustomField[]>('/custom-fields', {
        params: {
          page: view.page,
          per_page: view.perPage,
          search: view.search,
          field_type: view.fieldType,
          required: view.required,
        },
      });
      setFields(response.data || []);
      const headerTotal = parseInt(response.headers['x-wp-total'] || '', 10);
      setTotal(
        Number.isFinite(headerTotal)
          ? headerTotal
          : (response.data || []).length
      );
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to load custom fields', 'kelune-crm'))
      );
    } finally {
      setLoading(false);
    }
  }, [view.page, view.perPage, view.search, view.fieldType, view.required]);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  const handleReload = () => {
    loadFields();
  };

  const handleCreate = () => {
    setEditingField(null);
    setFormVisible(true);
  };

  const handleEdit = (field: CustomField) => {
    setEditingField(field);
    setFormVisible(true);
  };

  const handleDelete = async (id: number) => {
    dispatch(startGlobalLoading());
    try {
      await api.delete(`/custom-fields/${id}`);
      message.success(__('Custom field deleted successfully', 'kelune-crm'));
      loadFields();
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to delete custom field', 'kelune-crm')
        )
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as number[];
    dispatch(startGlobalLoading());
    try {
      await Promise.all(ids.map((id) => api.delete(`/custom-fields/${id}`)));
      message.success(
        sprintf(
          // translators: %d: number of custom fields deleted
          _n(
            '%d custom field deleted',
            '%d custom fields deleted',
            ids.length,
            'kelune-crm'
          ),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      loadFields();
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to delete custom fields', 'kelune-crm')
        )
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

  const saveFieldOrder = useCallback(
    async (orders: FieldOrder[]) => {
      dispatch(startGlobalLoading());
      try {
        await api.post('/custom-fields/reorder', { orders });
        message.success(__('Field order updated successfully', 'kelune-crm'));
      } catch (error) {
        message.error(__('Failed to update field order', 'kelune-crm'));
        loadFields(); // Reload on error to restore correct order
      } finally {
        dispatch(stopGlobalLoading());
      }
    },
    [dispatch, loadFields]
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (active.id !== over?.id) {
      setFields((previous) => {
        const activeIndex = previous.findIndex((i) => i.id === active.id);
        const overIndex = previous.findIndex((i) => i.id === over?.id);
        const newFields = arrayMove(previous, activeIndex, overIndex);

        const updatedFields: CustomField[] = newFields.map((field, index) => ({
          ...field,
          field_order: index + 1,
        }));

        saveFieldOrder(
          updatedFields.map((field) => ({
            id: field.id,
            field_order: field.field_order ?? 0,
          }))
        );

        return updatedFields;
      });
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
  };

  const fieldTypeTag = (type: string | undefined) => {
    const config = FIELD_TYPE_OPTIONS.find((t) => t.value === type);
    return (
      <Tag bordered={false} color={config?.color ?? 'default'}>
        {config?.label ?? type}
      </Tag>
    );
  };

  const allColumns: VisibleColumn[] = [
    {
      title: '',
      key: 'drag',
      visible: true,
      width: 40,
      render: () => null, // Handled by the sortable Row component.
    },
    {
      title: __('Field Label', 'kelune-crm'),
      key: 'field_label',
      visible: true,
      render: (_, record) => (
        <div>
          <Text
            style={{ fontWeight: 500, cursor: 'pointer', display: 'block' }}
            onClick={() => handleEdit(record)}
          >
            {record.field_label || __('(untitled)', 'kelune-crm')}
          </Text>
          <div style={{ color: 'rgba(0, 0, 0, 0.60)', fontSize: 12 }}>
            {sprintf(
              // translators: %s: custom field key
              __('Key: %s', 'kelune-crm'),
              record.field_key ?? ''
            )}
          </div>
        </div>
      ),
    },
    {
      title: __('Type', 'kelune-crm'),
      dataIndex: 'field_type',
      key: 'field_type',
      visible: visibleColumns.field_type,
      render: (type: string | undefined) => fieldTypeTag(type),
    },
    {
      title: __('Required', 'kelune-crm'),
      dataIndex: 'field_required',
      key: 'field_required',
      visible: visibleColumns.field_required,
      render: (required: number | undefined) =>
        required ? (
          <Tag bordered={false} color="red">
            {__('Required', 'kelune-crm')}
          </Tag>
        ) : (
          <Tag bordered={false}>{__('Optional', 'kelune-crm')}</Tag>
        ),
    },
    {
      title: __('Order', 'kelune-crm'),
      dataIndex: 'field_order',
      key: 'field_order',
      visible: visibleColumns.field_order,
      align: 'center',
      render: (order: number | undefined) => order ?? 0,
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
  ) as ColumnsType<CustomField>;

  const columnOptions = [
    { key: 'field_type', label: __('Type', 'kelune-crm') },
    { key: 'field_required', label: __('Required', 'kelune-crm') },
    { key: 'field_order', label: __('Order', 'kelune-crm') },
    { key: 'created', label: __('Created Date', 'kelune-crm') },
  ];

  // Filter drill-down config + value bag for the reusable ListFilterMenu.
  const filterMenuGroups: FilterMenuGroup[] = [
    {
      key: 'fieldType',
      label: __('Type', 'kelune-crm'),
      mode: 'single',
      options: FIELD_TYPE_OPTIONS.map((t) => ({
        value: t.value,
        label: t.label,
      })),
    },
    {
      key: 'required',
      label: __('Required', 'kelune-crm'),
      mode: 'single',
      options: REQUIRED_OPTIONS,
    },
  ];

  const filterMenuValue: FilterMenuValue = {
    fieldType: filters.fieldType,
    required: filters.required,
  };

  // Active-filter chip groups shown on the filter card's second row.
  const typeLabel = (val: string) =>
    FIELD_TYPE_OPTIONS.find((t) => t.value === val)?.label ?? val;
  const requiredLabel = (val: string) =>
    REQUIRED_OPTIONS.find((o) => o.value === val)?.label ?? val;

  const activeFilterGroups: FilterGroup[] = [];

  if (filters.fieldType) {
    activeFilterGroups.push({
      label: __('Type', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, fieldType: '' })),
      chips: [
        {
          key: `type-${filters.fieldType}`,
          label: typeLabel(filters.fieldType),
          onClose: () => setFilters((prev) => ({ ...prev, fieldType: '' })),
        },
      ],
    });
  }
  if (filters.required) {
    activeFilterGroups.push({
      label: __('Required', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, required: '' })),
      chips: [
        {
          key: `required-${filters.required}`,
          label: requiredLabel(filters.required),
          onClose: () => setFilters((prev) => ({ ...prev, required: '' })),
        },
      ],
    });
  }
  // Global "Clear All" resets filters (search + columns untouched). This page
  // has no active sort to reset (column sorting is intentionally omitted).
  const hasFilters = Boolean(filters.fieldType || filters.required);
  const clearAll = () =>
    setFilters((prev) => ({
      ...prev,
      fieldType: '',
      required: '',
    }));

  return (
    <div className="kelune-crm-cc-custom-fields-container">
      <ListPageHeader
        title={__('Custom Fields', 'kelune-crm')}
        primaryAction={{
          label: __('Create Custom Field', 'kelune-crm'),
          onClick: handleCreate,
        }}
        onReload={handleReload}
      />

      <ListFilterCard
        search={filters.search}
        onSearchChange={(term) =>
          setFilters((prev) => ({ ...prev, search: term }))
        }
        searchPlaceholder={__('Search custom fields...', 'kelune-crm')}
        filterGroups={activeFilterGroups}
        onClearAll={hasFilters ? clearAll : undefined}
        controls={
          <>
            <ListFilterMenu
              groups={filterMenuGroups}
              value={filterMenuValue}
              onChange={(next) =>
                setFilters((prev) => ({
                  ...prev,
                  fieldType: next.fieldType as string,
                  required: next.required as string,
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

      <DndContext modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
        <SortableContext
          items={fields.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <Table
            rowSelection={rowSelection}
            columns={columns}
            dataSource={fields}
            rowKey="id"
            loading={loading}
            scroll={{ x: 'max-content' }}
            pagination={false}
            components={{ body: { row: Row } }}
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
        </SortableContext>
      </DndContext>

      <CustomFieldForm
        visible={formVisible}
        onCancel={() => {
          setFormVisible(false);
          setEditingField(null);
        }}
        editingField={editingField}
        onSuccess={() => {
          loadFields();
          setFormVisible(false);
          setEditingField(null);
        }}
      />
    </div>
  );
};

export default CustomFieldsList;
