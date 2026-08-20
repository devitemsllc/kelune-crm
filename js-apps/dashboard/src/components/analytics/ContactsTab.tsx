import React, { useEffect } from 'react';
import { __ } from '@wordpress/i18n';
import { Card, Row, Col, Empty } from 'antd';
import { Area, Column, Pie } from '@ant-design/charts';
import { useDispatch, useSelector } from '@store/hooks';
import { fetchContactsAnalytics } from '../../store/slices/analyticsSlice';
import { CHART_COLORS, barStyle } from './chartUtils';
import { contactStatusLabel } from '../contacts/contactStatus';

// Fixed display order for the By Status donut — drives both slice sequence and
// legend order. Any status not listed (a legacy value) falls to the end.
const STATUS_ORDER = ['active', 'pending', 'bounced', 'unsubscribed'];

// Per-status slice colour, keyed to STATUS_ORDER above.
const STATUS_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.amber,
  CHART_COLORS.teal,
  CHART_COLORS.red,
];

const statusRank = (status: string): number => {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? STATUS_ORDER.length : i;
};

const ContactsTab: React.FC = () => {
  const dispatch = useDispatch();
  const { contacts, loading, range } = useSelector((s) => s.analytics);
  const isLoading = loading.contacts;

  useEffect(() => {
    dispatch(fetchContactsAnalytics(range));
  }, [dispatch, range]);

  const statusData = [...(contacts?.byStatus ?? [])]
    .sort((a, b) => statusRank(a.status) - statusRank(b.status))
    .map((s) => ({ label: contactStatusLabel(s.status), value: s.count }));

  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} lg={16}>
        <Card
          size="small"
          title={__('Contact Growth', 'kelune-crm')}
          loading={isLoading}
        >
          <Area
            data={contacts?.series ?? []}
            xField="date"
            yField="count"
            shapeField="smooth"
            height={280}
            style={{ fill: CHART_COLORS.primary, fillOpacity: 0.15 }}
            line={{ style: { stroke: CHART_COLORS.primary } }}
            axis={{ x: { title: false }, y: { title: false } }}
          />
        </Card>
      </Col>
      <Col xs={24} lg={8}>
        <Card
          size="small"
          title={__('By Status', 'kelune-crm')}
          loading={isLoading}
        >
          {statusData.length > 0 ? (
            <Pie
              data={statusData}
              angleField="value"
              colorField="label"
              innerRadius={0.6}
              height={280}
              scale={{
                color: {
                  domain: statusData.map((d) => d.label),
                  range: STATUS_PALETTE,
                },
              }}
              style={{ fillOpacity: 0.45 }}
              legend={{
                color: {
                  position: 'bottom',
                  layout: { justifyContent: 'center' },
                },
              }}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card
          size="small"
          title={__('Top Tags', 'kelune-crm')}
          loading={isLoading}
        >
          {(contacts?.topTags ?? []).length > 0 ? (
            <Column
              data={contacts?.topTags ?? []}
              xField="name"
              yField="count"
              height={280}
              style={barStyle(CHART_COLORS.violet)}
              axis={{ x: { title: false }, y: { title: false } }}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card
          size="small"
          title={__('Top Lists', 'kelune-crm')}
          loading={isLoading}
        >
          {(contacts?.topLists ?? []).length > 0 ? (
            <Column
              data={contacts?.topLists ?? []}
              xField="name"
              yField="count"
              height={280}
              style={barStyle(CHART_COLORS.teal)}
              axis={{ x: { title: false }, y: { title: false } }}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </Col>
      <Col xs={24}>
        <Card
          size="small"
          title={__('Top Countries', 'kelune-crm')}
          loading={isLoading}
        >
          {(contacts?.topCountries ?? []).length > 0 ? (
            <Column
              data={contacts?.topCountries ?? []}
              xField="name"
              yField="count"
              height={280}
              style={barStyle(CHART_COLORS.amber)}
              axis={{ x: { title: false }, y: { title: false } }}
            />
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )}
        </Card>
      </Col>
    </Row>
  );
};

export default ContactsTab;
