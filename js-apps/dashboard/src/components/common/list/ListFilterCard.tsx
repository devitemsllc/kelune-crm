import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Input, Space } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import ActiveFilters from './ActiveFilters';
import type { FilterGroup } from './listTypes';

interface ListFilterCardProps {
  /** Committed (debounced) search term, from the persisted view. */
  search: string;
  /** Fired with the new term after the debounce window. */
  onSearchChange: (term: string) => void;
  searchPlaceholder?: string;
  /** Right-aligned controls: ListFilterMenu, ListSort, ColumnsButton, … */
  controls?: React.ReactNode;
  /** Active-filter groups rendered on the second row. */
  filterGroups: FilterGroup[];
  /** When set, renders the global "Clear All" button (clears filters + sort). */
  onClearAll?: () => void;
  /** Debounce window for search-as-you-type (ms). */
  debounceMs?: number;
}

/**
 * The grey filter card: search on the left, dropdown controls on the right,
 * and the active-filters row below a divider. Owns the debounced search input
 * so pages only deal with the committed term.
 */
const ListFilterCard = ({
  search,
  onSearchChange,
  searchPlaceholder = __('Search...', 'kelune-crm'),
  controls,
  filterGroups,
  onClearAll,
  debounceMs = 350,
}: ListFilterCardProps) => {
  const [input, setInput] = useState(search);

  // Keep the box in sync when the term is reset/changed from outside.
  useEffect(() => {
    setInput((prev) => (prev !== search ? search : prev));
  }, [search]);

  // Debounce the box into the committed term (search-as-you-type).
  useEffect(() => {
    const handle = setTimeout(() => {
      if (input !== search) {
        onSearchChange(input);
      }
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [input, search, onSearchChange, debounceMs]);

  return (
    <Card
      size="small"
      style={{ marginBottom: 16, background: '#fafafa' }}
      bodyStyle={{ padding: '8px 12px' }}
    >
      <Row align="middle" justify="space-between" gutter={[8, 0]}>
        <Col style={{ paddingTop: 4, paddingBottom: 4 }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder={searchPlaceholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            style={{ width: 280 }}
          />
        </Col>
        {controls && (
          <Col style={{ paddingTop: 4, paddingBottom: 4 }}>
            <Space size={8}>{controls}</Space>
          </Col>
        )}
      </Row>
      <ActiveFilters groups={filterGroups} onClearAll={onClearAll} />
    </Card>
  );
};

export default ListFilterCard;
