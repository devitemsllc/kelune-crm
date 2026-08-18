import React from 'react';
import { Dropdown, Button, Segmented, Tooltip, Checkbox } from 'antd';
import {
  SwapOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
} from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import { isSortActive } from './listTypes';
import type { SortOption, SortOrder, SortValue } from './listTypes';

interface ListSortProps {
  value: SortValue;
  onChange: (next: SortValue) => void;
  /** Sortable fields, mirroring the backend's whitelisted orderby columns. */
  options: SortOption[];
  /** Field/order applied when nothing is actively selected. */
  defaultSort: SortValue;
  /** Fields that read like dates (default DESC = newest first). */
  chronologicalFields?: string[];
  /** Numeric fields (default DESC = highest first). */
  numericFields?: string[];
}

/**
 * Generic sort dropdown: single-select field list + ASC/DESC segmented control
 * + Clear Sort. Direction hints adapt to the field kind (date/number/text).
 * Contacts is the reference consumer; pass per-page options + defaultSort.
 */
const ListSort = ({
  value,
  onChange,
  options,
  defaultSort,
  chronologicalFields = [],
  numericFields = [],
}: ListSortProps) => {
  const isActive = isSortActive(value, defaultSort);

  // Natural direction when a field is first picked.
  const naturalOrder = (field: string): SortOrder =>
    chronologicalFields.includes(field) || numericFields.includes(field)
      ? 'DESC'
      : 'ASC';

  // Formal term plus a plain-language hint, e.g. "Ascending (Oldest first)".
  const directionHint = (field: string, order: SortOrder): string => {
    const term =
      order === 'ASC'
        ? __('Ascending', 'kelune-crm')
        : __('Descending', 'kelune-crm');
    let meaning: string;
    if (chronologicalFields.includes(field)) {
      meaning =
        order === 'ASC'
          ? __('Oldest first', 'kelune-crm')
          : __('Newest first', 'kelune-crm');
    } else if (numericFields.includes(field)) {
      meaning =
        order === 'ASC'
          ? __('Lowest first', 'kelune-crm')
          : __('Highest first', 'kelune-crm');
    } else {
      meaning =
        order === 'ASC' ? __('A → Z', 'kelune-crm') : __('Z → A', 'kelune-crm');
    }
    return sprintf(
      /* translators: %1$s: sort direction term, %2$s: plain-language hint. */
      __('%1$s (%2$s)', 'kelune-crm'),
      term,
      meaning
    );
  };

  return (
    <Dropdown
      arrow
      trigger={['click']}
      dropdownRender={() => (
        <div
          style={{
            background: '#fff',
            padding: '12px 0 8px',
            borderRadius: 8,
            boxShadow: '0 6px 16px rgba(0, 0, 0, 0.12)',
            width: 240,
          }}
        >
          <div style={{ maxHeight: 252, overflowY: 'auto', padding: '0 12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {options.map((option) => {
                const selected = value.field === option.value;
                return (
                  <Checkbox
                    key={option.value}
                    checked={selected}
                    onChange={() =>
                      // Single-select: pick a field with its natural direction,
                      // or uncheck the current one to fall back to the default.
                      onChange(
                        selected
                          ? defaultSort
                          : {
                              field: option.value,
                              order: naturalOrder(option.value),
                            }
                      )
                    }
                  >
                    {option.label}
                  </Checkbox>
                );
              })}
            </div>
          </div>

          <div
            style={{
              padding: '12px 12px 4px',
              marginTop: 12,
              borderTop: '1px solid #f0f0f0',
            }}
          >
            <Segmented
              block
              value={value.order}
              onChange={(order) =>
                onChange({ field: value.field, order: order as SortOrder })
              }
              options={[
                {
                  value: 'ASC',
                  label: (
                    <Tooltip title={directionHint(value.field, 'ASC')}>
                      {__('ASC', 'kelune-crm')}
                    </Tooltip>
                  ),
                  icon: <SortAscendingOutlined />,
                },
                {
                  value: 'DESC',
                  label: (
                    <Tooltip title={directionHint(value.field, 'DESC')}>
                      {__('DESC', 'kelune-crm')}
                    </Tooltip>
                  ),
                  icon: <SortDescendingOutlined />,
                },
              ]}
            />
          </div>

          {isActive && (
            <div style={{ padding: '8px 12px 4px' }}>
              <Button block size="small" onClick={() => onChange(defaultSort)}>
                {__('Clear Sort', 'kelune-crm')}
              </Button>
            </div>
          )}
        </div>
      )}
    >
      <Button icon={<SwapOutlined rotate={90} />}>
        {__('Sort', 'kelune-crm')}
      </Button>
    </Dropdown>
  );
};

export default ListSort;
