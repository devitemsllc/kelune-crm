import React from 'react';
import { Modal, Card } from 'antd';
import { __ } from '@wordpress/i18n';
import {
  resolveFooterForPreview,
  PREVIEW_NO_LINK_STYLE,
} from '@/utils/emailFooter';

interface EmailPreviewModalProps {
  open: boolean;
  /** The email HTML to render in the preview iframe. */
  html: string;
  onCancel: () => void;
  title?: React.ReactNode;
  /** Optional blurb shown above the preview (e.g. a template description). */
  description?: React.ReactNode;
  /** Optional footer node rendered below the preview (e.g. a ModalFooter). */
  footer?: React.ReactNode;
  width?: number;
  iframeTitle?: string;
}

/**
 * The one email-preview surface used across the dashboard — template gallery,
 * campaign summary, and automation send_email review — so every "Preview" opens
 * the same modal with the same chrome: a centered dialog with the email rendered
 * in a bordered, margin-reset iframe inside a padding-less Card. Extracted from
 * the original TemplatePreviewModal so the three callers cannot drift apart.
 *
 * The global footer is spliced into every preview here so all three callers show
 * the same footer real recipients receive, without each having to add it.
 */
const EmailPreviewModal = ({
  open,
  html,
  onCancel,
  title = __('Email Preview', 'kelune-crm'),
  description,
  footer,
  width = 800,
  iframeTitle = __('Email preview', 'kelune-crm'),
}: EmailPreviewModalProps) => (
  <Modal
    destroyOnHidden
    centered
    open={open}
    title={title}
    onCancel={onCancel}
    width={width}
    footer={null}
  >
    {description && (
      <p style={{ color: '#666', marginBottom: 16 }}>{description}</p>
    )}
    <Card
      size="small"
      styles={{ body: { padding: 0 } }}
      style={{
        marginBottom: footer ? 24 : 0,
        overflow: 'hidden',
        borderRadius: 0,
      }}
    >
      <iframe
        srcDoc={`<style>html,body{margin:0;padding:0}</style>${PREVIEW_NO_LINK_STYLE}${resolveFooterForPreview(html)}`}
        style={{ width: '100%', height: 600, border: 'none', display: 'block' }}
        title={iframeTitle}
      />
    </Card>
    {footer}
  </Modal>
);

export default EmailPreviewModal;
