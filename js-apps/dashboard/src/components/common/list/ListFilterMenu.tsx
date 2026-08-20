import React, { useEffect, useState } from 'react';
import { Dropdown, Button, Checkbox, Empty, Input, DatePicker } from 'antd';
import {
  FilterOutlined,
  RightOutlined,
  LeftOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { __, sprintf } from '@wordpress/i18n';
import { dateRangePresets } from '../../../utils/dateRangePresets';
import type { ID } from '@/types/models';
import type {
  DateRangeFilterValue,
  FilterMenuGroup,
  FilterMenuValue,
} from './listTypes';

const { RangePicker } = DatePicker;

interface ListFilterMenuProps {
  /** Group definitions (Status/Lists/Tags/…) with their options + mode. */
  groups: FilterMenuGroup[];
  /** Current value bag keyed by group key ('' or [] when empty). */
  value: FilterMenuValue;
  onChange: (next: FilterMenuValue) => void;
}

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  cursor: 'pointer',
  borderRadius: 6,
};

const isEmpty = (
  v: string | ID[] | DateRangeFilterValue | undefined
): boolean => {
  if (Array.isArray(v)) {
    return v.length === 0;
  }
  if (v && typeof v === 'object') {
    return !(v.from || v.to);
  }
  return !v;
};

/**
 * Generic drill-down filter dropdown: a root list of groups, each opening a
 * checkbox panel (single- or multi-select, optionally searchable). Mirrors the
 * Contacts filter UX exactly; pass per-page group config.
 */
const ListFilterMenu = ({ groups, value, onChange }: ListFilterMenuProps) => {
  const [view, setView] = useState<string>('root');
  const [search, setSearch] = useState('');

  // Reset the per-group search whenever the active sub-view changes.
  useEffect(() => {
    setSearch('');
  }, [view]);

  const activeCount = groups.reduce(
    (sum, g) => sum + (isEmpty(value[g.key]) ? 0 : Number(true)),
    0
  );

  const clearAll = () => {
    const cleared: FilterMenuValue = {};
    groups.forEach((g) => {
      if (g.mode === 'multi') {
        cleared[g.key] = [];
      } else if (g.mode === 'daterange') {
        cleared[g.key] = { from: '', to: '' };
      } else {
        cleared[g.key] = '';
      }
    });
    onChange(cleared);
  };

  const toggleMulti = (group: FilterMenuGroup, val: ID | string) => {
    const current = ((value[group.key] as ID[]) ?? []).map(Number);
    const num = Number(val);
    const next = current.includes(num)
      ? current.filter((item) => item !== num)
      : [...current, num];
    onChange({ ...value, [group.key]: next });
  };

  const toggleSingle = (group: FilterMenuGroup, val: ID | string) => {
    const current = (value[group.key] as string) ?? '';
    onChange({
      ...value,
      [group.key]: current === String(val) ? '' : String(val),
    });
  };

  const renderRoot = () => (
    <div>
      <div style={{ padding: '0 4px' }}>
        {groups.map((group) => (
          <div
            key={group.key}
            style={ROW_STYLE}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            onClick={() => setView(group.key)}
          >
            <span>{group.label}</span>
            <RightOutlined style={{ fontSize: 12, color: '#bfbfbf' }} />
          </div>
        ))}
      </div>
      {activeCount > 0 && (
        <div
          style={{
            padding: '12px 12px 8px',
            marginTop: 4,
            borderTop: '1px solid #f0f0f0',
          }}
        >
          <Button block size="small" onClick={clearAll}>
            {__('Clear Filters', 'kelune-crm')}
          </Button>
        </div>
      )}
    </div>
  );

  const setRange = (group: FilterMenuGroup, next: DateRangeFilterValue) =>
    onChange({ ...value, [group.key]: next });

  const groupHeader = (group: FilterMenuGroup) => (
    <div
      style={{
        ...ROW_STYLE,
        fontWeight: 500,
        borderBottom: '1px solid #f0f0f0',
        borderRadius: 0,
      }}
      onClick={() => setView('root')}
    >
      <span>
        <LeftOutlined style={{ fontSize: 12, marginRight: 8 }} />
        {group.label}
      </span>
    </div>
  );

  const renderDateRange = (group: FilterMenuGroup) => {
    const range = (value[group.key] as DateRangeFilterValue | undefined) ?? {
      from: '',
      to: '',
    };
    return (
      <div>
        {groupHeader(group)}
        <div style={{ padding: 12 }}>
          <RangePicker
            style={{ width: '100%' }}
            presets={dateRangePresets}
            format="YYYY-MM-DD"
            placeholder={[
              __('From date', 'kelune-crm'),
              __('To date', 'kelune-crm'),
            ]}
            value={
              range.from && range.to
                ? [dayjs(range.from), dayjs(range.to)]
                : null
            }
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setRange(group, {
                  from: dates[0].format('YYYY-MM-DD'),
                  to: dates[1].format('YYYY-MM-DD'),
                });
              } else {
                setRange(group, { from: '', to: '' });
              }
            }}
          />
        </div>
      </div>
    );
  };

  const renderGroup = (group: FilterMenuGroup) => {
    if (group.mode === 'daterange') {
      return renderDateRange(group);
    }

    const options = group.options ?? [];
    const isChecked = (val: ID | string): boolean =>
      group.mode === 'multi'
        ? ((value[group.key] as ID[]) ?? []).map(Number).includes(Number(val))
        : (value[group.key] as string) === String(val);
    const onToggle = (val: ID | string) =>
      group.mode === 'multi'
        ? toggleMulti(group, val)
        : toggleSingle(group, val);

    const term = search.trim().toLowerCase();
    const visibleItems =
      group.searchable && term
        ? options.filter((item) => item.label.toLowerCase().includes(term))
        : options;

    return (
      <div>
        {groupHeader(group)}
        {group.searchable && (
          <div
            style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}
          >
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
              placeholder={sprintf(
                /* translators: %s: filter group label, lowercased */
                __('Search %s...', 'kelune-crm'),
                group.label.toLowerCase()
              )}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <div style={{ padding: '12px 0 8px' }}>
          <div style={{ maxHeight: 252, overflowY: 'auto', padding: '0 12px' }}>
            {visibleItems.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={sprintf(
                  /* translators: %s: filter group label, lowercased */
                  __('No %s', 'kelune-crm'),
                  group.label.toLowerCase()
                )}
                style={{ margin: '12px 0' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visibleItems.map((item) => (
                  <Checkbox
                    key={String(item.value)}
                    checked={isChecked(item.value)}
                    onChange={() => onToggle(item.value)}
                  >
                    {item.label}
                  </Checkbox>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const activeGroup = groups.find((g) => g.key === view);

  return (
    <Dropdown
      arrow
      trigger={['click']}
      onOpenChange={(open) => {
        if (!open) {
          setView('root');
        }
      }}
      dropdownRender={() => (
        <div
          style={{
            background: '#fff',
            padding: '4px 0',
            borderRadius: 8,
            boxShadow: '0 6px 16px rgba(0, 0, 0, 0.12)',
            width: activeGroup?.mode === 'daterange' ? 280 : 240,
          }}
        >
          {activeGroup ? renderGroup(activeGroup) : renderRoot()}
        </div>
      )}
    >
      <Button icon={<FilterOutlined />}>{__('Filters', 'kelune-crm')}</Button>
    </Dropdown>
  );
};

export default ListFilterMenu;
