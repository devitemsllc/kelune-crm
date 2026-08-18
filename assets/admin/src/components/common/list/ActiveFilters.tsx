import React from 'react';
import { Row, Col, Tag, Tooltip, Typography, Button, Divider } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import type { FilterGroup } from './listTypes';

interface ActiveFiltersProps {
  /** Active groups (status/lists/tags/sort/…); component hides when empty. */
  groups: FilterGroup[];
  /** When set, renders a global "Clear All" button (clears filters + sort). */
  onClearAll?: () => void;
}

/**
 * Second row of the filter card: one boxed group per active filter dimension
 * (label · chips · clear), plus an optional global Clear Filters button.
 * Separated from the search row by a divider. Renders nothing when idle.
 */
const ActiveFilters = ({ groups, onClearAll }: ActiveFiltersProps) => {
  if (groups.length === 0) {
    return null;
  }

  return (
    <>
      <Divider style={{ margin: '8px 0' }} />
      <Row align="middle" justify="space-between" gutter={[8, 0]}>
        <Col>
          <Row align="middle" gutter={[8, 0]}>
            {groups.map((group) => (
              <Col
                key={group.label}
                style={{ paddingTop: 4, paddingBottom: 4 }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'stretch',
                    minHeight: 32,
                    border: '1px solid #f0f0f0',
                    borderRadius: 6,
                    background: '#fff',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '4px 8px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Typography.Text>{group.label}</Typography.Text>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 6,
                      padding: '4px 8px',
                      borderInlineStart: '1px solid #f0f0f0',
                    }}
                  >
                    {group.chips.map((chip) => (
                      <Tag
                        key={chip.key}
                        bordered={false}
                        closable={group.chips.length > 1}
                        icon={chip.icon}
                        onClose={(e) => {
                          e.preventDefault();
                          chip.onClose();
                        }}
                        style={{ marginInlineEnd: 0 }}
                      >
                        {chip.label}
                      </Tag>
                    ))}
                  </div>
                  <Tooltip
                    title={sprintf(
                      /* translators: %s: filter dimension label, lowercased. */
                      __('Clear %s', 'kelune-crm'),
                      group.label.toLowerCase()
                    )}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={group.onClear}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          group.onClear();
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        cursor: 'pointer',
                        color: '#8c8c8c',
                        borderInlineStart: '1px solid #f0f0f0',
                      }}
                    >
                      <CloseOutlined style={{ fontSize: 12 }} />
                    </div>
                  </Tooltip>
                </div>
              </Col>
            ))}
          </Row>
        </Col>
        {onClearAll && (
          <Col style={{ paddingTop: 4, paddingBottom: 4 }}>
            <Button onClick={onClearAll}>
              {__('Clear All', 'kelune-crm')}
            </Button>
          </Col>
        )}
      </Row>
    </>
  );
};

export default ActiveFilters;
