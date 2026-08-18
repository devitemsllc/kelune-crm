import React, { useEffect, useMemo, useState } from 'react';
import { Button, Drawer, Form, Space, Tabs, Tooltip, message } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import ActionConfirm from '../common/ActionConfirm';
import StepConfigPanel from './StepConfigPanel';
import { findActionType } from './actionTypeOptions';
import { EMAIL_STEPS } from './emailStepOptions';
import { isProActive } from '../../hooks/useFeature';

type StepType = 'action' | 'condition' | 'delay';

interface AddStepDrawerProps {
  open: boolean;
  onClose: () => void;
  /**
   * The step being edited, or null/undefined to add a new one. In edit mode the
   * drawer opens on that step's tab, pre-filled, and switching tabs lets the user
   * change the step's type.
   */
  editNode?: {
    id: string;
    type?: string;
    data: Record<string, unknown>;
  } | null;
  /**
   * Commit a fully-configured step. `editId` is the node being updated (edit
   * mode) or undefined to insert a new one. The canvas applies it to the graph
   * and persists immediately (no debounce).
   */
  onSubmit: (
    stepType: StepType,
    values: Record<string, unknown>,
    editId?: string
  ) => void;
  /** Delete the step being edited. Only offered in edit mode (add has nothing to
   *  delete); the trigger is locked upstream and never reaches this drawer. */
  onDelete?: (editId: string) => void;
}

// The synthetic node each tab feeds to StepConfigPanel — same shape the canvas
// builds for a real node, seeded with each type's defaults. Action starts with
// no type so the panel opens on the action picker.
const draftNodeFor = (
  type: StepType
): { id: string; type: StepType; data: Record<string, unknown> } => {
  switch (type) {
    case 'condition':
      return {
        id: 'draft-condition',
        type,
        data: { condition_type: 'field_value' },
      };
    case 'delay':
      return {
        id: 'draft-delay',
        type,
        data: { delay_type: 'days', delay_value: 1 },
      };
    case 'action':
    default:
      return { id: 'draft-action', type: 'action', data: {} };
  }
};

/**
 * Unified "Add Step" surface: one drawer with an Action / Condition / Delay tab,
 * modelled on the Contact Details drawer (Tabs, same body padding). It reuses
 * StepConfigPanel — so the action list, every single-step config form, and the
 * full send_email wizard are identical whether adding or editing — and commits
 * the step in one save. It is used both for the header "Add Step" button and for
 * editing an existing action/condition/delay node, so the type can be switched
 * from either entry point.
 */
const AddStepDrawer = ({
  open,
  onClose,
  editNode,
  onSubmit,
  onDelete,
}: AddStepDrawerProps) => {
  const editing = Boolean(editNode);
  // Condition steps are executed only by the Pro add-on (ProcessorRegistry has no
  // 'condition' processor in Free), so the Condition tab is hidden until Pro is
  // active — except when editing an existing condition step (e.g. after a
  // downgrade) so it stays viewable/removable.
  const proActive = isProActive();
  const showCondition = proActive || editNode?.type === 'condition';
  const [form] = Form.useForm();
  const [activeTab, setActiveTab] = useState<StepType>('action');
  // Which send_email pane is showing; driven by this drawer's Next/Previous.
  const [emailStep, setEmailStep] = useState(0);
  // Widen to the full viewport while the visual builder is the active editor.
  const [wide, setWide] = useState(false);

  const actionType = Form.useWatch('action_type', form);
  const senderType = Form.useWatch(['action_config', 'sender_type'], form);

  const isPickingAction = activeTab === 'action' && !actionType;
  const hasEmailSteps = activeTab === 'action' && actionType === 'send_email';
  // A configured action step names itself in the drawer title (and offers
  // Replace) rather than the generic "Add Step".
  const currentAction = findActionType(actionType as string | undefined);
  const actionChosen = activeTab === 'action' && Boolean(actionType);
  const baseTitle = editing
    ? __('Edit Step', 'kelune-crm')
    : __('Add Step', 'kelune-crm');
  const drawerTitle = actionChosen
    ? (currentAction?.title ?? baseTitle)
    : baseTitle;

  // On the edited step's own tab, feed StepConfigPanel that step's real data so
  // it opens pre-filled; on any other tab (a type switch) fall back to defaults.
  const draftNode = useMemo(() => {
    if (editNode && activeTab === editNode.type) {
      return { id: editNode.id, type: activeTab, data: editNode.data };
    }
    return draftNodeFor(activeTab);
  }, [activeTab, editNode]);

  // Start each open on the right tab: the edited step's type, else Action.
  // The form itself is (re)seeded by StepConfigPanel from its node on mount — do
  // NOT resetFields() here: child effects run before parent ones, so a reset in
  // this effect would wipe the values StepConfigPanel just pre-filled, leaving an
  // edited action showing the picker instead of its config.
  useEffect(() => {
    if (open) {
      setActiveTab(
        editNode ? ((editNode.type as StepType) ?? 'action') : 'action'
      );
      setEmailStep(0);
      setWide(false);
    }
  }, [open, editNode]);

  const handleTabChange = (key: string) => {
    setActiveTab(key as StepType);
    setEmailStep(0);
    setWide(false);
  };

  // Return an action step to the picker without leaving the Action tab.
  const handleBackToActions = () => {
    form.setFields([
      { name: 'action_type', value: undefined },
      { name: 'action_config', value: {} },
      { name: 'label', value: '' },
    ]);
    setEmailStep(0);
    setWide(false);
  };

  // Advance the send_email config, validating only the pane being left (mirrors
  // the campaign wizard, incl. the sender field for the mode actually chosen).
  const handleEmailNext = async () => {
    // Validate only the pane being left. Basic Info (step 0) checks the identity
    // fields; Content (step 1) checks the email body before the Review step.
    const fieldsToValidate: (string | string[])[] =
      emailStep === 1
        ? [['action_config', 'body']]
        : ['label', ['action_config', 'subject']];
    if (emailStep === 0) {
      if (senderType === 'custom') {
        fieldsToValidate.push(['action_config', 'from_email']);
      } else if (senderType === 'provider') {
        fieldsToValidate.push(['action_config', 'email_provider_id']);
      }
    }
    try {
      await form.validateFields(fieldsToValidate);
      setEmailStep((step) => step + 1);
    } catch {
      message.error(
        emailStep === 1
          ? __('Email content cannot be empty.', 'kelune-crm')
          : __('Please fill in all required fields in this step.', 'kelune-crm')
      );
    }
  };

  // StepConfigPanel calls this via its onFinish → the step is validated and its
  // values normalised. Commit as an insert or an update, then close.
  const handleSubmit = (_nodeId: string, values: Record<string, unknown>) => {
    onSubmit(activeTab, values, editNode?.id);
    onClose();
  };

  return (
    <Drawer
      destroyOnHidden
      title={drawerTitle}
      placement="right"
      push={false}
      width={wide ? '100%' : 720}
      open={open}
      onClose={onClose}
      // With the type tabs the body hugs the strip (8px top, 20px elsewhere);
      // the send_email wizard has no tabs, so restore even breathing room.
      styles={{
        body: {
          padding: hasEmailSteps ? '20px' : '8px 20px 20px 20px',
        },
      }}
      extra={
        <Space>
          {actionChosen && (
            <Button size="small" onClick={handleBackToActions}>
              {__('Replace', 'kelune-crm')}
            </Button>
          )}
          {editing && onDelete && editNode && (
            <ActionConfirm
              action="delete"
              customDescription={__(
                'Delete this step? This cannot be undone.',
                'kelune-crm'
              )}
              onConfirm={() => onDelete(editNode.id)}
            >
              <Tooltip title={__('Delete step', 'kelune-crm')}>
                <Button danger size="small" icon={<DeleteOutlined />} />
              </Tooltip>
            </ActionConfirm>
          )}
        </Space>
      }
      footer={
        // The action picker has nothing to save until a type is chosen.
        isPickingAction ? null : (
          <Space>
            {hasEmailSteps && emailStep < EMAIL_STEPS.length - 1 ? (
              <Button type="primary" onClick={handleEmailNext}>
                {__('Next', 'kelune-crm')}
              </Button>
            ) : (
              <Button type="primary" onClick={() => form.submit()}>
                {__('Save', 'kelune-crm')}
              </Button>
            )}
            {hasEmailSteps && emailStep > 0 && (
              <Button onClick={() => setEmailStep(emailStep - 1)}>
                {__('Previous', 'kelune-crm')}
              </Button>
            )}
            <Button onClick={onClose}>{__('Cancel', 'kelune-crm')}</Button>
          </Space>
        )
      }
    >
      <div className="kelune-crm-cc-add-step">
        {/* The send_email wizard owns the full drawer (Steps bar + wide builder);
              hiding the type tabs keeps it from competing with the wizard's own
              Basic Info → Content nav. Replace clears the action and brings the
              tabs — and the action list — back. */}
        {!hasEmailSteps && (
          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            items={[
              { key: 'action', label: __('Action', 'kelune-crm') },
              ...(showCondition
                ? [
                    {
                      key: 'condition',
                      label: __('Condition', 'kelune-crm'),
                    },
                  ]
                : []),
              { key: 'delay', label: __('Delay', 'kelune-crm') },
            ]}
          />
        )}
        {/* One panel below the tab bar — a single Form instance, reseeded from
              the active tab's synthetic node. Rendering a panel inside each
              TabPane would mount several Forms bound to the same instance. */}
        <StepConfigPanel
          form={form}
          node={draftNode}
          onUpdate={handleSubmit}
          onWideChange={setWide}
          emailStep={emailStep}
          onEmailStepChange={setEmailStep}
        />
      </div>
    </Drawer>
  );
};

export default AddStepDrawer;
