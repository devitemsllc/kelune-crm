import React from 'react';
import { Modal } from 'antd';
import { ProUpgradeNotice } from './ProFeatureGate';

interface ProUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  /** Feature name in the heading (e.g. "Update Field"). */
  title: string;
  /** Optional one-line description of what the feature does. */
  description?: string;
}

/**
 * What a locked Pro control opens on click: the upgrade teaser in a dialog.
 * Read-only, so the CTA is the notice's own button and the modal has no footer.
 */
const ProUpgradeModal = ({
  open,
  onClose,
  title,
  description,
}: ProUpgradeModalProps) => (
  <Modal
    destroyOnHidden
    centered
    open={open}
    onCancel={onClose}
    footer={null}
    width={440}
  >
    <ProUpgradeNotice
      title={title}
      description={description}
      padding="20px 0"
    />
  </Modal>
);

export default ProUpgradeModal;
