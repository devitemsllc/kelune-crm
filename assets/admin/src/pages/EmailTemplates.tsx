import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import { useDispatch, useSelector } from '@store/hooks';
import {
  Table,
  Button,
  Input,
  message,
  Modal,
  Form,
  Space,
  Typography,
  Tag,
  Tooltip,
  Dropdown,
} from 'antd';
import {
  EditOutlined,
  MoreOutlined,
  StarOutlined,
  StarFilled,
  SortAscendingOutlined,
  SortDescendingOutlined,
  FormatPainterOutlined,
} from '@ant-design/icons';
import type { Key } from 'react';
import type { MenuProps } from 'antd';
import {
  fetchTemplates,
  deleteTemplate,
  duplicateTemplate,
  toggleFavorite,
  createTemplate,
  updateTemplate,
} from '../store/slices/emailTemplatesSlice';
import { useListState } from '../hooks/useListState';
import ActionConfirm from '../components/common/ActionConfirm';
import EmailPreviewModal from '../components/common/EmailPreviewModal';
import BulkActionsBar from '../components/common/BulkActionsBar';
import type { BulkActionValue } from '../components/common/BulkActionsBar';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '../store/slices/globalLoadingSlice';
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
} from '../components/email-templates/emailTemplateSortOptions';
import type { SortOrder } from '../components/email-templates/emailTemplateSortOptions';
import { buildDefaultTemplateContent } from '../components/email-templates/blockDefaults';
import { timeDiff, timeFormat } from '../utils/time';
import {
  resolveTemplateEditor,
  editorModeLabel,
} from '../utils/templateEditor';
import type { EmailTemplate, ID } from '../types/models';
import { __, _n, sprintf } from '@wordpress/i18n';
import { getErrorMessage } from '@/utils/getErrorMessage';
import api from '../services/api';

const { Text } = Typography;

interface VisibleColumn extends ColumnType<EmailTemplate> {
  visible?: boolean;
}

const TYPE_OPTIONS = [
  { value: 'custom', label: __('My Templates', 'kelune-crm') },
  { value: 'predefined', label: __('Pre-defined', 'kelune-crm') },
];

const FAVORITE_OPTIONS = [
  { value: '1', label: __('Favorites', 'kelune-crm') },
  { value: '0', label: __('Non-favorites', 'kelune-crm') },
];

// Persisted view-state shape for the email templates list page. Stored (with
// other list pages) under one localStorage object via
// useListState('email-templates').
interface EmailTemplatesView {
  search: string;
  template_type: string;
  favorite: string;
  page: number;
  perPage: number;
  columns: Record<string, boolean>;
  sortField: string;
  sortOrder: SortOrder;
}

// Favorite is a fixed, always-on leading column (not toggleable), so it is not
// listed here. usage_count/last_used_at are dead placeholders (never populated
// server-side) and are intentionally not surfaced at all.
const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  editor: true,
  created: false,
  updated: false,
};

const DEFAULT_TEMPLATES_VIEW: EmailTemplatesView = {
  search: '',
  template_type: '',
  favorite: '',
  page: 1,
  perPage: 20,
  columns: { ...DEFAULT_VISIBLE_COLUMNS },
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
};

const EmailTemplates = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, total, loading } = useSelector(
    (state) => state.emailTemplates
  );

  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [openMenuId, setOpenMenuId] = useState<ID | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(
    null
  );
  const [previewVisible, setPreviewVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(
    null
  );
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [form] = Form.useForm();

  // Persisted view-state: search, filters, page/limit and visible columns are
  // all kept in localStorage so they survive reloads and direct visits.
  const [view, updateView] = useListState<EmailTemplatesView>(
    'email-templates',
    DEFAULT_TEMPLATES_VIEW
  );

  const filters = view;
  const visibleColumns = view.columns;

  // Any filter/search/sort change resets to page 1.
  const setFilters = useCallback(
    (
      updater:
        | Partial<EmailTemplatesView>
        | ((prev: EmailTemplatesView) => EmailTemplatesView)
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

  const loadTemplates = useCallback(() => {
    dispatch(
      fetchTemplates({
        page: view.page,
        per_page: view.perPage,
        search: view.search,
        template_type: view.template_type,
        ...(view.favorite !== '' ? { is_favorite: view.favorite } : {}),
        orderby: view.sortField,
        order: view.sortOrder,
      })
    );
  }, [
    dispatch,
    view.page,
    view.perPage,
    view.search,
    view.template_type,
    view.favorite,
    view.sortField,
    view.sortOrder,
  ]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    setInfoModalVisible(true);
  };

  const handleEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    form.setFieldsValue({
      name: template.name,
      description: template.description,
    });
    setInfoModalVisible(true);
  };

  const closeInfoModal = () => {
    setInfoModalVisible(false);
    setEditingTemplate(null);
    form.resetFields();
  };

  // The info modal persists the template's metadata itself (create on new, update
  // on edit) — a new template is saved as an empty draft, designed later. Save on
  // a new template opens the builder automatically; on edit it just closes.
  // "Design Template" always opens the builder after persisting.
  const handleInfoSubmit = async (goToBuilder: boolean) => {
    let values: Record<string, unknown>;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    dispatch(startGlobalLoading());
    try {
      let targetId: string;
      if (editingTemplate) {
        await dispatch(
          updateTemplate({ id: String(editingTemplate.id), data: values })
        ).unwrap();
        targetId = String(editingTemplate.id);
        message.success(__('Template updated successfully', 'kelune-crm'));
      } else {
        const created = await dispatch(
          // Seed the new template with a default Text block so the builder opens
          // on ready-to-edit content instead of a blank canvas.
          createTemplate({ ...values, ...buildDefaultTemplateContent() })
        ).unwrap();
        targetId = String(created?.id);
        message.success(__('Template created successfully', 'kelune-crm'));
      }

      closeInfoModal();
      // New templates always continue to the builder; an edit only does so via
      // the dedicated "Design Template" button.
      if (goToBuilder || !editingTemplate) {
        navigate(`/email-templates/builder/${targetId}`);
      } else {
        loadTemplates();
      }
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to save template', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
    }
  };

  const handleDelete = async (id: ID) => {
    try {
      await dispatch(deleteTemplate(id)).unwrap();
      message.success(__('Template deleted successfully', 'kelune-crm'));
      loadTemplates();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete template', 'kelune-crm'))
      );
    }
  };

  const handleBulkDelete = async () => {
    const ids = selectedRowKeys as ID[];
    dispatch(startGlobalLoading());
    try {
      await Promise.all(ids.map((id) => api.delete(`/email-templates/${id}`)));
      message.success(
        sprintf(
          /* translators: %d: number of templates deleted */
          _n(
            '%d template deleted',
            '%d templates deleted',
            ids.length,
            'kelune-crm'
          ),
          ids.length
        )
      );
      setSelectedRowKeys([]);
      loadTemplates();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to delete templates', 'kelune-crm'))
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

  const handleDuplicate = async (id: ID) => {
    try {
      await dispatch(duplicateTemplate(id)).unwrap();
      message.success(__('Template duplicated successfully', 'kelune-crm'));
      loadTemplates();
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to duplicate template', 'kelune-crm'))
      );
    }
  };

  const handleToggleFavorite = async (id: ID) => {
    try {
      await dispatch(toggleFavorite(id)).unwrap();
      message.success(__('Favorite status updated', 'kelune-crm'));
      loadTemplates();
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to update favorite status', 'kelune-crm')
        )
      );
    }
  };

  const handlePreview = (template: EmailTemplate) => {
    setPreviewTemplate(template);
    setPreviewVisible(true);
  };

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: Key[]) => setSelectedRowKeys(keys),
  };

  // Row action menu items. The Delete item embeds an inline ActionConfirm; the
  // Dropdown is kept open (see openMenuId guard) so the confirm anchor survives.
  const rowMenuItems = (record: EmailTemplate): MenuProps['items'] => {
    const isPredefined = record.template_type === 'predefined';
    return [
      {
        key: 'preview',
        label: <span>{__('Preview', 'kelune-crm')}</span>,
        onClick: () => {
          setOpenMenuId(null);
          handlePreview(record);
        },
      },
      {
        key: 'favorite',
        label: (
          <span>
            {record.is_favorite
              ? __('Remove from favorites', 'kelune-crm')
              : __('Add to favorites', 'kelune-crm')}
          </span>
        ),
        onClick: () => {
          setOpenMenuId(null);
          handleToggleFavorite(record.id);
        },
      },
      {
        key: 'duplicate',
        label: <span>{__('Duplicate', 'kelune-crm')}</span>,
        onClick: () => {
          setOpenMenuId(null);
          handleDuplicate(record.id);
        },
      },
      { type: 'divider' },
      {
        key: 'delete',
        danger: !isPredefined,
        disabled: isPredefined,
        label: isPredefined ? (
          <Tooltip
            title={__('Predefined templates cannot be deleted', 'kelune-crm')}
          >
            <span>{__('Delete', 'kelune-crm')}</span>
          </Tooltip>
        ) : (
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
  };

  const allColumns: VisibleColumn[] = [
    {
      title: '',
      dataIndex: 'is_favorite',
      key: 'favorite',
      visible: true,
      fixed: 'left',
      width: 48,
      align: 'center',
      render: (_, record) => (
        <Tooltip
          title={
            record.is_favorite
              ? __('Remove from favorites', 'kelune-crm')
              : __('Add to favorites', 'kelune-crm')
          }
        >
          <Button
            type="text"
            size="small"
            icon={
              record.is_favorite ? (
                <StarFilled style={{ color: '#faad14' }} />
              ) : (
                <StarOutlined />
              )
            }
            onClick={() => handleToggleFavorite(record.id)}
          />
        </Tooltip>
      ),
    },
    {
      title: __('Template', 'kelune-crm'),
      key: 'template',
      visible: true,
      render: (_, record) => (
        <div>
          <Text
            style={{ fontWeight: 500, cursor: 'pointer', display: 'block' }}
            onClick={() => handlePreview(record)}
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
      // Which editor a template opens in (Visual builder vs Rich Text),
      // derived from its stored structure — same rule as the gallery modal.
      title: __('Editor', 'kelune-crm'),
      key: 'editor',
      visible: visibleColumns.editor,
      render: (_, record) => {
        const mode = resolveTemplateEditor(record);
        return (
          <Tag
            bordered={false}
            color={mode === 'builder' ? 'geekblue' : 'gold'}
          >
            {editorModeLabel(mode)}
          </Tag>
        );
      },
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
          <Tooltip title={__('Design template', 'kelune-crm')}>
            <Button
              shape="default"
              size="small"
              icon={<FormatPainterOutlined />}
              onClick={() => navigate(`/email-templates/builder/${record.id}`)}
            />
          </Tooltip>
          <Tooltip title={__('Edit info', 'kelune-crm')}>
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
  ) as ColumnsType<EmailTemplate>;

  const columnOptions = [
    { key: 'editor', label: __('Editor', 'kelune-crm') },
    { key: 'created', label: __('Created Date', 'kelune-crm') },
    { key: 'updated', label: __('Updated Date', 'kelune-crm') },
  ];

  // Filter drill-down config + value bag for the reusable ListFilterMenu.
  const filterMenuGroups: FilterMenuGroup[] = [
    {
      key: 'template_type',
      label: __('Type', 'kelune-crm'),
      mode: 'single',
      options: TYPE_OPTIONS,
    },
    {
      key: 'favorite',
      label: __('Favorite', 'kelune-crm'),
      mode: 'single',
      options: FAVORITE_OPTIONS,
    },
  ];

  const filterMenuValue: FilterMenuValue = {
    template_type: filters.template_type,
    favorite: filters.favorite,
  };

  // Active-filter chip groups shown on the filter card's second row.
  const activeFilterGroups: FilterGroup[] = [];

  if (filters.template_type) {
    const label =
      TYPE_OPTIONS.find((o) => o.value === filters.template_type)?.label ??
      filters.template_type;
    activeFilterGroups.push({
      label: __('Type', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, template_type: '' })),
      chips: [
        {
          key: `type-${filters.template_type}`,
          label,
          onClose: () => setFilters((prev) => ({ ...prev, template_type: '' })),
        },
      ],
    });
  }
  if (filters.favorite) {
    const label =
      FAVORITE_OPTIONS.find((o) => o.value === filters.favorite)?.label ??
      filters.favorite;
    activeFilterGroups.push({
      label: __('Favorite', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, favorite: '' })),
      chips: [
        {
          key: `favorite-${filters.favorite}`,
          label,
          onClose: () => setFilters((prev) => ({ ...prev, favorite: '' })),
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
  const hasFilters =
    Boolean(filters.template_type) || Boolean(filters.favorite);
  const sortActive = isSortActive({
    field: view.sortField,
    order: view.sortOrder,
  });
  const clearAll = () =>
    setFilters((prev) => ({
      ...prev,
      template_type: '',
      favorite: '',
      sortField: DEFAULT_SORT.field,
      sortOrder: DEFAULT_SORT.order,
    }));

  return (
    <div className="kelune-crm-cc-email-templates-container">
      <ListPageHeader
        title={__('Email Templates', 'kelune-crm')}
        primaryAction={{
          label: __('Create Template', 'kelune-crm'),
          onClick: handleCreate,
        }}
        onReload={loadTemplates}
      />

      <ListFilterCard
        search={filters.search}
        onSearchChange={(term) =>
          setFilters((prev) => ({ ...prev, search: term }))
        }
        searchPlaceholder={__('Search templates...', 'kelune-crm')}
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
                  template_type: next.template_type as string,
                  favorite: next.favorite as string,
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

      {/* Preview Modal */}
      <EmailPreviewModal
        open={previewVisible}
        title={previewTemplate?.name}
        html={previewTemplate?.html_content ?? ''}
        iframeTitle={__('Template Preview', 'kelune-crm')}
        onCancel={() => {
          setPreviewVisible(false);
          setPreviewTemplate(null);
        }}
      />

      {/* Template Info Modal (metadata step before the builder) */}
      <Modal
        destroyOnHidden
        centered
        title={
          editingTemplate
            ? __('Edit Template Info', 'kelune-crm')
            : __('Create Template', 'kelune-crm')
        }
        open={infoModalVisible}
        onCancel={closeInfoModal}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={() => handleInfoSubmit(false)}
        >
          <Form.Item
            label={__('Template Name', 'kelune-crm')}
            name="name"
            rules={[
              {
                required: true,
                message: __('Please enter template name', 'kelune-crm'),
              },
              {
                min: 3,
                message: __('Name must be at least 3 characters', 'kelune-crm'),
              },
            ]}
          >
            <Input placeholder={__('e.g., Welcome Email', 'kelune-crm')} />
          </Form.Item>
          <Form.Item
            label={__('Description', 'kelune-crm')}
            name="description"
            style={{ marginBottom: 0 }}
          >
            <Input.TextArea
              rows={3}
              placeholder={__('Describe this template', 'kelune-crm')}
            />
          </Form.Item>
        </Form>

        <div
          style={{
            marginTop: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Space>
            <Button type="primary" onClick={() => handleInfoSubmit(false)}>
              {editingTemplate
                ? __('Update', 'kelune-crm')
                : __('Save', 'kelune-crm')}
            </Button>
            <Button onClick={closeInfoModal}>
              {__('Cancel', 'kelune-crm')}
            </Button>
          </Space>
          <Button type="primary" ghost onClick={() => handleInfoSubmit(true)}>
            {__('Design Template', 'kelune-crm')}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default EmailTemplates;
