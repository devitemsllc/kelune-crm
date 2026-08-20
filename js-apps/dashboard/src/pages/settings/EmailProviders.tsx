import { useEffect, useState, useCallback } from 'react';
import {
  Table,
  Button,
  Space,
  Drawer,
  Form,
  Input,
  Select,
  Switch,
  Tag,
  Tooltip,
  message,
  Typography,
  Divider,
  Alert,
  Modal,
  Descriptions,
  Spin,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  ThunderboltOutlined,
  StarFilled,
  StarOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import type { Key } from 'react';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import api from '../../services/api';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../../store/slices/globalLoadingSlice';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { useListState } from '../../hooks/useListState';
import { timeDiff, timeFormat } from '../../utils/time';
import ActionConfirm from '../../components/common/ActionConfirm';
import InlineSwitch from '../../components/common/InlineSwitch';
import ModalFooter from '../../components/common/ModalFooter';
import BulkActionsBar from '../../components/common/BulkActionsBar';
import type { BulkActionValue } from '../../components/common/BulkActionsBar';
import {
  ListPageHeader,
  ListFilterCard,
  ListFilterMenu,
  ListSort,
  ColumnsButton,
  ListTableFooter,
} from '../../components/common/list';
import type {
  FilterGroup,
  FilterMenuGroup,
  FilterMenuValue,
} from '../../components/common/list';
import {
  DEFAULT_SORT,
  SORT_OPTIONS,
  CHRONOLOGICAL_FIELDS,
  NUMERIC_FIELDS,
  isSortActive,
  sortFieldLabel,
} from './emailProviderSortOptions';
import type { SortOrder } from './emailProviderSortOptions';
import type { EmailProvider, EmailProviderType, ID } from '@/types/models';
import SubmitOnEnter from '../../components/common/SubmitOnEnter';
import { formSectionDivider } from '@/utils/formStyles';

const { Text } = Typography;
const { Option } = Select;

interface VisibleColumn extends ColumnType<EmailProvider> {
  visible?: boolean;
}

interface ProviderTypeMeta {
  label: string;
  color: string;
  /** Helper text shown under the credential block. */
  hint: string;
}

// Insertion order drives the dropdown + filter order: SMTP, Amazon SES,
// Mailgun, SendGrid.
const PROVIDER_META: Record<EmailProviderType, ProviderTypeMeta> = {
  smtp: {
    label: __('SMTP', 'kelune-crm'),
    color: 'blue',
    hint: __(
      'Any SMTP server (Gmail, Postmark, your host, etc.).',
      'kelune-crm'
    ),
  },
  ses: {
    label: __('Amazon SES', 'kelune-crm'),
    color: 'orange',
    hint: __(
      'Create IAM credentials with SES sending permissions from the AWS Console. The sender email must be a verified SES identity.',
      'kelune-crm'
    ),
  },
  mailgun: {
    label: __('Mailgun', 'kelune-crm'),
    color: 'red',
    hint: __(
      'The sender email must be on your verified Mailgun domain.',
      'kelune-crm'
    ),
  },
  sendgrid: {
    label: __('SendGrid', 'kelune-crm'),
    color: 'cyan',
    hint: __(
      'The sender email must be a verified SendGrid sender.',
      'kelune-crm'
    ),
  },
};

const PROVIDER_TYPE_OPTIONS = (
  Object.keys(PROVIDER_META) as EmailProviderType[]
).map((type) => ({ value: type, label: PROVIDER_META[type].label }));

const STATUS_OPTIONS = [
  { value: 'active', label: __('Active', 'kelune-crm') },
  { value: 'inactive', label: __('Inactive', 'kelune-crm') },
];

const SES_REGIONS: { value: string; label: string }[] = [
  {
    value: 'us-east-1',
    label: __('US East (N. Virginia)', 'kelune-crm'),
  },
  { value: 'us-east-2', label: __('US East (Ohio)', 'kelune-crm') },
  {
    value: 'us-west-1',
    label: __('US West (N. California)', 'kelune-crm'),
  },
  { value: 'us-west-2', label: __('US West (Oregon)', 'kelune-crm') },
  { value: 'af-south-1', label: __('Africa (Cape Town)', 'kelune-crm') },
  {
    value: 'ap-south-1',
    label: __('Asia Pacific (Mumbai)', 'kelune-crm'),
  },
  {
    value: 'ap-northeast-1',
    label: __('Asia Pacific (Tokyo)', 'kelune-crm'),
  },
  {
    value: 'ap-northeast-2',
    label: __('Asia Pacific (Seoul)', 'kelune-crm'),
  },
  {
    value: 'ap-northeast-3',
    label: __('Asia Pacific (Osaka)', 'kelune-crm'),
  },
  {
    value: 'ap-southeast-1',
    label: __('Asia Pacific (Singapore)', 'kelune-crm'),
  },
  {
    value: 'ap-southeast-2',
    label: __('Asia Pacific (Sydney)', 'kelune-crm'),
  },
  { value: 'ca-central-1', label: __('Canada (Central)', 'kelune-crm') },
  { value: 'eu-west-1', label: __('EU (Ireland)', 'kelune-crm') },
  { value: 'eu-west-2', label: __('EU (London)', 'kelune-crm') },
  { value: 'eu-west-3', label: __('EU (Paris)', 'kelune-crm') },
  { value: 'eu-central-1', label: __('EU (Frankfurt)', 'kelune-crm') },
  { value: 'eu-north-1', label: __('EU (Stockholm)', 'kelune-crm') },
  { value: 'eu-south-1', label: __('EU (Milan)', 'kelune-crm') },
  {
    value: 'me-south-1',
    label: __('Middle East (Bahrain)', 'kelune-crm'),
  },
  {
    value: 'sa-east-1',
    label: __('South America (São Paulo)', 'kelune-crm'),
  },
  {
    value: 'us-gov-west-1',
    label: __('AWS GovCloud (US-West)', 'kelune-crm'),
  },
];

// Per-provider option flags as STORED (settings JSON): 'yes' | 'no' strings.
// This is the wire shape sent to / received from the API.
interface ProviderSettings {
  force_from_name?: 'yes' | 'no';
  force_from_email?: 'yes' | 'no';
  return_path?: 'yes' | 'no';
  smtp_auto_tls?: 'yes' | 'no';
}

// The same flags as the FORM holds them: booleans, so they bind directly to the
// InlineSwitch (valuePropName="checked"). Mapped to/from ProviderSettings on
// load and save.
interface ProviderFormSettings {
  force_from_name?: boolean;
  force_from_email?: boolean;
  return_path?: boolean;
  smtp_auto_tls?: boolean;
}

// Shape the form works with — credentials are flattened so AntD can bind them.
interface ProviderFormValues {
  name?: string;
  provider_type?: EmailProviderType;
  sender_name?: string;
  sender_email?: string;
  reply_to?: string;
  region?: string;
  is_default?: boolean;
  status?: 'active' | 'inactive';
  credentials?: Record<string, string | number>;
  settings?: ProviderFormSettings;
}

// Connection Details payload (GET /email-providers/{id}/connection-details).
interface ConnectionDetails {
  provider_type: EmailProviderType;
  provider_label: string;
  sender_email: string;
  sender_name: string;
  force_from_name: boolean;
  valid_senders: string[];
  manual_senders: string[];
  verified_domains: string[];
  can_add_senders: boolean;
  stats: { max_24h: number; sent_24h: number; max_rate: number } | null;
}

// Persisted view-state shape for the email providers list. Stored (with the
// other list pages) under one localStorage object via useListState.
interface EmailProvidersView {
  search: string;
  provider_type: string;
  status: string;
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
  sortField: string;
  sortOrder: SortOrder;
}

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  provider_type: true,
  status: true,
  reply_to: false,
  created: false,
  updated: false,
};

const DEFAULT_PROVIDERS_VIEW: EmailProvidersView = {
  search: '',
  provider_type: '',
  status: '',
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
};

// Defaults for a new connection: don't force the display name, but force the From
// address to the connection's verified sender, set the envelope Return-Path, and
// keep opportunistic TLS on.
const DEFAULT_SETTINGS: ProviderFormSettings = {
  force_from_name: false,
  force_from_email: true,
  return_path: true,
  smtp_auto_tls: true,
};

// Map stored 'yes'|'no' flags to the form's booleans, applying the defaults for
// any flag a saved connection doesn't carry yet.
const toFormSettings = (stored?: ProviderSettings): ProviderFormSettings => {
  const s = stored ?? {};
  const bool = (value: 'yes' | 'no' | undefined, fallback: boolean): boolean =>
    value === undefined ? fallback : value === 'yes';
  return {
    force_from_name: bool(
      s.force_from_name,
      !!DEFAULT_SETTINGS.force_from_name
    ),
    force_from_email: bool(
      s.force_from_email,
      !!DEFAULT_SETTINGS.force_from_email
    ),
    return_path: bool(s.return_path, !!DEFAULT_SETTINGS.return_path),
    smtp_auto_tls: bool(s.smtp_auto_tls, !!DEFAULT_SETTINGS.smtp_auto_tls),
  };
};

// Map the form's booleans back to the stored 'yes'|'no' wire shape.
const toWireSettings = (form?: ProviderFormSettings): ProviderSettings => {
  const s = form ?? {};
  const yn = (value?: boolean): 'yes' | 'no' => (value ? 'yes' : 'no');
  return {
    force_from_name: yn(s.force_from_name),
    force_from_email: yn(s.force_from_email),
    return_path: yn(s.return_path),
    smtp_auto_tls: yn(s.smtp_auto_tls),
  };
};

const titleCase = (val?: string): string =>
  val ? val.charAt(0).toUpperCase() + val.slice(1) : '';

const EmailProviders = () => {
  const dispatch = useDispatch();
  const [providers, setProviders] = useState<EmailProvider[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<EmailProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [form] = Form.useForm<ProviderFormValues>();
  // Connection Details modal: stats, valid senders and the manual add-sender box,
  // shown for a saved connection.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsProvider, setDetailsProvider] = useState<EmailProvider | null>(
    null
  );
  const [details, setDetails] = useState<ConnectionDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [newSender, setNewSender] = useState('');
  const [senderBusy, setSenderBusy] = useState(false);

  const providerType = Form.useWatch('provider_type', form);

  // Persisted view-state: search, filters, page/limit and visible columns are
  // all kept in localStorage so they survive reloads and direct visits.
  const [view, updateView] = useListState<EmailProvidersView>(
    'emailProviders',
    DEFAULT_PROVIDERS_VIEW
  );

  const filters = view;
  const visibleColumns = view.columns;

  // Any filter/search/sort change resets to page 1.
  const setFilters = useCallback(
    (
      updater:
        | Partial<EmailProvidersView>
        | ((prev: EmailProvidersView) => EmailProvidersView)
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

  const loadProviders = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.emailProviders.getAll({
        page: view.page,
        per_page: view.perPage,
        search: view.search,
        provider_type: view.provider_type,
        status: view.status,
        orderby: view.sortField,
        order: view.sortOrder,
      });
      setProviders(response.data || []);
      const headerTotal = Number(response.headers['x-wp-total']);
      setTotal(
        Number.isFinite(headerTotal)
          ? headerTotal
          : (response.data || []).length
      );
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to load email providers', 'kelune-crm')
        )
      );
    } finally {
      setLoading(false);
    }
  }, [
    view.page,
    view.perPage,
    view.search,
    view.provider_type,
    view.status,
    view.sortField,
    view.sortOrder,
  ]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      provider_type: 'smtp',
      region: 'us-east-1',
      status: 'active',
      is_default: providers.length === 0,
      credentials: { smtp_encryption: 'tls' },
      settings: { ...DEFAULT_SETTINGS },
    });
    setDrawerOpen(true);
  };

  const openEdit = (provider: EmailProvider) => {
    setEditing(provider);
    form.resetFields();
    form.setFieldsValue({
      name: provider.name,
      provider_type: provider.provider_type,
      sender_name: provider.sender_name,
      sender_email: provider.sender_email,
      reply_to: provider.reply_to,
      region: provider.region || 'us-east-1',
      is_default: provider.is_default,
      status: provider.status ?? 'active',
      // Masked secrets arrive as the sentinel and are submitted back unchanged.
      credentials: { smtp_encryption: 'tls', ...(provider.credentials ?? {}) },
      settings: toFormSettings(
        provider.settings as ProviderSettings | undefined
      ),
    });
    setDrawerOpen(true);
  };

  const handleSave = async (values: ProviderFormValues) => {
    setSaving(true);
    dispatch(startGlobalLoading());
    try {
      // Map the form's boolean switches back to the stored 'yes'|'no' shape.
      const payload = {
        ...values,
        settings: toWireSettings(values.settings),
      } as Record<string, unknown>;
      if (editing?.id) {
        await api.emailProviders.update(editing.id, payload);
        message.success(__('Email provider updated', 'kelune-crm'));
      } else {
        await api.emailProviders.create(payload);
        message.success(__('Email provider created', 'kelune-crm'));
      }
      setDrawerOpen(false);
      loadProviders();
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to save email provider', 'kelune-crm')
        )
      );
    } finally {
      setSaving(false);
      dispatch(stopGlobalLoading());
    }
  };

  // Test the connection using the current form values (works before saving).
  const handleTest = async () => {
    let values: ProviderFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setTesting(true);
    dispatch(startGlobalLoading());
    try {
      const payload: Record<string, unknown> = { ...values };
      if (editing?.id) {
        payload.id = editing.id;
      }
      const res = await api.emailProviders.test(payload);
      // The response interceptor attaches the success envelope `message`.
      const successMsg = (res as typeof res & { message?: string }).message;
      message.success(successMsg || __('Connection successful!', 'kelune-crm'));
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Connection failed. Please check the details.', 'kelune-crm')
        )
      );
    } finally {
      setTesting(false);
      dispatch(stopGlobalLoading());
    }
  };

  // Open the Connection Details modal for a saved connection and load its info
  // (SES send-quota stats, valid sending emails, verified domains).
  const openDetails = async (provider: EmailProvider) => {
    if (!provider.id) {
      return;
    }
    setDetailsProvider(provider);
    setDetails(null);
    setNewSender('');
    setDetailsOpen(true);
    setDetailsLoading(true);
    try {
      const res = await api.emailProviders.connectionDetails(provider.id);
      setDetails(res.data as ConnectionDetails);
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to load connection details', 'kelune-crm')
        )
      );
    } finally {
      setDetailsLoading(false);
    }
  };

  const refreshDetails = async () => {
    if (!detailsProvider?.id) {
      return;
    }
    try {
      const res = await api.emailProviders.connectionDetails(
        detailsProvider.id
      );
      setDetails(res.data as ConnectionDetails);
    } catch {
      // Non-fatal: the add/remove already succeeded; leave the last view.
    }
  };

  // Register an extra sender email on the SES connection. The backend validates
  // the address is on a verified SES domain before storing it.
  const handleAddSender = async () => {
    const email = newSender.trim().toLowerCase();
    if (!detailsProvider?.id || !email) {
      return;
    }
    setSenderBusy(true);
    try {
      await api.emailProviders.addSender(detailsProvider.id, email);
      setNewSender('');
      message.success(__('Sender email added', 'kelune-crm'));
      await refreshDetails();
      loadProviders();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to add sender email', 'kelune-crm'))
      );
    } finally {
      setSenderBusy(false);
    }
  };

  const handleRemoveSender = async (email: string) => {
    if (!detailsProvider?.id) {
      return;
    }
    setSenderBusy(true);
    try {
      await api.emailProviders.removeSender(detailsProvider.id, email);
      message.success(__('Sender email removed', 'kelune-crm'));
      await refreshDetails();
      loadProviders();
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to remove sender email', 'kelune-crm')
        )
      );
    } finally {
      setSenderBusy(false);
    }
  };

  const handleDelete = async (id: ID) => {
    dispatch(startGlobalLoading());
    try {
      await api.emailProviders.delete(id);
      message.success(__('Email provider deleted', 'kelune-crm'));
      loadProviders();
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to delete email provider', 'kelune-crm')
        )
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      await Promise.all(ids.map((id) => api.emailProviders.delete(id)));
      message.success(
        sprintf(
          // translators: %d: number of deleted email providers
          _n(
            '%d email provider deleted',
            '%d email providers deleted',
            ids.length,
            'kelune-crm'
          ),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      loadProviders();
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to delete email providers', 'kelune-crm')
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

  const handleSetDefault = async (provider: EmailProvider) => {
    dispatch(startGlobalLoading());
    try {
      await api.emailProviders.update(provider.id, { is_default: true });
      message.success(
        sprintf(
          // translators: %s: connection name
          __('"%s" is now the default sender', 'kelune-crm'),
          provider.name
        )
      );
      loadProviders();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to set default', 'kelune-crm'))
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
      title: __('Sender', 'kelune-crm'),
      key: 'sender',
      visible: true,
      render: (_, record) => (
        <div>
          <Text
            style={{ fontWeight: 500, cursor: 'pointer', display: 'block' }}
            onClick={() => openEdit(record)}
          >
            {record.name || __('(unnamed)', 'kelune-crm')}
          </Text>
          {record.sender_email && (
            <Text
              copyable={{ text: record.sender_email }}
              style={{ color: 'rgba(0, 0, 0, 0.60)', fontSize: 12 }}
            >
              {record.sender_email}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: __('Type', 'kelune-crm'),
      dataIndex: 'provider_type',
      key: 'provider_type',
      visible: visibleColumns.provider_type,
      render: (type: EmailProviderType) => (
        <Tag bordered={false} color={PROVIDER_META[type]?.color}>
          {PROVIDER_META[type]?.label ?? type}
        </Tag>
      ),
    },
    {
      title: __('Status', 'kelune-crm'),
      dataIndex: 'status',
      key: 'status',
      visible: visibleColumns.status,
      render: (status: string, record) => (
        <Space direction="vertical" size={4} align="start">
          {status === 'active' ? (
            <Tag bordered={false} color="green">
              {__('Active', 'kelune-crm')}
            </Tag>
          ) : (
            <Tag bordered={false}>{__('Inactive', 'kelune-crm')}</Tag>
          )}
          {record.is_default && (
            <Tag bordered={false} icon={<StarFilled />} color="gold">
              {__('Default', 'kelune-crm')}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: __('Reply-To', 'kelune-crm'),
      dataIndex: 'reply_to',
      key: 'reply_to',
      visible: visibleColumns.reply_to,
      render: (replyTo: string) => replyTo || '-',
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
          {!record.is_default && (
            <Tooltip title={__('Set as default sender', 'kelune-crm')}>
              <Button
                shape="default"
                size="small"
                icon={<StarOutlined />}
                onClick={() => handleSetDefault(record)}
              />
            </Tooltip>
          )}
          <Tooltip title={__('View', 'kelune-crm')}>
            <Button
              shape="default"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => void openDetails(record)}
            />
          </Tooltip>
          <Tooltip title={__('Edit', 'kelune-crm')}>
            <Button
              shape="default"
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEdit(record)}
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
  ) as ColumnsType<EmailProvider>;

  const columnOptions = [
    { key: 'provider_type', label: __('Type', 'kelune-crm') },
    { key: 'status', label: __('Status', 'kelune-crm') },
    { key: 'reply_to', label: __('Reply-To', 'kelune-crm') },
    { key: 'created', label: __('Created Date', 'kelune-crm') },
    { key: 'updated', label: __('Updated Date', 'kelune-crm') },
  ];

  // Filter drill-down config + value bag for the reusable ListFilterMenu.
  const filterMenuGroups: FilterMenuGroup[] = [
    {
      key: 'provider_type',
      label: __('Type', 'kelune-crm'),
      mode: 'single',
      options: PROVIDER_TYPE_OPTIONS,
    },
    {
      key: 'status',
      label: __('Status', 'kelune-crm'),
      mode: 'single',
      options: STATUS_OPTIONS,
    },
  ];

  const filterMenuValue: FilterMenuValue = {
    provider_type: filters.provider_type,
    status: filters.status,
  };

  // Active-filter chip groups shown on the filter card's second row.
  const activeFilterGroups: FilterGroup[] = [];

  if (filters.provider_type) {
    activeFilterGroups.push({
      label: __('Type', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, provider_type: '' })),
      chips: [
        {
          key: `type-${filters.provider_type}`,
          label:
            PROVIDER_META[filters.provider_type as EmailProviderType]?.label ??
            filters.provider_type,
          onClose: () => setFilters((prev) => ({ ...prev, provider_type: '' })),
        },
      ],
    });
  }
  if (filters.status) {
    activeFilterGroups.push({
      label: __('Status', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, status: '' })),
      chips: [
        {
          key: `status-${filters.status}`,
          label:
            STATUS_OPTIONS.find((opt) => opt.value === filters.status)?.label ??
            titleCase(filters.status),
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
  const hasFilters = Boolean(filters.provider_type) || Boolean(filters.status);
  const sortActive = isSortActive({
    field: view.sortField,
    order: view.sortOrder,
  });
  const clearAll = () =>
    setFilters((prev) => ({
      ...prev,
      provider_type: '',
      status: '',
      sortField: DEFAULT_SORT.field,
      sortOrder: DEFAULT_SORT.order,
    }));

  const activeMeta = providerType ? PROVIDER_META[providerType] : undefined;

  const req = (message: string) => [{ required: true, message }];

  const renderCredentialFields = () => {
    switch (providerType) {
      case 'smtp':
        return (
          <>
            <Form.Item
              label={__('SMTP Host', 'kelune-crm')}
              name={['credentials', 'smtp_host']}
              rules={req(__('Enter the SMTP host', 'kelune-crm'))}
            >
              <Input placeholder="smtp.yourhost.com" />
            </Form.Item>
            <Form.Item
              label={__('SMTP Port', 'kelune-crm')}
              name={['credentials', 'smtp_port']}
              rules={req(__('Enter the SMTP port', 'kelune-crm'))}
            >
              <Input placeholder="587" />
            </Form.Item>
            <Form.Item
              label={__('SMTP Username', 'kelune-crm')}
              name={['credentials', 'smtp_username']}
              rules={req(__('Enter the SMTP username', 'kelune-crm'))}
            >
              <Input placeholder="you@yourhost.com" autoComplete="off" />
            </Form.Item>
            <Form.Item
              label={__('SMTP Password', 'kelune-crm')}
              name={['credentials', 'smtp_password']}
              rules={req(__('Enter the SMTP password', 'kelune-crm'))}
            >
              <Input.Password
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Form.Item>
            <Form.Item
              label={__('Encryption', 'kelune-crm')}
              name={['credentials', 'smtp_encryption']}
            >
              <Select>
                <Option value="none">{__('None', 'kelune-crm')}</Option>
                <Option value="ssl">SSL</Option>
                <Option value="tls">TLS</Option>
              </Select>
            </Form.Item>
          </>
        );
      case 'ses':
        return (
          <>
            <Form.Item
              label={__('Access Key ID', 'kelune-crm')}
              name={['credentials', 'ses_access_key_id']}
              rules={req(__('Enter the Access Key ID', 'kelune-crm'))}
            >
              <Input placeholder="AKIAIOSFODNN7EXAMPLE" autoComplete="off" />
            </Form.Item>
            <Form.Item
              label={__('Secret Access Key', 'kelune-crm')}
              name={['credentials', 'ses_secret_access_key']}
              rules={req(__('Enter the Secret Access Key', 'kelune-crm'))}
            >
              <Input.Password
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </Form.Item>
            <Form.Item label={__('Region', 'kelune-crm')} name="region">
              <Select showSearch optionFilterProp="children">
                {SES_REGIONS.map((r) => (
                  <Option key={r.value} value={r.value}>
                    {r.label}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </>
        );
      case 'mailgun':
        return (
          <>
            <Form.Item
              label={__('API Key', 'kelune-crm')}
              name={['credentials', 'mailgun_api_key']}
              rules={req(__('Enter the Mailgun API key', 'kelune-crm'))}
            >
              <Input.Password
                placeholder="key-••••••••"
                autoComplete="new-password"
              />
            </Form.Item>
            <Form.Item
              label={__('Domain', 'kelune-crm')}
              name={['credentials', 'mailgun_domain']}
              rules={req(__('Enter the Mailgun domain', 'kelune-crm'))}
            >
              <Input placeholder="mg.yourdomain.com" />
            </Form.Item>
            <Form.Item label={__('Region', 'kelune-crm')} name="region">
              <Select>
                <Option value="us">
                  {__('US (api.mailgun.net)', 'kelune-crm')}
                </Option>
                <Option value="eu">
                  {__('EU (api.eu.mailgun.net)', 'kelune-crm')}
                </Option>
              </Select>
            </Form.Item>
          </>
        );
      case 'sendgrid':
        return (
          <>
            <Form.Item
              label={__('API Key', 'kelune-crm')}
              name={['credentials', 'sendgrid_api_key']}
              rules={req(__('Enter the SendGrid API key', 'kelune-crm'))}
            >
              <Input.Password
                placeholder="SG.••••••••"
                autoComplete="new-password"
              />
            </Form.Item>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="kelune-crm-cc-email-providers-container">
      <ListPageHeader
        title={__('Email Providers', 'kelune-crm')}
        primaryAction={{
          label: __('Create Email Provider', 'kelune-crm'),
          onClick: openCreate,
        }}
        onReload={loadProviders}
      />

      <ListFilterCard
        search={filters.search}
        onSearchChange={(term) =>
          setFilters((prev) => ({ ...prev, search: term }))
        }
        searchPlaceholder={__('Search providers...', 'kelune-crm')}
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
                  provider_type: next.provider_type as string,
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

      <Table<EmailProvider>
        rowSelection={rowSelection}
        columns={columns}
        dataSource={providers}
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
          editing
            ? __('Edit Email Provider', 'kelune-crm')
            : __('Create Email Provider', 'kelune-crm')
        }
        width={640}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        destroyOnHidden
        extra={
          <Button
            size="small"
            icon={<ThunderboltOutlined />}
            loading={testing}
            onClick={handleTest}
          >
            {__('Test', 'kelune-crm')}
          </Button>
        }
        footer={
          <ModalFooter
            okText={
              editing ? __('Update', 'kelune-crm') : __('Create', 'kelune-crm')
            }
            onOk={() => form.submit()}
            confirmLoading={saving}
            onCancel={() => setDrawerOpen(false)}
          />
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item
            label={__('Connection Name', 'kelune-crm')}
            name="name"
            rules={[
              {
                required: true,
                message: __('Give this connection a name', 'kelune-crm'),
              },
            ]}
          >
            <Input
              placeholder={__('e.g. Amazon SES — Marketing', 'kelune-crm')}
            />
          </Form.Item>

          <Form.Item
            label={__('Provider Type', 'kelune-crm')}
            name="provider_type"
            rules={[
              {
                required: true,
                message: __('Choose a provider type', 'kelune-crm'),
              },
            ]}
          >
            <Select disabled={!!editing}>
              {PROVIDER_TYPE_OPTIONS.map((opt) => (
                <Option key={opt.value} value={opt.value}>
                  {opt.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Divider
            orientation="left"
            orientationMargin="0"
            style={formSectionDivider}
          >
            {__('Credentials', 'kelune-crm')}
          </Divider>
          {renderCredentialFields()}
          {activeMeta && (
            <Alert
              type="info"
              message={activeMeta.hint}
              style={{ marginBottom: 24, border: 'none' }}
            />
          )}

          <Divider
            orientation="left"
            orientationMargin="0"
            style={formSectionDivider}
          >
            {__('Sender', 'kelune-crm')}
          </Divider>
          <Form.Item
            label={__('Sender Email', 'kelune-crm')}
            name="sender_email"
            tooltip={__(
              'The default From address for this connection. Must be verified/allowed by the provider.',
              'kelune-crm'
            )}
            rules={[
              {
                required: true,
                message: __('Enter the sender email', 'kelune-crm'),
              },
              {
                type: 'email',
                message: __('Enter a valid email', 'kelune-crm'),
              },
            ]}
          >
            <Input placeholder="noreply@yourdomain.com" />
          </Form.Item>

          <Form.Item label={__('Sender Name', 'kelune-crm')} name="sender_name">
            <Input placeholder={__('Your Company', 'kelune-crm')} />
          </Form.Item>
          <Form.Item
            label={__('Reply-To', 'kelune-crm')}
            name="reply_to"
            rules={[
              {
                type: 'email',
                message: __('Enter a valid email', 'kelune-crm'),
              },
            ]}
          >
            <Input placeholder="support@yourdomain.com" />
          </Form.Item>

          <Divider
            orientation="left"
            orientationMargin="0"
            style={formSectionDivider}
          >
            {__('Options', 'kelune-crm')}
          </Divider>
          <InlineSwitch
            form={form}
            name="is_default"
            label={__('Default sender', 'kelune-crm')}
            tooltip={__(
              "Used when a campaign doesn't pick a specific provider.",
              'kelune-crm'
            )}
          />

          <InlineSwitch
            form={form}
            name={['settings', 'force_from_name']}
            label={__('Force sender name', 'kelune-crm')}
            tooltip={__(
              "Always use this connection's sender name, overriding the name set on the outgoing email.",
              'kelune-crm'
            )}
          />

          {(providerType === 'smtp' || providerType === 'ses') && (
            <InlineSwitch
              form={form}
              name={['settings', 'force_from_email']}
              label={__('Force From email', 'kelune-crm')}
              tooltip={__(
                "Always send from this connection's sender email (recommended — most providers only deliver from a verified address).",
                'kelune-crm'
              )}
            />
          )}

          {(providerType === 'smtp' ||
            providerType === 'ses' ||
            providerType === 'mailgun') && (
            <InlineSwitch
              form={form}
              name={['settings', 'return_path']}
              label={__('Set Return-Path', 'kelune-crm')}
              tooltip={__(
                'Route bounce notifications back to the sender address (envelope Return-Path = From).',
                'kelune-crm'
              )}
            />
          )}

          {providerType === 'smtp' && (
            <InlineSwitch
              form={form}
              name={['settings', 'smtp_auto_tls']}
              label={__('Auto TLS', 'kelune-crm')}
              tooltip={__(
                'Automatically upgrade to TLS when the SMTP server advertises it. Turn off only if the server misbehaves.',
                'kelune-crm'
              )}
            />
          )}

          <Form.Item
            label={__('Active', 'kelune-crm')}
            name="status"
            valuePropName="checked"
            getValueFromEvent={(checked: boolean) =>
              checked ? 'active' : 'inactive'
            }
            getValueProps={(value) => ({ checked: value === 'active' })}
            style={{ marginBottom: 0 }}
          >
            <Switch />
          </Form.Item>
          <SubmitOnEnter />
        </Form>
      </Drawer>

      <Modal
        destroyOnHidden
        centered
        title={__('Connection Details', 'kelune-crm')}
        open={detailsOpen}
        onCancel={() => setDetailsOpen(false)}
        footer={null}
        width={600}
      >
        {detailsLoading || !details ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin style={{ maxHeight: 'unset' }} />
          </div>
        ) : (
          <>
            <Descriptions bordered column={1}>
              <Descriptions.Item label={__('Connection Type', 'kelune-crm')}>
                {details.provider_label}
              </Descriptions.Item>
              {details.stats && (
                <>
                  <Descriptions.Item
                    label={__('Max Send in 24 hours', 'kelune-crm')}
                  >
                    {details.stats.max_24h.toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item
                    label={__('Sent in last 24 hours', 'kelune-crm')}
                  >
                    {details.stats.sent_24h.toLocaleString()}
                  </Descriptions.Item>
                  <Descriptions.Item
                    label={__('Max Sending Rate', 'kelune-crm')}
                  >
                    {sprintf(
                      // translators: %s: maximum send rate per second
                      __('%s/sec', 'kelune-crm'),
                      details.stats.max_rate
                    )}
                  </Descriptions.Item>
                </>
              )}
              <Descriptions.Item label={__('Sender Email', 'kelune-crm')}>
                {details.sender_email}
              </Descriptions.Item>
              <Descriptions.Item label={__('Sender Name', 'kelune-crm')}>
                {details.sender_name || '—'}
              </Descriptions.Item>
              <Descriptions.Item label={__('Force Sender Name', 'kelune-crm')}>
                {details.force_from_name
                  ? __('Yes', 'kelune-crm')
                  : __('No', 'kelune-crm')}
              </Descriptions.Item>
              <Descriptions.Item
                label={__('Valid Sending Emails', 'kelune-crm')}
              >
                {details.valid_senders.length > 0 ? (
                  <Space direction="vertical" size={2}>
                    {details.valid_senders.map((email) => (
                      <Text key={email}>{email}</Text>
                    ))}
                  </Space>
                ) : (
                  '—'
                )}
              </Descriptions.Item>
            </Descriptions>

            {details.can_add_senders && (
              <div style={{ marginTop: 20 }}>
                <Text strong style={{ display: 'block', marginBottom: 4 }}>
                  {__('Add Additional Senders', 'kelune-crm')}
                </Text>
                <Text
                  type="secondary"
                  style={{ display: 'block', fontSize: 12, marginBottom: 8 }}
                >
                  {__(
                    'Register another email on a verified SES domain. Mail sent from it routes through this connection as-is; any other From address is rewritten to the sender email above.',
                    'kelune-crm'
                  )}
                </Text>
                {details.manual_senders.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {details.manual_senders.map((email) => (
                      <Tag
                        key={email}
                        closable
                        bordered={false}
                        onClose={(e) => {
                          e.preventDefault();
                          void handleRemoveSender(email);
                        }}
                        style={{ marginBottom: 4 }}
                      >
                        {email}
                      </Tag>
                    ))}
                  </div>
                )}
                <Space.Compact style={{ width: '100%' }}>
                  <Input
                    placeholder="another@yourdomain.com"
                    value={newSender}
                    disabled={senderBusy}
                    onChange={(e) => setNewSender(e.target.value)}
                    onPressEnter={(e) => {
                      e.preventDefault();
                      void handleAddSender();
                    }}
                  />
                  <Button
                    type="primary"
                    onClick={() => void handleAddSender()}
                    loading={senderBusy}
                    disabled={!newSender.trim()}
                  >
                    {__('Add', 'kelune-crm')}
                  </Button>
                </Space.Compact>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default EmailProviders;
