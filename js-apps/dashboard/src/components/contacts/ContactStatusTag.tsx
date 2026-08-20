import React from 'react';
import { Tag } from 'antd';
import { contactStatusColor, contactStatusLabel } from './contactStatus';

interface ContactStatusTagProps {
  status?: string;
}

/**
 * The one contact status badge — used by the contacts table and the detail
 * drawer. Labels and colours come from contactStatus, so every surface reads
 * the same vocabulary.
 */
const ContactStatusTag: React.FC<ContactStatusTagProps> = ({ status }) =>
  status ? (
    <Tag bordered={false} color={contactStatusColor(status)}>
      {contactStatusLabel(status)}
    </Tag>
  ) : (
    <>-</>
  );

export default ContactStatusTag;
