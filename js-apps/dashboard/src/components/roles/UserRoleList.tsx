import React, { useCallback, useEffect, useState } from 'react';
import {
  Avatar,
  Button,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import type { Key } from 'react';
import { EditOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import api from '../../services/api';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../../store/slices/globalLoadingSlice';
import { getErrorMessage } from '@/utils/getErrorMessage';
import type { CrmRole, CrmUser } from '../../types/models';
import { useListState } from '../../hooks/useListState';
import { CAP, can } from '../../utils/capabilities';
import ModalFooter from '../common/ModalFooter';
import InlineSwitch from '../common/InlineSwitch';
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
  CHRONOLOGICAL_FIELDS,
  isSortActive,
  sortFieldLabel,
} from './userSortOptions';
import type { SortOrder } from './userSortOptions';
import { timeDiff, timeFormat } from '../../utils/time';

const { Text } = Typography;

interface VisibleColumn extends ColumnType<CrmUser> {
  visible?: boolean;
}

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  username: false,
  roles: true,
  crm_access: true,
  registered: false,
};

interface UsersView {
  search: string;
  role: string; // '' = every role
  sortField: string;
  sortOrder: SortOrder;
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
}

const DEFAULT_USERS_VIEW: UsersView = {
  search: '',
  role: '',
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
};

interface UserRoleListProps {
  roles: CrmRole[];
  multipleRolesEnabled: boolean;
  /** False when the current user may not promote users (WordPress capability). */
  canAssignUsers: boolean;
  /** Persists the multiple-roles setting; owned by the parent section. */
  onMultipleRolesChange: (enabled: boolean) => Promise<void> | void;
}

const UserRoleList = ({
  roles,
  multipleRolesEnabled,
  canAssignUsers,
  onMultipleRolesChange,
}: UserRoleListProps) => {
  const dispatch = useDispatch();
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CrmUser | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingMultiple, setPendingMultiple] = useState(multipleRolesEnabled);
  const [savingSettings, setSavingSettings] = useState(false);

  // Persisted view-state: search, filter, sort, page/limit and visible columns
  // survive reloads, like every other list page.
  const [view, updateView] = useListState<UsersView>(
    'roleUsers',
    DEFAULT_USERS_VIEW
  );
  const visibleColumns = view.columns;

  // Any filter/search/sort change resets to page 1.
  const setFilters = useCallback(
    (patch: Partial<UsersView>) => updateView({ ...patch, page: 1 }),
    [updateView]
  );

  const setVisibleColumns = useCallback(
    (columns: Record<string, boolean>) => updateView({ columns }),
    [updateView]
  );

  const roleName = useCallback(
    (slug: string) => roles.find((role) => role.slug === slug)?.name ?? slug,
    [roles]
  );

  const loadUsers = useCallback(async () => {
    setLoading(true);

    try {
      const response = await api.roles.getUsers({
        page: view.page,
        per_page: view.perPage,
        search: view.search,
        role: view.role,
        orderby: view.sortField,
        order: view.sortOrder,
      });
      setUsers(response.data || []);
      const headerTotal = Number(response.headers['x-wp-total']);
      setTotal(
        Number.isFinite(headerTotal)
          ? headerTotal
          : (response.data || []).length
      );
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to fetch users', 'kelune-crm'))
      );
    } finally {
      setLoading(false);
    }
  }, [
    view.page,
    view.perPage,
    view.search,
    view.role,
    view.sortField,
    view.sortOrder,
  ]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  /** WordPress decides who may be promoted; the row follows it. */
  const canEditUser = (user: CrmUser): boolean =>
    user.editable && canAssignUsers;

  const handleEdit = (user: CrmUser) => {
    setEditing(user);
    setSelectedRoles(
      multipleRolesEnabled ? user.roles : user.roles.slice(0, 1)
    );
  };

  const handleSubmit = async () => {
    if (!editing) {
      return;
    }

    setSaving(true);
    dispatch(startGlobalLoading());

    try {
      await api.roles.setUserRoles(editing.id, selectedRoles);
      message.success(__('User roles updated successfully', 'kelune-crm'));
      setEditing(null);
      loadUsers();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to update user roles', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
      setSaving(false);
    }
  };

  /** Apply a role change to every selected user, one request each. */
  const handleBulkRole = async (slug: string, add: boolean) => {
    const ids = selectedRowKeys as number[];
    const targets = users.filter((user) => ids.includes(user.id));

    dispatch(startGlobalLoading());

    try {
      await Promise.all(
        targets.map((user) => {
          if (!add) {
            return api.roles.setUserRoles(
              user.id,
              user.roles.filter((role) => role !== slug)
            );
          }

          // With multiple roles off a user holds one role, so adding replaces.
          const next = multipleRolesEnabled
            ? Array.from(new Set([...user.roles, slug]))
            : [slug];

          return api.roles.setUserRoles(user.id, next);
        })
      );

      message.success(
        sprintf(
          /* translators: %d: number of users updated */
          _n(
            '%d user updated',
            '%d users updated',
            targets.length,
            'kelune-crm'
          ),
          targets.length
        )
      );
      setSelectedRowKeys([]);
      loadUsers();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to update user roles', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkAction = (action: string, value: BulkActionValue) => {
    const slug = Array.isArray(value) ? String(value[0]) : String(value ?? '');

    if (!slug) {
      return;
    }

    if (action === 'add_role') {
      handleBulkRole(slug, true);
    } else if (action === 'remove_role') {
      handleBulkRole(slug, false);
    }
  };

  const openSettings = () => {
    setPendingMultiple(multipleRolesEnabled);
    setSettingsOpen(true);
  };

  const saveSettings = async () => {
    setSavingSettings(true);

    try {
      await onMultipleRolesChange(pendingMultiple);
      setSettingsOpen(false);
    } finally {
      setSavingSettings(false);
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
    // A user the current user may not edit cannot be bulk-assigned either.
    getCheckboxProps: (user: CrmUser) => ({
      disabled: !canEditUser(user),
    }),
  };

  const allColumns: VisibleColumn[] = [
    {
      title: __('User', 'kelune-crm'),
      key: 'user',
      visible: true,
      render: (_value, user) => (
        <Space size={12}>
          <Avatar size={36} src={user.avatar_url} icon={<UserOutlined />} />
          <div>
            <Text
              style={{
                fontWeight: 500,
                cursor: canEditUser(user) ? 'pointer' : 'default',
                display: 'block',
              }}
              onClick={() => {
                if (canEditUser(user)) {
                  handleEdit(user);
                }
              }}
            >
              {user.name}
            </Text>
            {user.email && (
              <div style={{ color: 'rgba(0, 0, 0, 0.60)', fontSize: 12 }}>
                {user.email}
              </div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: __('Username', 'kelune-crm'),
      dataIndex: 'username',
      key: 'username',
      visible: visibleColumns.username,
    },
    {
      title: __('Roles', 'kelune-crm'),
      key: 'roles',
      visible: visibleColumns.roles,
      render: (_value, user) =>
        user.roles.length > 0 ? (
          <>
            {user.roles.slice(0, 2).map((slug) => (
              <Tag bordered={false} key={slug}>
                {roleName(slug)}
              </Tag>
            ))}
            {user.roles.length > 2 && (
              <Tooltip title={user.roles.slice(2).map(roleName).join(', ')}>
                <Tag bordered={false} style={{ cursor: 'default' }}>
                  +{user.roles.length - 2}
                </Tag>
              </Tooltip>
            )}
          </>
        ) : (
          '-'
        ),
    },
    {
      title: __('CRM Access', 'kelune-crm'),
      key: 'crm_access',
      visible: visibleColumns.crm_access,
      render: (_value, user) => {
        if (user.is_administrator) {
          return (
            <Tag bordered={false} color="gold">
              {__('Full access', 'kelune-crm')}
            </Tag>
          );
        }

        if (user.crm_capabilities.length === 0) {
          return '-';
        }

        return (
          <Tag bordered={false} color="green">
            {sprintf(
              /* translators: %d: number of CRM permissions the user holds */
              __('%d permissions', 'kelune-crm'),
              user.crm_capabilities.length
            )}
          </Tag>
        );
      },
    },
    {
      title: __('Registered', 'kelune-crm'),
      dataIndex: 'registered',
      key: 'registered',
      visible: visibleColumns.registered,
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
      render: (_value, user) => (
        <Space>
          <Tooltip
            title={
              canEditUser(user)
                ? __('Edit roles', 'kelune-crm')
                : __('You cannot edit this user.', 'kelune-crm')
            }
          >
            <Button
              shape="default"
              size="small"
              icon={<EditOutlined />}
              disabled={!canEditUser(user)}
              onClick={() => handleEdit(user)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const columns = allColumns.filter(
    (column) => column.visible
  ) as ColumnsType<CrmUser>;

  const columnOptions = [
    { key: 'username', label: __('Username', 'kelune-crm') },
    { key: 'roles', label: __('Roles', 'kelune-crm') },
    { key: 'crm_access', label: __('CRM Access', 'kelune-crm') },
    { key: 'registered', label: __('Registered Date', 'kelune-crm') },
  ];

  // Filter drill-down config + value bag for the reusable ListFilterMenu.
  const filterMenuGroups: FilterMenuGroup[] = [
    {
      key: 'role',
      label: __('Role', 'kelune-crm'),
      mode: 'single',
      searchable: true,
      options: roles.map((role) => ({ value: role.slug, label: role.name })),
    },
  ];

  const filterMenuValue: FilterMenuValue = { role: view.role };

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

  if (view.role) {
    activeFilterGroups.push({
      label: __('Role', 'kelune-crm'),
      onClear: () => setFilters({ role: '' }),
      chips: [
        {
          key: `role-${view.role}`,
          label: roleName(view.role),
          onClose: () => setFilters({ role: '' }),
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

  const roleSelectOptions = roles.map((role) => ({
    value: role.slug,
    label: role.name,
  }));

  return (
    <>
      <ListPageHeader
        title={__('Users', 'kelune-crm')}
        onReload={loadUsers}
        primaryAction={
          // The switch saves through /settings, so it needs that capability.
          can(CAP.MANAGE_SETTINGS)
            ? {
                label: __('Settings', 'kelune-crm'),
                icon: <SettingOutlined />,
                onClick: openSettings,
              }
            : undefined
        }
      />

      <ListFilterCard
        search={view.search}
        onSearchChange={(term) => setFilters({ search: term })}
        searchPlaceholder={__('Search users...', 'kelune-crm')}
        filterGroups={activeFilterGroups}
        onClearAll={
          view.role || sortActive
            ? () =>
                setFilters({
                  role: '',
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
              onChange={(next) => setFilters({ role: String(next.role ?? '') })}
            />
            <ListSort
              value={{ field: view.sortField, order: view.sortOrder }}
              options={SORT_OPTIONS}
              defaultSort={DEFAULT_SORT}
              chronologicalFields={CHRONOLOGICAL_FIELDS}
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
            value: 'add_role',
            label: __('Assign Role', 'kelune-crm'),
            secondary: {
              placeholder: __('Select role', 'kelune-crm'),
              options: roleSelectOptions,
            },
          },
          {
            value: 'remove_role',
            label: __('Remove Role', 'kelune-crm'),
            secondary: {
              placeholder: __('Select role', 'kelune-crm'),
              options: roleSelectOptions,
            },
          },
        ]}
        onConfirm={handleBulkAction}
        onClear={() => setSelectedRowKeys([])}
      />

      <Table
        rowKey="id"
        rowSelection={rowSelection}
        loading={loading}
        columns={columns}
        dataSource={users}
        pagination={false}
        scroll={{ x: 'max-content' }}
        footer={() => (
          <ListTableFooter
            page={view.page}
            perPage={view.perPage}
            total={total}
            onChange={(page, perPage) => updateView({ page, perPage })}
          />
        )}
      />

      <Modal
        centered
        title={
          editing
            ? sprintf(
                /* translators: %s: user display name */
                __('Roles for %s', 'kelune-crm'),
                editing.name
              )
            : ''
        }
        open={editing !== null}
        onCancel={() => setEditing(null)}
        destroyOnHidden
        footer={
          <ModalFooter
            onCancel={() => setEditing(null)}
            onOk={handleSubmit}
            okText={__('Save', 'kelune-crm')}
            confirmLoading={saving}
          />
        }
      >
        <Select
          mode={multipleRolesEnabled ? 'multiple' : undefined}
          style={{ width: '100%' }}
          placeholder={__('Select a role', 'kelune-crm')}
          optionFilterProp="label"
          allowClear
          value={
            multipleRolesEnabled
              ? selectedRoles
              : (selectedRoles[0] ?? undefined)
          }
          onChange={(value: string | string[] | undefined) =>
            setSelectedRoles(
              value === undefined ? [] : Array.isArray(value) ? value : [value]
            )
          }
          options={roleSelectOptions}
        />
      </Modal>

      <Modal
        centered
        title={__('User Role Settings', 'kelune-crm')}
        open={settingsOpen}
        onCancel={() => setSettingsOpen(false)}
        destroyOnHidden
        footer={
          <ModalFooter
            onCancel={() => setSettingsOpen(false)}
            onOk={saveSettings}
            okText={__('Save', 'kelune-crm')}
            confirmLoading={savingSettings}
          />
        }
      >
        <InlineSwitch
          checked={pendingMultiple}
          onChange={setPendingMultiple}
          label={__('Allow multiple roles per user', 'kelune-crm')}
          tooltip={__(
            'A user holding several roles gets the combined permissions of all of them. Off means one role per user, as WordPress does by default.',
            'kelune-crm'
          )}
          style={{ marginBottom: 0 }}
        />
      </Modal>
    </>
  );
};

export default UserRoleList;
