import React, { useCallback, useEffect, useState } from 'react';
import { __ } from '@wordpress/i18n';
import {
  Modal,
  Table,
  Button,
  Space,
  Tag,
  Tabs,
  Tooltip,
  Typography,
  message,
} from 'antd';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import {
  EyeOutlined,
  StarFilled,
  StarOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import api from '../../services/api';
import {
  ListFilterCard,
  ListFilterMenu,
  ListSort,
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
  NUMERIC_FIELDS,
  isSortActive,
  sortFieldLabel,
} from './emailTemplateSortOptions';
import type { SortOrder } from './emailTemplateSortOptions';
import TemplatePreviewModal from './TemplatePreviewModal';
import { resolveTemplateEditor, editorModeLabel } from '@/utils/templateEditor';
import type { EmailTemplate, PaginatedItems } from '@/types/models';

const { Text } = Typography;

const FAVORITE_OPTIONS = [
  { value: '1', label: __('Favorites', 'kelune-crm') },
  { value: '0', label: __('Non-favorites', 'kelune-crm') },
];

// Non-persisted view-state for the custom-templates tab. Mirrors the fields the
// email templates listing page filters/sorts on, but is transient (a picker
// should not survive reloads via useListState).
interface GalleryView {
  search: string;
  favorite: string;
  page: number;
  perPage: number;
  sortField: string;
  sortOrder: SortOrder;
}

const DEFAULT_VIEW: GalleryView = {
  search: '',
  favorite: '',
  page: 1,
  perPage: 20,
  sortField: DEFAULT_SORT.field,
  sortOrder: DEFAULT_SORT.order,
};

// The Editor column: which editor a template opens in (Visual builder vs Rich
// Text), derived from its stored structure — the same rule the content editor
// uses to decide whether importing it needs an editor switch.
const editorColumn: ColumnType<EmailTemplate> = {
  title: __('Editor', 'kelune-crm'),
  key: 'editor',
  render: (_: unknown, record: EmailTemplate) => {
    const mode = resolveTemplateEditor(record);
    return (
      <Tag bordered={false} color={mode === 'builder' ? 'geekblue' : 'gold'}>
        {editorModeLabel(mode)}
      </Tag>
    );
  },
};

interface TemplateGalleryModalProps {
  visible: boolean;
  onCancel: () => void;
  onSelect: (template: EmailTemplate) => void;
}

const TemplateGalleryModal = ({
  visible,
  onCancel,
  onSelect,
}: TemplateGalleryModalProps) => {
  const [activeTab, setActiveTab] = useState<'custom' | 'builtin'>('custom');
  // Whether the user has ANY custom templates (unfiltered). null = still
  // probing. When false the Custom tab is hidden entirely and only Built-in
  // shows — a brand-new site opens straight into the built-in set.
  const [hasCustom, setHasCustom] = useState<boolean | null>(null);

  // Custom (user-created) templates — fetched here rather than through the
  // shared Redux slice so the picker never clobbers the list page's items.
  const [customItems, setCustomItems] = useState<EmailTemplate[]>([]);
  const [customTotal, setCustomTotal] = useState(0);
  const [customLoading, setCustomLoading] = useState(false);
  const [view, setView] = useState<GalleryView>(DEFAULT_VIEW);

  // Built-in templates come from code (served on the fly, never stored). A small
  // fixed set — no search/filter/pagination.
  const [builtinItems, setBuiltinItems] = useState<EmailTemplate[]>([]);
  const [builtinLoading, setBuiltinLoading] = useState(false);

  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(
    null
  );
  const [previewVisible, setPreviewVisible] = useState(false);

  // Any filter/search/sort change resets to page 1; pagination alone changes it.
  const setFilters = useCallback(
    (updater: (prev: GalleryView) => GalleryView) =>
      setView((prev) => ({ ...updater(prev), page: 1 })),
    []
  );

  // Reset the picker each time it opens, then probe whether any custom template
  // exists so the Custom tab can be hidden (and Built-in shown) when there are
  // none. The probe total is unfiltered, so a later search never hides the tab.
  useEffect(() => {
    if (!visible) {
      return;
    }
    setView(DEFAULT_VIEW);
    setHasCustom(null);
    let cancelled = false;
    api
      .get<PaginatedItems<EmailTemplate>>('/email-templates', {
        params: { per_page: 1 },
      })
      .then((response) => {
        if (cancelled) {
          return;
        }
        const exists = (response.data.total ?? 0) > 0;
        setHasCustom(exists);
        setActiveTab(exists ? 'custom' : 'builtin');
      })
      .catch(() => {
        if (!cancelled) {
          setHasCustom(false);
          setActiveTab('builtin');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // Load custom templates when that tab is active.
  useEffect(() => {
    if (!visible || activeTab !== 'custom') {
      return;
    }
    let cancelled = false;
    setCustomLoading(true);
    api
      .get<PaginatedItems<EmailTemplate>>('/email-templates', {
        params: {
          page: view.page,
          per_page: view.perPage,
          search: view.search,
          ...(view.favorite !== '' ? { is_favorite: view.favorite } : {}),
          orderby: view.sortField,
          order: view.sortOrder,
        },
      })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setCustomItems(response.data.items);
        setCustomTotal(response.data.total);
      })
      .catch(() => {
        if (!cancelled) {
          message.error(__('Failed to load templates', 'kelune-crm'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCustomLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    visible,
    activeTab,
    view.page,
    view.perPage,
    view.search,
    view.favorite,
    view.sortField,
    view.sortOrder,
  ]);

  // Load built-in templates once the modal opens (used by the Built-in tab).
  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    setBuiltinLoading(true);
    api
      .get<{ items: EmailTemplate[] }>('/email-templates/predefined')
      .then((response) => {
        if (!cancelled) {
          setBuiltinItems(response.data.items ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          message.error(__('Failed to load built-in templates', 'kelune-crm'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBuiltinLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handlePreview = (template: EmailTemplate) => {
    setPreviewTemplate(template);
    setPreviewVisible(true);
  };

  const handleSelectTemplate = (template: EmailTemplate) => {
    onSelect(template);
  };

  const handleSelectFromPreview = (template: EmailTemplate) => {
    setPreviewVisible(false);
    handleSelectTemplate(template);
  };

  const nameColumn: ColumnType<EmailTemplate> = {
    title: __('Template', 'kelune-crm'),
    key: 'template',
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
  };

  const actionsColumn: ColumnType<EmailTemplate> = {
    title: __('Actions', 'kelune-crm'),
    key: 'actions',
    align: 'right',
    render: (_, record) => (
      <Space>
        <Tooltip title={__('Preview', 'kelune-crm')}>
          <Button
            shape="default"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handlePreview(record)}
          />
        </Tooltip>
        <Button
          type="primary"
          size="small"
          onClick={() => handleSelectTemplate(record)}
        >
          {__('Use', 'kelune-crm')}
        </Button>
      </Space>
    ),
  };

  const favoriteColumn: ColumnType<EmailTemplate> = {
    title: '',
    dataIndex: 'is_favorite',
    key: 'favorite',
    fixed: 'left',
    width: 48,
    align: 'center',
    render: (isFavorite) =>
      isFavorite ? (
        <StarFilled style={{ color: '#faad14' }} />
      ) : (
        <StarOutlined style={{ color: '#bfbfbf' }} />
      ),
  };

  const customColumns: ColumnsType<EmailTemplate> = [
    favoriteColumn,
    nameColumn,
    editorColumn,
    actionsColumn,
  ];

  const builtinColumns: ColumnsType<EmailTemplate> = [
    nameColumn,
    editorColumn,
    actionsColumn,
  ];

  const filterMenuGroups: FilterMenuGroup[] = [
    {
      key: 'favorite',
      label: __('Favorite', 'kelune-crm'),
      mode: 'single',
      options: FAVORITE_OPTIONS,
    },
  ];

  const filterMenuValue: FilterMenuValue = {
    favorite: view.favorite,
  };

  // Active-filter chip groups shown on the filter card's second row.
  const activeFilterGroups: FilterGroup[] = [];

  if (view.favorite) {
    const label =
      FAVORITE_OPTIONS.find((o) => o.value === view.favorite)?.label ??
      view.favorite;
    activeFilterGroups.push({
      label: __('Favorite', 'kelune-crm'),
      onClear: () => setFilters((prev) => ({ ...prev, favorite: '' })),
      chips: [
        {
          key: `favorite-${view.favorite}`,
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

  const hasFilters = Boolean(view.favorite);
  const sortActive = isSortActive({
    field: view.sortField,
    order: view.sortOrder,
  });
  const clearAll = () =>
    setFilters((prev) => ({
      ...prev,
      favorite: '',
      sortField: DEFAULT_SORT.field,
      sortOrder: DEFAULT_SORT.order,
    }));

  // Custom tab: user-created templates with search, favourite filter and sort.
  const customTab = (
    <>
      <ListFilterCard
        search={view.search}
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
          </>
        }
      />

      <Table
        columns={customColumns}
        dataSource={customItems}
        rowKey="id"
        loading={customLoading}
        scroll={{ x: 'max-content' }}
        pagination={false}
        footer={() => (
          <ListTableFooter
            page={view.page}
            perPage={view.perPage}
            total={customTotal}
            onChange={(nextPage, nextSize) =>
              setView((prev) => ({
                ...prev,
                page: nextPage,
                perPage: nextSize,
              }))
            }
          />
        )}
      />
    </>
  );

  // Built-in tab: a small fixed set of code templates. No filter card.
  const builtinTab = (
    <Table
      columns={builtinColumns}
      dataSource={builtinItems}
      rowKey="id"
      loading={builtinLoading}
      scroll={{ x: 'max-content' }}
      pagination={false}
    />
  );

  const builtinTabItem = {
    key: 'builtin',
    label: __('Built-in', 'kelune-crm'),
    children: builtinTab,
  };
  const customTabItem = {
    key: 'custom',
    label: __('Custom', 'kelune-crm'),
    children: customTab,
  };
  // Hide the Custom tab entirely when the site has no custom templates.
  const tabItems =
    hasCustom === false ? [builtinTabItem] : [customTabItem, builtinTabItem];

  return (
    <>
      <Modal
        destroyOnHidden
        centered
        open={visible}
        title={__('Select Email Template', 'kelune-crm')}
        onCancel={onCancel}
        width={800}
        footer={null}
        styles={{ body: { padding: '8px 20px 20px 20px' } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'custom' | 'builtin')}
          items={tabItems}
        />
      </Modal>

      {/* Preview Modal */}
      <TemplatePreviewModal
        visible={previewVisible}
        template={previewTemplate}
        onCancel={() => setPreviewVisible(false)}
        onSelect={handleSelectFromPreview}
      />
    </>
  );
};

export default TemplateGalleryModal;
