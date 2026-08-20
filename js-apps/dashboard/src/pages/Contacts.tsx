import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { __, _n, sprintf } from '@wordpress/i18n';
import { useDispatch, useSelector } from '@store/hooks';

interface VisibleColumn extends ColumnType<Contact> {
  visible?: boolean;
}
import {
  Table,
  Button,
  Space,
  Select,
  Tag,
  Drawer,
  Form,
  message,
  Typography,
  Dropdown,
  Tabs,
  Modal,
  Tooltip,
} from 'antd';
import {
  DownloadOutlined,
  UploadOutlined,
  MoreOutlined,
  EditOutlined,
  EyeOutlined,
  TagsOutlined,
  UnorderedListOutlined,
  ApartmentOutlined,
  TeamOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import {
  fetchContacts,
  createContact,
  updateContact,
  deleteContact,
} from '../store/slices/contactsSlice';
import ContactAvatar from '../components/common/ContactAvatar';
import { useListState } from '../hooks/useListState';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../store/slices/globalLoadingSlice';
import ContactForm from '../components/contacts/ContactForm';
import ContactDetail from '../components/contacts/ContactDetail';
import ImportModal from '../components/common/ImportModal';
import ExportModal from '../components/contacts/ExportModal';
import ActionConfirm from '../components/common/ActionConfirm';
import type { MenuProps } from 'antd';
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
} from '../components/contacts/contactSortOptions';
import type { SortOrder } from '../components/contacts/contactSortOptions';
import ContactStatusTag from '../components/contacts/ContactStatusTag';
import {
  CONTACT_STATUS_OPTIONS,
  contactStatusLabel,
  isContactStatus,
} from '../components/contacts/contactStatus';
import BulkActionsBar from '../components/common/BulkActionsBar';
import type { BulkActionValue } from '../components/common/BulkActionsBar';
import ModalFooter from '../components/common/ModalFooter';
import Lists from './Lists';
import Tags from './Tags';
import Segments from './Segments';
import ProFeatureGate from '../components/common/ProFeatureGate';
import api from '../services/api';
import { Link, useLocation } from 'react-router-dom';
import type {
  Contact,
  Tag as TagModel,
  ContactList,
  Automation,
  ID,
} from '@/types/models';
import type { Key } from 'react';
import { timeDiff, timeFormat } from '../utils/time';

const { Text } = Typography;

// Persisted view-state shape for the contacts list page. Stored (with other
// list pages) under one localStorage object via useListState('contacts').
interface ContactsView {
  search: string;
  status: string;
  tags: ID[];
  lists: ID[];
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
  sortField: string;
  sortOrder: SortOrder;
}

const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  lists: true,
  tags: true,
  status: true,
  company: false,
  phone: false,
  address: false,
  city: false,
  state: false,
  postal_code: false,
  country: false,
  source: false,
  lead_score: false,
  created: false,
};

const DEFAULT_CONTACTS_VIEW: ContactsView = {
  search: '',
  status: '',
  tags: [],
  lists: [],
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
};

const Contacts = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const { items, loading, pagination } = useSelector((state) => state.contacts);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  // Which row's action dropdown is open (kept controlled for inline confirms).
  const [openMenuId, setOpenMenuId] = useState<ID | null>(null);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactForm] = Form.useForm();
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [tagsModalVisible, setTagsModalVisible] = useState(false);
  const [managingTagsContact, setManagingTagsContact] =
    useState<Contact | null>(null);
  const [availableTags, setAvailableTags] = useState<TagModel[]>([]);
  const [selectedTags, setSelectedTags] = useState<ID[]>([]);
  const [listsModalVisible, setListsModalVisible] = useState(false);
  const [managingListsContact, setManagingListsContact] =
    useState<Contact | null>(null);
  const [availableLists, setAvailableLists] = useState<ContactList[]>([]);
  const [selectedLists, setSelectedLists] = useState<ID[]>([]);
  const [activeTab, setActiveTab] = useState('contacts');

  // Persisted view-state: search, filters, page/limit and visible columns are
  // all kept in localStorage so they survive reloads and direct visits.
  const [view, updateView] = useListState<ContactsView>(
    'contacts',
    DEFAULT_CONTACTS_VIEW
  );

  // A persisted view may carry a status the REST enum rejects — drop it so the
  // page loads unfiltered instead of erroring.
  const filters = useMemo(
    () =>
      view.status && !isContactStatus(view.status)
        ? { ...view, status: '' }
        : view,
    [view]
  );
  const visibleColumns = view.columns;

  // Any filter change resets to page 1.
  const setFilters = useCallback(
    (updater: Partial<ContactsView> | ((prev: ContactsView) => ContactsView)) =>
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

  const [allTags, setAllTags] = useState<TagModel[]>([]);
  const [allLists, setAllLists] = useState<ContactList[]>([]);
  // Active, manual-trigger automations a selection can be enrolled into — a
  // manual automation has no automatic trigger, so this bulk action is the way
  // to start it for chosen contacts.
  const [manualAutomations, setManualAutomations] = useState<Automation[]>([]);

  const loadContacts = useCallback(() => {
    dispatch(
      fetchContacts({
        page: view.page,
        per_page: view.perPage,
        search: view.search,
        status: filters.status,
        tags: view.tags,
        lists: view.lists,
        orderby: view.sortField,
        order: view.sortOrder,
      })
    );
  }, [
    dispatch,
    view.page,
    view.perPage,
    view.search,
    filters.status,
    view.tags,
    view.lists,
    view.sortField,
    view.sortOrder,
  ]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Sync active tab with the router sub-route (/contacts/<tab>).
  useEffect(() => {
    const sub = location.pathname.split('/')[2];
    setActiveTab(sub || 'contacts');
  }, [location.pathname]);

  const loadTagsAndLists = useCallback(async () => {
    try {
      const [tagsResponse, listsResponse, automationsResponse] =
        await Promise.all([
          api.tags.getAll(),
          api.lists.getAll(),
          api.automations.getAll({ per_page: 100, status: 'active' }),
        ]);
      // Normalise ids to numbers (API may send strings) so they match the
      // numeric filter/select values and id lookups below.
      setAllTags(
        (tagsResponse.data || []).map((tag) => ({ ...tag, id: Number(tag.id) }))
      );
      setAllLists(
        (listsResponse.data || []).map((list) => ({
          ...list,
          id: Number(list.id),
        }))
      );
      // Only manual-trigger automations are offered for bulk enrolment; the
      // rest enrol themselves via their own events.
      const automations = (automationsResponse.data?.data ??
        []) as Automation[];
      setManualAutomations(
        automations.filter((a) => a.trigger_type === 'manual')
      );
    } catch (error) {
      console.error('Failed to load tags, lists and automations:', error);
    }
  }, []);

  useEffect(() => {
    // Load tags and lists for filters
    loadTagsAndLists();
  }, [loadTagsAndLists]);

  const handleCreate = () => {
    setEditingContact(null);
    setDrawerVisible(true);
  };

  const handleEdit = async (record: Contact) => {
    try {
      // Fetch full contact details including notes
      const response = await api.contacts.getOne(record.id);
      setEditingContact(response.data);
      setDrawerVisible(true);
    } catch (error) {
      message.error(__('Failed to load contact details', 'kelune-crm'));
    }
  };

  const handleView = async (record: Contact) => {
    try {
      // Fetch full contact details including notes
      const response = await api.contacts.getOne(record.id);
      setSelectedContact(response.data);
      setDetailVisible(true);
    } catch (error) {
      message.error(__('Failed to load contact details', 'kelune-crm'));
    }
  };

  const handleDelete = async (id: ID) => {
    try {
      await dispatch(deleteContact(id)).unwrap();
      message.success(__('Contact deleted successfully', 'kelune-crm'));
    } catch (error) {
      message.error(__('Failed to delete contact', 'kelune-crm'));
    }
  };

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      await api.contacts.bulkDelete(ids);
      message.success(
        sprintf(
          /* translators: %d: number of contacts deleted */
          _n(
            '%d contact deleted',
            '%d contacts deleted',
            ids.length,
            'kelune-crm'
          ),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      loadContacts();
    } catch (error) {
      message.error(__('Failed to delete contacts', 'kelune-crm'));
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkUpdateStatus = async (status: string) => {
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      await api.contacts.bulkUpdate(ids, { status });
      message.success(
        sprintf(
          /* translators: %d: number of contacts updated */
          _n(
            '%d contact updated',
            '%d contacts updated',
            ids.length,
            'kelune-crm'
          ),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      loadContacts();
    } catch (error) {
      message.error(__('Failed to update contacts', 'kelune-crm'));
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkAddTags = async (tagIds: ID[]) => {
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      await Promise.all(ids.map((id) => api.contacts.addTags(id, tagIds)));
      message.success(
        sprintf(
          /* translators: %d: number of contacts tags were added to */
          _n(
            'Tags added to %d contact',
            'Tags added to %d contacts',
            ids.length,
            'kelune-crm'
          ),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      loadContacts();
    } catch (error) {
      message.error(__('Failed to add tags', 'kelune-crm'));
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkEnroll = async (automationId: ID) => {
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      // allSettled, not all: the enroll endpoint rejects a contact that is
      // already enrolled, and one such skip must not abort the rest.
      const results = await Promise.allSettled(
        ids.map((id) => api.automations.enroll(automationId, id))
      );
      const enrolled = results.filter((r) => r.status === 'fulfilled').length;
      const skipped = ids.length - enrolled;
      if (enrolled > 0) {
        message.success(
          sprintf(
            /* translators: %d: number of contacts enrolled */
            _n(
              'Enrolled %d contact',
              'Enrolled %d contacts',
              enrolled,
              'kelune-crm'
            ),
            enrolled
          ) +
            (skipped > 0
              ? ` ${sprintf(
                  /* translators: %d: number of contacts skipped (already enrolled) */
                  __('(%d already enrolled)', 'kelune-crm'),
                  skipped
                )}`
              : '')
        );
      } else {
        message.warning(
          __(
            'No contacts enrolled — they may already be enrolled.',
            'kelune-crm'
          )
        );
      }
      setSelectedRowKeys([]);
      loadContacts();
    } catch (error) {
      message.error(__('Failed to enroll contacts', 'kelune-crm'));
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleBulkAction = (action: string, value: BulkActionValue) => {
    if (action === 'delete') {
      handleBulkDelete();
    } else if (action === 'update_status' && typeof value === 'string') {
      handleBulkUpdateStatus(value);
    } else if (action === 'add_tags' && Array.isArray(value)) {
      handleBulkAddTags(value as ID[]);
    } else if (
      action === 'enroll' &&
      (typeof value === 'number' || typeof value === 'string')
    ) {
      handleBulkEnroll(value as ID);
    }
  };

  const handleFormSubmit = async (values: Record<string, unknown>) => {
    try {
      if (editingContact) {
        await dispatch(
          updateContact({ id: editingContact.id, ...values })
        ).unwrap();
        message.success(__('Contact updated successfully', 'kelune-crm'));
      } else {
        await dispatch(createContact(values)).unwrap();
        message.success(__('Contact created successfully', 'kelune-crm'));
      }
      setDrawerVisible(false);
      loadContacts();
    } catch (error) {
      message.error(__('Failed to save contact', 'kelune-crm'));
    }
  };

  const handleExport = () => setExportModalVisible(true);

  const handleReload = () => {
    loadContacts();
    loadTagsAndLists();
  };

  const handleManageTags = async (record: Contact) => {
    try {
      // Fetch all available tags
      const tagsResponse = await api.tags.getAll();
      setAvailableTags(tagsResponse.data || []);

      // Fetch full contact details to get current tags
      const contactResponse = await api.contacts.getOne(record.id);
      setManagingTagsContact(contactResponse.data);

      // Set selected tags (normalise ids to numbers so they match the options)
      const currentTagIds =
        contactResponse.data.tags?.map((tag: TagModel) => Number(tag.id)) || [];
      setSelectedTags(currentTagIds);

      setTagsModalVisible(true);
    } catch (error) {
      message.error(__('Failed to load tags', 'kelune-crm'));
    }
  };

  const handleSaveTags = async () => {
    if (!managingTagsContact) return;
    dispatch(startGlobalLoading());
    try {
      await api.contacts.update(managingTagsContact.id, {
        ...managingTagsContact,
        tag_ids: selectedTags,
      });
      message.success(__('Tags updated successfully', 'kelune-crm'));
      setTagsModalVisible(false);
      loadContacts();
    } catch (error) {
      message.error(__('Failed to update tags', 'kelune-crm'));
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleManageLists = async (record: Contact) => {
    try {
      // Fetch all available lists
      const listsResponse = await api.lists.getAll();
      setAvailableLists(listsResponse.data || []);

      // Fetch full contact details to get current lists
      const contactResponse = await api.contacts.getOne(record.id);
      setManagingListsContact(contactResponse.data);

      // Set selected lists (normalise ids to numbers so they match the options)
      const currentListIds =
        contactResponse.data.lists?.map((list: ContactList) =>
          Number(list.id)
        ) || [];
      setSelectedLists(currentListIds);

      setListsModalVisible(true);
    } catch (error) {
      message.error(__('Failed to load lists', 'kelune-crm'));
    }
  };

  const handleSaveLists = async () => {
    if (!managingListsContact) return;
    dispatch(startGlobalLoading());
    try {
      await api.contacts.update(managingListsContact.id, {
        ...managingListsContact,
        list_ids: selectedLists,
      });
      message.success(__('Lists updated successfully', 'kelune-crm'));
      setListsModalVisible(false);
      loadContacts();
    } catch (error) {
      message.error(__('Failed to update lists', 'kelune-crm'));
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
  };

  // Row action menu items. The Delete item embeds an inline ActionConfirm; the
  // Dropdown is kept open (see openMenuId guard) so the confirm anchor survives.
  const rowMenuItems = (record: Contact): MenuProps['items'] => [
    {
      key: 'lists',
      label: <span>{__('Manage Lists', 'kelune-crm')}</span>,
      onClick: () => {
        setOpenMenuId(null);
        handleManageLists(record);
      },
    },
    {
      key: 'tags',
      label: <span>{__('Manage Tags', 'kelune-crm')}</span>,
      onClick: () => {
        setOpenMenuId(null);
        handleManageTags(record);
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

  const allColumns: VisibleColumn[] = [
    {
      title: __('Contact', 'kelune-crm'),
      key: 'contact',
      visible: true,
      render: (_, record) => {
        const name =
          `${record.first_name ?? ''} ${record.last_name ?? ''}`.trim();
        return (
          <Space size={12}>
            <ContactAvatar
              size={36}
              email={record.email}
              first_name={record.first_name}
              last_name={record.last_name}
              avatar_url={record.avatar_url}
            />
            <div>
              <Text
                style={{ fontWeight: 500, cursor: 'pointer', display: 'block' }}
                onClick={() => handleView(record)}
              >
                {name || __('(no name)', 'kelune-crm')}
              </Text>
              {record.email && (
                <div style={{ color: 'rgba(0, 0, 0, 0.60)', fontSize: 12 }}>
                  {record.email}
                </div>
              )}
            </div>
          </Space>
        );
      },
    },
    {
      title: __('Lists', 'kelune-crm'),
      dataIndex: 'lists',
      key: 'lists',
      visible: visibleColumns.lists,
      render: (lists: ContactList[] | undefined) => (
        <>
          {lists?.slice(0, 2).map((list: ContactList) => (
            <Tag bordered={false} key={list.id}>
              {list.name}
            </Tag>
          ))}
          {lists && lists.length > 2 && (
            <Tooltip
              title={lists
                .slice(2)
                .map((list) => list.name)
                .join(', ')}
            >
              <Tag bordered={false} style={{ cursor: 'default' }}>
                +{lists.length - 2}
              </Tag>
            </Tooltip>
          )}
        </>
      ),
    },
    {
      title: __('Tags', 'kelune-crm'),
      dataIndex: 'tags',
      key: 'tags',
      visible: visibleColumns.tags,
      render: (tags: TagModel[] | undefined) => (
        <>
          {tags?.slice(0, 2).map((tag: TagModel) => (
            <Tag bordered={false} key={tag.id}>
              {tag.name}
            </Tag>
          ))}
          {tags && tags.length > 2 && (
            <Tooltip
              title={tags
                .slice(2)
                .map((tag) => tag.name)
                .join(', ')}
            >
              <Tag bordered={false} style={{ cursor: 'default' }}>
                +{tags.length - 2}
              </Tag>
            </Tooltip>
          )}
        </>
      ),
    },
    {
      title: __('Status', 'kelune-crm'),
      dataIndex: 'status',
      key: 'status',
      visible: visibleColumns.status,
      render: (status) => <ContactStatusTag status={status} />,
    },
    {
      title: __('Company', 'kelune-crm'),
      dataIndex: 'company',
      key: 'company',
      visible: visibleColumns.company,
    },
    {
      title: __('Phone', 'kelune-crm'),
      dataIndex: 'phone',
      key: 'phone',
      visible: visibleColumns.phone,
    },
    {
      title: __('Address', 'kelune-crm'),
      dataIndex: 'address_line1',
      key: 'address',
      visible: visibleColumns.address,
    },
    {
      title: __('City', 'kelune-crm'),
      dataIndex: 'city',
      key: 'city',
      visible: visibleColumns.city,
    },
    {
      title: __('State', 'kelune-crm'),
      dataIndex: 'state',
      key: 'state',
      visible: visibleColumns.state,
    },
    {
      title: __('Postal Code', 'kelune-crm'),
      dataIndex: 'postal_code',
      key: 'postal_code',
      visible: visibleColumns.postal_code,
    },
    {
      title: __('Country', 'kelune-crm'),
      dataIndex: 'country',
      key: 'country',
      visible: visibleColumns.country,
    },
    {
      title: __('Source', 'kelune-crm'),
      dataIndex: 'source',
      key: 'source',
      visible: visibleColumns.source,
      render: (source) =>
        source ? (
          <Tag bordered={false} color="purple">
            {source.charAt(0).toUpperCase() + source.slice(1)}
          </Tag>
        ) : (
          '-'
        ),
    },
    {
      title: __('Lead Score', 'kelune-crm'),
      dataIndex: 'lead_score',
      key: 'lead_score',
      visible: visibleColumns.lead_score,
      render: (score) => score || 0,
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
          <Tooltip title={__('View', 'kelune-crm')}>
            <Button
              shape="default"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleView(record)}
            />
          </Tooltip>
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
  ) as ColumnsType<Contact>;

  const columnOptions = [
    { key: 'lists', label: __('Lists', 'kelune-crm') },
    { key: 'tags', label: __('Tags', 'kelune-crm') },
    { key: 'status', label: __('Status', 'kelune-crm') },
    { key: 'company', label: __('Company', 'kelune-crm') },
    { key: 'phone', label: __('Phone', 'kelune-crm') },
    { key: 'address', label: __('Address', 'kelune-crm') },
    { key: 'city', label: __('City', 'kelune-crm') },
    { key: 'state', label: __('State/Province', 'kelune-crm') },
    { key: 'postal_code', label: __('Postal Code', 'kelune-crm') },
    { key: 'country', label: __('Country', 'kelune-crm') },
    { key: 'source', label: __('Source', 'kelune-crm') },
    { key: 'lead_score', label: __('Lead Score', 'kelune-crm') },
    { key: 'created', label: __('Created Date', 'kelune-crm') },
  ];

  // "More" menu on the page header (Export / Import).
  const moreItems: MenuProps['items'] = [
    {
      key: 'export',
      icon: <DownloadOutlined />,
      label: __('Export', 'kelune-crm'),
      onClick: handleExport,
    },
    {
      key: 'import',
      icon: <UploadOutlined />,
      label: __('Import', 'kelune-crm'),
      onClick: () => setImportModalVisible(true),
    },
  ];

  // Filter drill-down config + value bag for the reusable ListFilterMenu.
  const filterMenuGroups: FilterMenuGroup[] = [
    {
      key: 'status',
      label: __('Status', 'kelune-crm'),
      mode: 'single',
      options: CONTACT_STATUS_OPTIONS,
    },
    {
      key: 'lists',
      label: __('Lists', 'kelune-crm'),
      mode: 'multi',
      searchable: true,
      options: allLists.map((list) => ({
        value: Number(list.id),
        label: list.name ?? '',
      })),
    },
    {
      key: 'tags',
      label: __('Tags', 'kelune-crm'),
      mode: 'multi',
      searchable: true,
      options: allTags.map((tag) => ({
        value: Number(tag.id),
        label: tag.name ?? '',
      })),
    },
  ];

  const filterMenuValue: FilterMenuValue = {
    status: filters.status,
    lists: filters.lists,
    tags: filters.tags,
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
          label: contactStatusLabel(filters.status),
          onClose: () => setFilters((prev) => ({ ...prev, status: '' })),
        },
      ],
    });
  }
  if (filters.lists.length > 0) {
    activeFilterGroups.push({
      label: __('List', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, lists: [] })),
      chips: filters.lists.map((id) => ({
        key: `list-${id}`,
        label: allLists.find((l) => l.id === Number(id))?.name ?? String(id),
        onClose: () =>
          setFilters((prev) => ({
            ...prev,
            lists: prev.lists.filter((item) => item !== id),
          })),
      })),
    });
  }
  if (filters.tags.length > 0) {
    activeFilterGroups.push({
      label: __('Tag', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, tags: [] })),
      chips: filters.tags.map((id) => ({
        key: `tag-${id}`,
        label: allTags.find((t) => t.id === Number(id))?.name ?? String(id),
        onClose: () =>
          setFilters((prev) => ({
            ...prev,
            tags: prev.tags.filter((item) => item !== id),
          })),
      })),
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
  const hasFilters =
    Boolean(filters.status) ||
    filters.lists.length > 0 ||
    filters.tags.length > 0;
  const sortActive = isSortActive({
    field: view.sortField,
    order: view.sortOrder,
  });
  const clearAll = () =>
    setFilters((prev) => ({
      ...prev,
      status: '',
      lists: [],
      tags: [],
      sortField: DEFAULT_SORT.field,
      sortOrder: DEFAULT_SORT.order,
    }));

  return (
    <div className="kelune-crm-cc-contacts-container">
      <Tabs activeKey={activeTab} tabBarStyle={{ marginBottom: 24 }}>
        <Tabs.TabPane
          tab={
            <Link to="/contacts" style={{ color: 'inherit' }}>
              <TeamOutlined /> {__('All Contacts', 'kelune-crm')}
            </Link>
          }
          key="contacts"
        >
          <ListPageHeader
            title={__('Contacts', 'kelune-crm')}
            primaryAction={{
              label: __('Create Contact', 'kelune-crm'),
              onClick: handleCreate,
            }}
            onReload={handleReload}
            moreItems={moreItems}
          />

          <ListFilterCard
            search={filters.search}
            onSearchChange={(term) =>
              setFilters((prev) => ({ ...prev, search: term }))
            }
            searchPlaceholder={__('Search contacts...', 'kelune-crm')}
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
                      lists: next.lists as ID[],
                      tags: next.tags as ID[],
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
                  onReset={() =>
                    setVisibleColumns({ ...DEFAULT_VISIBLE_COLUMNS })
                  }
                />
              </>
            }
          />

          <BulkActionsBar
            selectedCount={selectedRowKeys.length}
            actions={[
              {
                value: 'add_tags',
                label: __('Add Tags', 'kelune-crm'),
                secondary: {
                  placeholder: __('Select tags', 'kelune-crm'),
                  mode: 'multiple',
                  options: allTags.map((tag) => ({
                    value: tag.id,
                    label: tag.name ?? '',
                  })),
                },
              },
              {
                value: 'update_status',
                label: __('Update Status', 'kelune-crm'),
                secondary: {
                  placeholder: __('Select status', 'kelune-crm'),
                  options: CONTACT_STATUS_OPTIONS,
                },
              },
              // Offered only when a manual-trigger automation exists to enrol
              // into — otherwise there is nothing to pick.
              ...(manualAutomations.length > 0
                ? [
                    {
                      value: 'enroll',
                      label: __('Enroll in Automation', 'kelune-crm'),
                      secondary: {
                        placeholder: __('Select automation', 'kelune-crm'),
                        options: manualAutomations.map((a) => ({
                          value: Number(a.id),
                          label: a.name ?? '',
                        })),
                      },
                    },
                  ]
                : []),
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
                total={pagination.total}
                onChange={(nextPage, nextSize) =>
                  updateView({ page: nextPage, perPage: nextSize })
                }
              />
            )}
          />
        </Tabs.TabPane>
        <Tabs.TabPane
          tab={
            <Link to="/contacts/lists" style={{ color: 'inherit' }}>
              <UnorderedListOutlined /> {__('Lists', 'kelune-crm')}
            </Link>
          }
          key="lists"
        >
          <Lists />
        </Tabs.TabPane>
        <Tabs.TabPane
          tab={
            <Link to="/contacts/tags" style={{ color: 'inherit' }}>
              <TagsOutlined /> {__('Tags', 'kelune-crm')}
            </Link>
          }
          key="tags"
        >
          <Tags />
        </Tabs.TabPane>
        <Tabs.TabPane
          tab={
            <Link to="/contacts/segments" style={{ color: 'inherit' }}>
              <ApartmentOutlined /> {__('Segments', 'kelune-crm')}
            </Link>
          }
          key="segments"
        >
          <ProFeatureGate
            feature="segments"
            title={__('Segments', 'kelune-crm')}
            description={__(
              'Upgrade to Kelune CRM Pro to build dynamic segments with the query builder and auto-refresh.',
              'kelune-crm'
            )}
          >
            <Segments />
          </ProFeatureGate>
        </Tabs.TabPane>
      </Tabs>

      <Drawer
        destroyOnHidden
        title={
          editingContact
            ? __('Edit Contact', 'kelune-crm')
            : __('Create Contact', 'kelune-crm')
        }
        width={640}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        footer={
          <ModalFooter
            okText={
              editingContact
                ? __('Update', 'kelune-crm')
                : __('Create', 'kelune-crm')
            }
            onOk={() => contactForm.submit()}
            onCancel={() => setDrawerVisible(false)}
          />
        }
      >
        <ContactForm
          contact={editingContact}
          form={contactForm}
          onSubmit={handleFormSubmit}
        />
      </Drawer>

      <Drawer
        destroyOnHidden
        title={__('Contact Details', 'kelune-crm')}
        width={720}
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
        styles={{ body: { padding: '8px 20px 20px 20px' } }}
        extra={
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingContact(selectedContact);
              setDetailVisible(false);
              setDrawerVisible(true);
            }}
          >
            {__('Edit', 'kelune-crm')}
          </Button>
        }
      >
        <ContactDetail contact={selectedContact} />
      </Drawer>

      <ImportModal
        visible={importModalVisible}
        onClose={() => setImportModalVisible(false)}
        onSuccess={loadContacts}
      />

      <ExportModal
        visible={exportModalVisible}
        onClose={() => setExportModalVisible(false)}
        filters={{
          search: view.search,
          status: filters.status,
          tags: view.tags,
          lists: view.lists,
        }}
        total={pagination.total}
      />

      <Modal
        destroyOnHidden
        centered
        title={__('Manage Lists', 'kelune-crm')}
        open={listsModalVisible}
        onCancel={() => setListsModalVisible(false)}
        footer={
          <ModalFooter
            onOk={handleSaveLists}
            onCancel={() => setListsModalVisible(false)}
            okText={__('Save', 'kelune-crm')}
          />
        }
      >
        <Select
          mode="multiple"
          placeholder={__('Select lists...', 'kelune-crm')}
          value={selectedLists}
          onChange={setSelectedLists}
          style={{ width: '100%' }}
        >
          {availableLists.map((list) => (
            <Select.Option key={list.id} value={Number(list.id)}>
              {list.name}
            </Select.Option>
          ))}
        </Select>
      </Modal>

      <Modal
        destroyOnHidden
        centered
        title={__('Manage Tags', 'kelune-crm')}
        open={tagsModalVisible}
        onCancel={() => setTagsModalVisible(false)}
        footer={
          <ModalFooter
            onOk={handleSaveTags}
            onCancel={() => setTagsModalVisible(false)}
            okText={__('Save', 'kelune-crm')}
          />
        }
      >
        <Select
          mode="multiple"
          placeholder={__('Select tags...', 'kelune-crm')}
          value={selectedTags}
          onChange={setSelectedTags}
          style={{ width: '100%' }}
        >
          {availableTags.map((tag) => (
            <Select.Option key={tag.id} value={Number(tag.id)}>
              {tag.name}
            </Select.Option>
          ))}
        </Select>
      </Modal>
    </div>
  );
};

export default Contacts;
