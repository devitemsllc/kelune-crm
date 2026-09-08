import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Tabs, message } from 'antd';
import { TeamOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { __, sprintf } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import api from '@/services/api';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '@store/slices/globalLoadingSlice';
import { getErrorMessage } from '@/utils/getErrorMessage';
import type { CrmRole, RoleCapabilityGroup, RolePreset } from '@/types/models';
import RoleList from '@/components/roles/RoleList';
import UserRoleList from '@/components/roles/UserRoleList';

// The two tabs are real routes, so each is linkable and survives a reload.
const ROLES_PATH = '/settings/roles';
const USERS_PATH = '/settings/roles/users';

/**
 * Roles & Permissions: which roles exist, what each may do in the CRM, and who
 * holds them.
 */
const RolesPermissions = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const tab = location.pathname.startsWith(USERS_PATH) ? 'users' : 'roles';
  const [roles, setRoles] = useState<CrmRole[]>([]);
  const [groups, setGroups] = useState<RoleCapabilityGroup[]>([]);
  const [presets, setPresets] = useState<RolePreset[]>([]);
  const [multipleRolesEnabled, setMultipleRolesEnabled] = useState(false);
  const [canAssignUsers, setCanAssignUsers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    setLoading(true);

    try {
      const response = await api.roles.getAll();
      setRoles(response.data.roles ?? []);
      setGroups(response.data.capability_groups ?? []);
      setPresets(response.data.presets ?? []);
      setMultipleRolesEnabled(Boolean(response.data.multiple_roles_enabled));
      setCanAssignUsers(Boolean(response.data.can_assign_users));
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, __('Failed to load roles', 'kelune-crm')));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const setMultipleRoles = async (enabled: boolean) => {
    dispatch(startGlobalLoading());

    try {
      await api.settings.update({ multiple_user_roles_enabled: enabled });
      setMultipleRolesEnabled(enabled);
      message.success(__('Settings saved successfully', 'kelune-crm'));
    } catch (err) {
      message.error(
        getErrorMessage(err, __('Failed to save settings', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  return (
    <>
      {error ? (
        <Alert
          type="error"
          message={sprintf(
            /* translators: %s: error message */
            __('Could not load roles: %s', 'kelune-crm'),
            error
          )}
          style={{ marginBottom: 24, border: 'none' }}
        />
      ) : null}

      <Tabs
        activeKey={tab}
        tabBarStyle={{ marginBottom: 24 }}
        items={[
          {
            key: 'roles',
            label: (
              <Link to={ROLES_PATH} style={{ color: 'inherit' }}>
                <UnorderedListOutlined /> {__('Roles', 'kelune-crm')}
              </Link>
            ),
            children: (
              <RoleList
                roles={roles}
                groups={groups}
                presets={presets}
                loading={loading}
                onChanged={loadRoles}
              />
            ),
          },
          {
            key: 'users',
            label: (
              <Link to={USERS_PATH} style={{ color: 'inherit' }}>
                <TeamOutlined /> {__('Users', 'kelune-crm')}
              </Link>
            ),
            children: (
              <UserRoleList
                roles={roles}
                multipleRolesEnabled={multipleRolesEnabled}
                canAssignUsers={canAssignUsers}
                onMultipleRolesChange={setMultipleRoles}
              />
            ),
          },
        ]}
      />
    </>
  );
};

export default RolesPermissions;
