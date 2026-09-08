import React, { useCallback, useState } from 'react';
import {
  Button,
  Drawer,
  Form,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import type { Key } from 'react';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import api from '../../services/api';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../../store/slices/globalLoadingSlice';
import { getErrorMessage } from '@/utils/getErrorMessage';
import type {
  CrmRole,
  RoleCapabilityGroup,
  RolePreset,
} from '../../types/models';
import { CAP } from '../../utils/capabilities';
import { useListState } from '../../hooks/useListState';
import ActionConfirm from '../common/ActionConfirm';
import ModalFooter from '../common/ModalFooter';
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
import type {
  FilterGroup,
  FilterMenuGroup,
  FilterMenuValue,
} from '../common/list';
import {
  DEFAULT_SORT,
  SORT_OPTIONS,
  NUMERIC_FIELDS,
  isSortActive,
  sortFieldLabel,
} from './roleSortOptions';
import type { SortOrder } from './roleSortOptions';
import RoleForm from './RoleForm';
import type { RoleFormValues } from './RoleForm';

const { Text } = Typography;

interface VisibleColumn extends ColumnType<CrmRole> {
  visible?: boolean;
}

const TYPE_OPTIONS = [
  { value: 'built_in', label: __('Built-in', 'kelune-crm') },
  { value: 'custom', label: __('Custom', 'kelune-crm') },
  { value: 'wordpress', label: __('WordPress', 'kelune-crm') },
];

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  type: true,
  permissions: true,
  users: true,
};

interface RolesView {
  search: string;
  type: string; // '' = every type
  sortField: string;
  sortOrder: SortOrder;
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
}

const DEFAULT_ROLES_VIEW: RolesView = {
  search: '',
  type: '',
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
};

const typeOf = (role: CrmRole): string => {
  if (role.is_built_in) {
    return 'built_in';
  }

  return role.is_crm_role ? 'custom' : 'wordpress';
};

const typeLabel = (type: string): string =>
  TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;

/** Only a custom role this plugin created may be deleted. */
const isDeletable = (role: CrmRole): boolean =>
  role.is_crm_role && !role.is_built_in;

interface RoleListProps {
  roles: CrmRole[];
  groups: RoleCapabilityGroup[];
  presets: RolePreset[];
  loading: boolean;
  onChanged: () => Promise<void> | void;
}

const RoleList = ({
  roles,
  groups,
  presets,
  loading,
  onChanged,
}: RoleListProps) => {
  const dispatch = useDispatch();
  const [form] = Form.useForm<RoleFormValues>();
  const [editing, setEditing] = useState<CrmRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);

  // Persisted view-state: search, filter, sort, page/limit and visible columns
  // survive reloads, like every other list page.
  const [view, updateView] = useListState<RolesView>(
    'roles',
    DEFAULT_ROLES_VIEW
  );
  const visibleColumns = view.columns;

  // Any filter/search/sort change resets to page 1.
  const setFilters = useCallback(
    (patch: Partial<RolesView>) => updateView({ ...patch, page: 1 }),
    [updateView]
  );

  const setVisibleColumns = useCallback(
    (columns: Record<string, boolean>) => updateView({ columns }),
    [updateView]
  );

  const totalCapabilities = groups.reduce(
    (count, group) => count + Object.keys(group.capabilities).length,
    0
  );

  const drawerOpen = creating || editing !== null;

  const closeDrawer = () => {
    setEditing(null);
    setCreating(false);
  };

  const save = async (values: RoleFormValues) => {
    // A role that can do anything in the CRM needs to be able to open it.
    const capabilities =
      values.capabilities.length > 0
        ? Array.from(new Set([...values.capabilities, CAP.ACCESS]))
        : [];

    setSaving(true);
    dispatch(startGlobalLoading());

    try {
      if (editing) {
        await api.roles.update(editing.slug, {
          name: values.name,
          capabilities,
        });
        message.success(__('Role updated successfully', 'kelune-crm'));
      } else {
        await api.roles.create({ name: values.name, capabilities });
        message.success(__('Role created successfully', 'kelune-crm'));
      }

      closeDrawer();
      await onChanged();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to save role', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
      setSaving(false);
    }
  };

  const handleDelete = async (role: CrmRole) => {
    dispatch(startGlobalLoading());

    try {
      await api.roles.delete(role.slug);
      message.success(__('Role deleted successfully', 'kelune-crm'));
      await onChanged();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete role', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkDelete = async () => {
    const slugs = selectedRowKeys as string[];
    dispatch(startGlobalLoading());

    try {
      // One at a time: every role lives in the same `wp_user_roles` option, so
      // parallel deletes overwrite each other and only the last one sticks.
      for (const slug of slugs) {
        await api.roles.delete(slug);
      }

      message.success(
        sprintf(
          /* translators: %d: number of roles deleted */
          _n('%d role deleted', '%d roles deleted', slugs.length, 'kelune-crm'),
          slugs.length
        )
      );
      setSelectedRowKeys([]);
      await onChanged();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete roles', 'kelune-crm'))
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

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
    // Built-in and WordPress roles cannot be deleted, so they cannot be picked.
    getCheckboxProps: (role: CrmRole) => ({ disabled: !isDeletable(role) }),
  };

  const allColumns: VisibleColumn[] = [
    {
      title: __('Role', 'kelune-crm'),
      key: 'role',
      visible: true,
      render: (_value, role) => (
        <div>
          <Text
            style={{
              fontWeight: 500,
              display: 'block',
              cursor: role.is_administrator ? 'default' : 'pointer',
            }}
            onClick={() => {
              if (!role.is_administrator) {
                setEditing(role);
              }
            }}
          >
            {role.name}
          </Text>
          <div style={{ color: 'rgba(0, 0, 0, 0.60)', fontSize: 12 }}>
            {role.slug}
          </div>
        </div>
      ),
    },
    {
      title: __('Type', 'kelune-crm'),
      key: 'type',
      visible: visibleColumns.type,
      render: (_value, role) => (
        <Tag bordered={false} color={role.is_crm_role ? 'blue' : 'purple'}>
          {typeLabel(typeOf(role))}
        </Tag>
      ),
    },
    {
      title: __('Permissions', 'kelune-crm'),
      key: 'permissions',
      visible: visibleColumns.permissions,
      align: 'center',
      render: (_value, role) =>
        role.is_administrator
          ? __('All', 'kelune-crm')
          : sprintf(
              /* translators: 1: granted permission count, 2: total permission count */
              __('%1$d of %2$d', 'kelune-crm'),
              role.capabilities.length,
              totalCapabilities
            ),
    },
    {
      title: __('Users', 'kelune-crm'),
      key: 'users',
      visible: visibleColumns.users,
      align: 'center',
      render: (_value, role) => role.users_count || 0,
    },
    {
      title: __('Actions', 'kelune-crm'),
      key: 'actions',
      visible: true,
      align: 'right',
      render: (_value, role) => (
        <Space>
          <Tooltip
            title={
              role.is_administrator
                ? __(
                    'Administrators always hold every permission.',
                    'kelune-crm'
                  )
                : __('Edit', 'kelune-crm')
            }
          >
            <Button
              shape="default"
              size="small"
              icon={<EditOutlined />}
              disabled={role.is_administrator}
              onClick={() => setEditing(role)}
            />
          </Tooltip>
          {isDeletable(role) ? (
            <ActionConfirm
              action="delete"
              customDescription={__(
                'Deleting this role removes it from everyone who holds it.',
                'kelune-crm'
              )}
              onConfirm={() => handleDelete(role)}
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
          ) : null}
        </Space>
      ),
    },
  ];

  const columns = allColumns.filter(
    (column) => column.visible
  ) as ColumnsType<CrmRole>;

  const columnOptions = [
    { key: 'type', label: __('Type', 'kelune-crm') },
    { key: 'permissions', label: __('Permissions', 'kelune-crm') },
    { key: 'users', label: __('Users', 'kelune-crm') },
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

  const filterMenuValue: FilterMenuValue = { type: view.type };

  const sortActive = isSortActive({
    field: view.sortField,
    order: view.sortOrder,
  });

  const resetSort = () =>
    setFilters({
      sortField: DEFAULT_SORT.field,
      sortOrder: DEFAULT_SORT.order,
    });

  // Active-filter chip groups shown on the filter card's second row.
  const activeFilterGroups: FilterGroup[] = [];

  if (view.type) {
    activeFilterGroups.push({
      label: __('Type', 'kelune-crm'),
      onClear: () => setFilters({ type: '' }),
      chips: [
        {
          key: `type-${view.type}`,
          label: typeLabel(view.type),
          onClose: () => setFilters({ type: '' }),
        },
      ],
    });
  }

  if (sortActive) {
    activeFilterGroups.push({
      label: __('Sort', 'kelune-crm'),
      onClear: resetSort,
      chips: [
        {
          key: `sort-${view.sortField}-${view.sortOrder}`,
          label: sortFieldLabel(view.sortField),
          onClose: resetSort,
        },
      ],
    });
  }

  // The whole role set arrives in one request (a site has a handful of roles),
  // so search, filtering, sorting and paging all happen here.
  const term = view.search.trim().toLowerCase();

  const matched = roles.filter((role) => {
    if (view.type && typeOf(role) !== view.type) {
      return false;
    }

    return (
      term === '' ||
      role.name.toLowerCase().includes(term) ||
      role.slug.toLowerCase().includes(term)
    );
  });

  const sorted = [...matched].sort((a, b) => {
    let diff = 0;

    if (view.sortField === 'permissions') {
      diff = a.capabilities.length - b.capabilities.length;
    } else if (view.sortField === 'users') {
      diff = a.users_count - b.users_count;
    } else if (view.sortField === 'slug') {
      diff = a.slug.localeCompare(b.slug);
    } else {
      diff = a.name.localeCompare(b.name);
    }

    // Name A-Z breaks every tie, so equal counts stay in a readable order.
    return diff === 0
      ? a.name.localeCompare(b.name)
      : view.sortOrder === 'ASC'
        ? diff
        : -diff;
  });

  // Deleting the last row of a page would otherwise strand the table on a page
  // that no longer exists.
  const page = Math.min(
    view.page,
    Math.max(1, Math.ceil(sorted.length / view.perPage))
  );
  const paged = sorted.slice((page - 1) * view.perPage, page * view.perPage);

  return (
    <>
      <ListPageHeader
        title={__('Roles', 'kelune-crm')}
        primaryAction={{
          label: __('Create Role', 'kelune-crm'),
          onClick: () => setCreating(true),
        }}
        onReload={onChanged}
      />

      <ListFilterCard
        search={view.search}
        onSearchChange={(nextTerm) => setFilters({ search: nextTerm })}
        searchPlaceholder={__('Search roles...', 'kelune-crm')}
        filterGroups={activeFilterGroups}
        onClearAll={
          view.type || sortActive
            ? () =>
                setFilters({
                  type: '',
                  sortField: DEFAULT_SORT.field,
                  sortOrder: DEFAULT_SORT.order,
                })
            : undefined
        }
        controls={
          <>
            <ListFilterMenu
              groups={filterMenuGroups}
              value={filterMenuValue}
              onChange={(next) => setFilters({ type: String(next.type ?? '') })}
            />
            <ListSort
              value={{ field: view.sortField, order: view.sortOrder }}
              options={SORT_OPTIONS}
              defaultSort={DEFAULT_SORT}
              numericFields={NUMERIC_FIELDS}
              onChange={(next) =>
                setFilters({ sortField: next.field, sortOrder: next.order })
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
        rowKey="slug"
        rowSelection={rowSelection}
        loading={loading}
        columns={columns}
        dataSource={paged}
        pagination={false}
        scroll={{ x: 'max-content' }}
        footer={() => (
          <ListTableFooter
            page={page}
            perPage={view.perPage}
            total={sorted.length}
            onChange={(nextPage, perPage) =>
              updateView({ page: nextPage, perPage })
            }
          />
        )}
      />

      <Drawer
        title={
          editing
            ? sprintf(
                /* translators: %s: role name */
                __('Edit %s', 'kelune-crm'),
                editing.name
              )
            : __('Create Role', 'kelune-crm')
        }
        width={640}
        open={drawerOpen}
        onClose={closeDrawer}
        destroyOnHidden
        footer={
          <ModalFooter
            onCancel={closeDrawer}
            onOk={() => form.submit()}
            okText={
              editing ? __('Update', 'kelune-crm') : __('Create', 'kelune-crm')
            }
            confirmLoading={saving}
          />
        }
      >
        <RoleForm
          form={form}
          groups={groups}
          presets={presets}
          role={editing}
          onFinish={save}
        />
      </Drawer>
    </>
  );
};

export default RoleList;
