import React from 'react';
import { __, sprintf } from '@wordpress/i18n';
import EmailPreviewModal from '../common/EmailPreviewModal';
import ModalFooter from '../common/ModalFooter';
import type { EmailTemplate } from '@/types/models';

interface TemplatePreviewModalProps {
  visible: boolean;
  template: EmailTemplate | null;
  onCancel: () => void;
  onSelect?: (template: EmailTemplate) => void;
}

const TemplatePreviewModal = ({
  visible,
  template,
  onCancel,
  onSelect,
}: TemplatePreviewModalProps) => {
  if (!template) {
    return null;
  }

  return (
    <EmailPreviewModal
      open={visible}
      title={template.name}
      html={template.html_content ?? ''}
      iframeTitle={sprintf(
        // translators: %s is the template name.
        __('Preview of %s', 'kelune-crm'),
        template.name
      )}
      onCancel={onCancel}
      footer={
        <ModalFooter
          onOk={onSelect ? () => onSelect(template) : undefined}
          okText={__('Use This Template', 'kelune-crm')}
          onCancel={onCancel}
          cancelText={__('Close', 'kelune-crm')}
        />
      }
    />
  );
};

export default TemplatePreviewModal;
