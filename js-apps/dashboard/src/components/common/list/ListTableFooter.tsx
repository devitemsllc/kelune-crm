import React from 'react';
import { Row, Col, Pagination } from 'antd';
import { __, sprintf } from '@wordpress/i18n';

interface ListTableFooterProps {
  page: number;
  perPage: number;
  total: number;
  onChange: (page: number, perPage: number) => void;
}

/**
 * Always-on table footer: pagination + page-size changer on the left, a
 * "Showing X - Y of Z" summary on the right. Use as the Table `footer`.
 */
const ListTableFooter = ({
  page,
  perPage,
  total,
  onChange,
}: ListTableFooterProps) => {
  const start = total ? (page - 1) * perPage + 1 : 0;
  const end = Math.min(start + perPage - 1, total);

  return (
    <Row align="middle" justify="space-between" gutter={[8, 8]}>
      <Col>
        <Pagination
          current={page}
          pageSize={perPage}
          total={total}
          showSizeChanger
          onChange={onChange}
        />
      </Col>
      <Col>
        {sprintf(
          /* translators: %1$d: first row number, %2$d: last row number, %3$d: total rows */
          __('Showing %1$d - %2$d of %3$d', 'kelune-crm'),
          start,
          end,
          total
        )}
      </Col>
    </Row>
  );
};

export default ListTableFooter;
