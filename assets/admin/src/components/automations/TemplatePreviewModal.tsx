import React from 'react';
import { Modal, Timeline, Alert, Divider } from 'antd';
import {
  ThunderboltOutlined,
  MailOutlined,
  BranchesOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import ModalFooter from '../common/ModalFooter';

interface TemplateStep {
  step_type?: string;
  label?: string;
  trigger_type?: string;
  action_type?: string;
  condition_type?: string;
  delay_type?: string;
  delay_value?: number | string;
  action_config?: { subject?: string; [key: string]: unknown };
  condition_config?: { field?: string; [key: string]: unknown };
  [key: string]: unknown;
}

interface AutomationTemplate {
  name?: string;
  description?: string;
  steps?: TemplateStep[];
  [key: string]: unknown;
}

interface TemplatePreviewModalProps {
  template: AutomationTemplate | null;
  visible: boolean;
  onClose: () => void;
  onUse: (template: AutomationTemplate) => void;
}

const TemplatePreviewModal = ({
  template,
  visible,
  onClose,
  onUse,
}: TemplatePreviewModalProps) => {
  if (!template) return null;

  const getStepIcon = (stepType?: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      trigger: <ThunderboltOutlined style={{ color: '#faad14' }} />,
      action: <MailOutlined style={{ color: '#1890ff' }} />,
      condition: <BranchesOutlined style={{ color: '#fa8c16' }} />,
      delay: <ClockCircleOutlined style={{ color: '#597ef7' }} />,
    };

    return (stepType && iconMap[stepType]) || <CheckCircleOutlined />;
  };

  const getStepTitle = (step: TemplateStep) => {
    if (step.step_type === 'trigger') {
      return sprintf(
        // translators: %s: trigger label or type.
        __('Trigger: %s', 'kelune-crm'),
        step.label || step.trigger_type
      );
    }
    if (step.step_type === 'action') {
      return sprintf(
        // translators: %s: action label or type.
        __('Action: %s', 'kelune-crm'),
        step.label || step.action_type
      );
    }
    if (step.step_type === 'condition') {
      return sprintf(
        // translators: %s: condition label or type.
        __('Condition: %s', 'kelune-crm'),
        step.label || step.condition_type
      );
    }
    if (step.step_type === 'delay') {
      return sprintf(
        // translators: 1: delay value, 2: delay unit.
        __('Delay: %1$s %2$s', 'kelune-crm'),
        step.delay_value,
        step.delay_type
      );
    }
    return step.label || __('Step', 'kelune-crm');
  };

  const getStepDescription = (step: TemplateStep) => {
    if (step.step_type === 'action' && step.action_type === 'send_email') {
      return sprintf(
        // translators: %s: email subject.
        __('Subject: %s', 'kelune-crm'),
        step.action_config?.subject || __('Email', 'kelune-crm')
      );
    }
    if (step.step_type === 'condition') {
      return sprintf(
        // translators: %s: condition field.
        __('Check: %s', 'kelune-crm'),
        step.condition_config?.field || __('condition', 'kelune-crm')
      );
    }
    return null;
  };

  return (
    <Modal
      destroyOnHidden
      centered
      title={
        <div>
          <div>{template.name}</div>
          <div
            style={{
              fontSize: 13,
              color: '#8c8c8c',
              fontWeight: 'normal',
              marginTop: 4,
            }}
          >
            {__('Template Preview', 'kelune-crm')}
          </div>
        </div>
      }
      visible={visible}
      onCancel={onClose}
      width={700}
      footer={null}
    >
      {/* Description */}
      <Alert
        message={template.description}
        type="info"
        style={{ marginBottom: 24, border: 'none' }}
      />

      {/* What You Need to Customize */}
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          {__('What You’ll Need to Customize:', 'kelune-crm')}
        </h4>
        <ul
          style={{
            marginLeft: 20,
            marginTop: 0,
            listStyleType: 'disc',
            fontSize: 13,
            color: '#595959',
          }}
        >
          <li>{__('Email content and subject lines', 'kelune-crm')}</li>
          {template.steps?.some((s) => s.trigger_type === 'form_submit') && (
            <li>{__('Select your form for the trigger', 'kelune-crm')}</li>
          )}
          {template.steps?.some((s) => s.action_type === 'add_tag') && (
            <li>{__('Choose which tags to add/remove', 'kelune-crm')}</li>
          )}
          {template.steps?.some((s) => s.step_type === 'delay') && (
            <li>{__('Adjust timing delays as needed', 'kelune-crm')}</li>
          )}
          <li>{__('Review and test before activating', 'kelune-crm')}</li>
        </ul>
      </div>

      <Divider />

      {/* Workflow Steps */}
      <div>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
          {sprintf(
            // translators: %d: number of workflow steps.
            __('Workflow Steps (%d steps):', 'kelune-crm'),
            template.steps?.length || 0
          )}
        </h4>

        <Timeline>
          {template.steps?.map((step, index) => (
            <Timeline.Item key={index} dot={getStepIcon(step.step_type)}>
              <div style={{ paddingBottom: 8 }}>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>
                  {getStepTitle(step)}
                </div>
                {getStepDescription(step) && (
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                    {getStepDescription(step)}
                  </div>
                )}
              </div>
            </Timeline.Item>
          ))}
        </Timeline>
      </div>

      <Divider />

      {/* Expected Results */}
      <div>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
          {__('Expected Results:', 'kelune-crm')}
        </h4>
        <Alert
          message={
            <ul
              style={{
                marginLeft: 20,
                marginTop: 0,
                marginBottom: 0,
                listStyleType: 'disc',
                fontSize: 13,
              }}
            >
              <li>
                {__(
                  'Automated workflow saves time and ensures consistency',
                  'kelune-crm'
                )}
              </li>
              <li>
                {__(
                  'Contacts receive timely, relevant communications',
                  'kelune-crm'
                )}
              </li>
              <li>
                {__('Better engagement and conversion rates', 'kelune-crm')}
              </li>
              <li>
                {__(
                  'Fully customizable to fit your brand and needs',
                  'kelune-crm'
                )}
              </li>
            </ul>
          }
          type="success"
          style={{ border: 'none' }}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <ModalFooter
          onOk={() => {
            onUse(template);
            onClose();
          }}
          okText={__('Use This Template', 'kelune-crm')}
          onCancel={onClose}
          cancelText={__('Cancel', 'kelune-crm')}
        />
      </div>
    </Modal>
  );
};

export default TemplatePreviewModal;
