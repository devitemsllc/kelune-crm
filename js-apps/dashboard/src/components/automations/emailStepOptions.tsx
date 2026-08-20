import React from 'react';
import {
  MailOutlined,
  SendOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { __ } from '@wordpress/i18n';

/**
 * The send_email action's config steps.
 *
 * Mirrors the campaign wizard: Basic Info → Content → Review. The campaign's
 * Recipients step does not apply here (the recipient is whichever contact the
 * automation enrolled), but the Review step does — it recaps subject, preheader
 * and sender and offers an email preview before the step is saved.
 *
 * Shared between the panel (which renders the Steps bar) and the canvas (whose
 * drawer footer renders Next/Previous), so the two cannot disagree on how many
 * steps there are.
 */
export const EMAIL_STEPS: { title: string; icon: React.ReactNode }[] = [
  { title: __('Basic Info', 'kelune-crm'), icon: <MailOutlined /> },
  { title: __('Content', 'kelune-crm'), icon: <SendOutlined /> },
  { title: __('Review', 'kelune-crm'), icon: <CheckCircleOutlined /> },
];
