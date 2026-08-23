import React, { useEffect, useState } from 'react';
import {
  Descriptions,
  Tag,
  Tabs,
  Timeline,
  Empty,
  Space,
  Divider,
  Skeleton,
  List,
  Tooltip,
  Card,
} from 'antd';
import { __ } from '@wordpress/i18n';
import api from '../../services/api';
import ContactStatusTag from './ContactStatusTag';
import { timeDiff, timeFormat } from '../../utils/time';
import { countryName } from '../../utils/countries';
import type {
  Contact,
  Tag as TagModel,
  ContactList,
  ContactEvent,
  EmailLog,
  Note,
  PaginatedItems,
} from '@/types/models';

const { TabPane } = Tabs;

interface ContactDetailProps {
  contact: Contact | null;
}

/** Capitalise the first letter (matches the contacts table's source column). */
const ucFirst = (value?: string): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : '';

/** "email_sent" → "Email sent" for the timeline event label. */
const humanizeEvent = (value?: string): string =>
  value
    ? value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
    : __('Event', 'kelune-crm');

/** Relative time with an absolute-timestamp tooltip (matches the table). */
const renderTime = (date?: string | null): React.ReactNode =>
  date ? (
    <Tooltip title={timeFormat(date)}>
      <span>{timeDiff(date)}</span>
    </Tooltip>
  ) : (
    '-'
  );

const emailStatusColor = (status?: string): string => {
  switch (status) {
    case 'delivered':
    case 'sent':
    case 'opened':
    case 'clicked':
      return 'green';
    case 'failed':
    case 'bounced':
      return 'red';
    case 'queued':
    case 'sending':
      return 'blue';
    default:
      return 'default';
  }
};

const ContactDetail = ({ contact }: ContactDetailProps) => {
  const [events, setEvents] = useState<ContactEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [emails, setEmails] = useState<EmailLog[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);

  const contactId = contact?.id;

  useEffect(() => {
    if (!contactId) {
      setEvents([]);
      setEmails([]);
      return;
    }

    let active = true;

    const loadEvents = async () => {
      setLoadingEvents(true);
      try {
        const response = await api.contacts.getEvents(contactId, {
          per_page: 50,
        });
        if (active) {
          setEvents(response.data || []);
        }
      } catch {
        if (active) {
          setEvents([]);
        }
      } finally {
        if (active) {
          setLoadingEvents(false);
        }
      }
    };

    const loadEmails = async () => {
      setLoadingEmails(true);
      try {
        const response = await api.get<PaginatedItems<EmailLog>>(
          '/email-logs',
          { params: { contact_id: contactId, per_page: 50 } }
        );
        if (active) {
          setEmails(response.data?.items || []);
        }
      } catch {
        if (active) {
          setEmails([]);
        }
      } finally {
        if (active) {
          setLoadingEmails(false);
        }
      }
    };

    loadEvents();
    loadEmails();

    return () => {
      active = false;
    };
  }, [contactId]);

  if (!contact) {
    return <Empty description={__('No contact selected', 'kelune-crm')} />;
  }

  const fullName = `${contact.first_name ?? ''} ${
    contact.last_name ?? ''
  }`.trim();

  return (
    <div className="kelune-crm-cc-contact-detail">
      <Tabs defaultActiveKey="info">
        <TabPane tab={__('Information', 'kelune-crm')} key="info">
          <Descriptions bordered column={1}>
            <Descriptions.Item label={__('Name', 'kelune-crm')}>
              {fullName || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={__('Email', 'kelune-crm')}>
              {contact.email || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={__('Lists', 'kelune-crm')}>
              {contact.lists?.length
                ? contact.lists.map((list: ContactList) => (
                    <Tag bordered={false} key={list.id}>
                      {list.name}
                    </Tag>
                  ))
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={__('Tags', 'kelune-crm')}>
              {contact.tags?.length
                ? contact.tags.map((tag: TagModel) => (
                    <Tag bordered={false} key={tag.id}>
                      {tag.name}
                    </Tag>
                  ))
                : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={__('Status', 'kelune-crm')}>
              <ContactStatusTag status={contact.status} />
            </Descriptions.Item>
            <Descriptions.Item label={__('Company', 'kelune-crm')}>
              {contact.company || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={__('Phone', 'kelune-crm')}>
              {contact.phone || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={__('Address', 'kelune-crm')}>
              {contact.address_line1 || contact.address_line2 ? (
                <>
                  {contact.address_line1}
                  {contact.address_line2 && (
                    <>
                      <br />
                      {contact.address_line2}
                    </>
                  )}
                </>
              ) : (
                '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label={__('City', 'kelune-crm')}>
              {contact.city || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={__('State/Province', 'kelune-crm')}>
              {contact.state || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={__('Postal Code', 'kelune-crm')}>
              {contact.postal_code || '-'}
            </Descriptions.Item>
            <Descriptions.Item label={__('Country', 'kelune-crm')}>
              {contact.country ? countryName(contact.country) : '-'}
            </Descriptions.Item>
            <Descriptions.Item label={__('Source', 'kelune-crm')}>
              {contact.source ? (
                <Tag bordered={false} color="purple">
                  {ucFirst(contact.source)}
                </Tag>
              ) : (
                '-'
              )}
            </Descriptions.Item>
            <Descriptions.Item label={__('Lead Score', 'kelune-crm')}>
              {contact.lead_score || 0}
            </Descriptions.Item>
            <Descriptions.Item label={__('Created Date', 'kelune-crm')}>
              {renderTime(contact.created_at)}
            </Descriptions.Item>
          </Descriptions>

          {/* Custom Fields Section */}
          {contact.custom_fields &&
            Object.keys(contact.custom_fields).length > 0 && (
              <>
                <Divider
                  orientation="left"
                  orientationMargin="0"
                  style={{ marginTop: '24px', marginBottom: '24px' }}
                >
                  {__('Additional Data', 'kelune-crm')}
                </Divider>
                <Descriptions bordered column={1}>
                  {Object.entries(contact.custom_fields).map(([key, value]) => {
                    // Format the field name (remove custom_field__ prefix if exists and convert to title case)
                    const fieldName = key
                      .replace(/^custom_field__/, '')
                      .split('_')
                      .map(
                        (word) => word.charAt(0).toUpperCase() + word.slice(1)
                      )
                      .join(' ');

                    // Format the value based on type
                    let displayValue: React.ReactNode =
                      value as React.ReactNode;
                    if (Array.isArray(value)) {
                      displayValue = value.join(', ');
                    } else if (typeof value === 'object' && value !== null) {
                      displayValue = JSON.stringify(value);
                    } else if (
                      value === null ||
                      value === undefined ||
                      value === ''
                    ) {
                      displayValue = '-';
                    }

                    return (
                      <Descriptions.Item key={key} label={fieldName}>
                        {displayValue}
                      </Descriptions.Item>
                    );
                  })}
                </Descriptions>
              </>
            )}
        </TabPane>

        <TabPane tab={__('Timeline', 'kelune-crm')} key="timeline">
          {loadingEvents ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : (
            <Timeline>
              {events.map((event: ContactEvent) => (
                <Timeline.Item key={event.id}>
                  {event.event_label || humanizeEvent(event.event_type)} -{' '}
                  {renderTime(event.created_at)}
                </Timeline.Item>
              ))}
              <Timeline.Item color="gray">
                {__('Contact created', 'kelune-crm')} -{' '}
                {renderTime(contact.created_at)}
              </Timeline.Item>
            </Timeline>
          )}
        </TabPane>

        <TabPane tab={__('Notes', 'kelune-crm')} key="notes">
          {contact.notes && contact.notes.length > 0 ? (
            contact.notes.map((note: Note, index: number) => (
              <div
                key={note.id || index}
                style={{
                  marginBottom:
                    index < (contact.notes?.length ?? 0) - 1 ? 12 : 0,
                  padding: 12,
                  background: '#f5f5f5',
                  borderRadius: 4,
                }}
              >
                <div style={{ marginBottom: 4 }}>{note.content}</div>
                <div style={{ fontSize: 12, color: '#999' }}>
                  {renderTime(note.created_at)}
                </div>
              </div>
            ))
          ) : (
            <Empty description={__('No notes yet', 'kelune-crm')} />
          )}
        </TabPane>

        <TabPane tab={__('Email History', 'kelune-crm')} key="emails">
          {loadingEmails ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : emails.length > 0 ? (
            <Card size="small" styles={{ body: { padding: 0 } }}>
              <List
                size="small"
                itemLayout="horizontal"
                dataSource={emails}
                renderItem={(email: EmailLog) => (
                  <List.Item style={{ padding: 12, marginBottom: 0 }}>
                    <div style={{ width: '100%' }}>
                      <div style={{ fontWeight: 500, marginBottom: 0 }}>
                        {email.subject || __('(no subject)', 'kelune-crm')}
                      </div>
                      <Space size={8} wrap>
                        <Tag
                          bordered={false}
                          color={emailStatusColor(email.status)}
                        >
                          {ucFirst(email.status) || __('Unknown', 'kelune-crm')}
                        </Tag>
                        <span style={{ color: '#999', fontSize: 12 }}>
                          {renderTime(email.sent_at || email.created_at)}
                        </span>
                      </Space>
                    </div>
                  </List.Item>
                )}
              />
            </Card>
          ) : (
            <Empty description={__('No emails sent yet', 'kelune-crm')} />
          )}
        </TabPane>
      </Tabs>
    </div>
  );
};

export default ContactDetail;
