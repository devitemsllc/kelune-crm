import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from '@store/hooks';
import { Alert, Spin, message } from 'antd';
import { __ } from '@wordpress/i18n';
import AutomationCanvas from './AutomationCanvas';
import AutomationInfoModal from './AutomationInfoModal';
import type { AutomationInfoValues } from './AutomationInfoModal';
import TriggerConfigDrawer from './TriggerConfigDrawer';
import type { TriggerValues } from './TriggerConfigDrawer';
import {
  fetchAutomation,
  fetchAutomationSteps,
  bulkCreateSteps,
  updateAutomation,
  activateAutomation,
  pauseAutomation,
} from '../../store/slices/automationsSlice';
import { getErrorMessage } from '@/utils/getErrorMessage';

interface AutomationBuilderProps {
  automationId?: number | string;
}

const AutomationBuilder = ({ automationId }: AutomationBuilderProps) => {
  const dispatch = useDispatch();
  const { selectedAutomation, steps, stepsLoading } = useSelector(
    (state) => state.automations
  );
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [triggerDrawerOpen, setTriggerDrawerOpen] = useState(false);

  useEffect(() => {
    if (automationId) {
      dispatch(fetchAutomation(automationId));
      dispatch(fetchAutomationSteps(automationId));
    }
  }, [automationId, dispatch]);

  // Resolves to the saved step ids so the canvas can adopt the ones the server
  // assigned to newly inserted steps.
  const handleSaveWorkflow = async (steps: Record<string, unknown>[]) => {
    if (!automationId) return undefined;
    const result = await dispatch(
      bulkCreateSteps({ id: automationId, steps })
    ).unwrap();
    const ids = (result as { step_ids?: unknown } | undefined)?.step_ids;
    return Array.isArray(ids) ? ids.map(Number) : undefined;
  };

  // Name and description only — a partial update, so the trigger and re-entry
  // policy the drawer owns are left as they are.
  const handleInfoSubmit = async (values: AutomationInfoValues) => {
    if (!automationId) return;
    try {
      await dispatch(
        updateAutomation({ id: automationId, data: { ...values } })
      ).unwrap();
      setInfoModalOpen(false);
      message.success(__('Automation settings saved', 'kelune-crm'));
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to save automation settings', 'kelune-crm')
        )
      );
    }
  };

  // The trigger is stored on the record, so the canvas node saves through the
  // same update route — a partial payload, leaving the rest of the record be.
  const handleTriggerSubmit = async (values: TriggerValues) => {
    if (!automationId) return;
    try {
      await dispatch(
        updateAutomation({ id: automationId, data: { ...values } })
      ).unwrap();
      setTriggerDrawerOpen(false);
      message.success(__('Trigger saved', 'kelune-crm'));
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to save trigger', 'kelune-crm'))
      );
    }
  };

  const handleActivate = async () => {
    if (!automationId) return;
    try {
      await dispatch(activateAutomation(automationId)).unwrap();
      message.success(__('Automation activated', 'kelune-crm'));
    } catch (error) {
      message.error(
        getErrorMessage(
          error,
          __('Failed to activate automation', 'kelune-crm')
        )
      );
    }
  };

  const handlePause = async () => {
    if (!automationId) return;
    try {
      await dispatch(pauseAutomation(automationId)).unwrap();
      message.success(__('Automation paused', 'kelune-crm'));
    } catch (error) {
      message.error(
        getErrorMessage(error, __('Failed to pause automation', 'kelune-crm'))
      );
    }
  };

  if (stepsLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin
          tip={__('Loading workflow...', 'kelune-crm')}
          style={{ maxHeight: 'unset' }}
        />
      </div>
    );
  }

  if (!selectedAutomation) {
    return (
      <Alert
        message={__(
          'Automation not found. Please select or create an automation first.',
          'kelune-crm'
        )}
        type="warning"
        style={{ border: 'none' }}
      />
    );
  }

  return (
    <>
      <AutomationCanvas
        automationId={automationId}
        automation={selectedAutomation}
        initialSteps={steps}
        onSave={handleSaveWorkflow}
        onEditInfo={() => setInfoModalOpen(true)}
        onEditTrigger={() => setTriggerDrawerOpen(true)}
        onActivate={handleActivate}
        onPause={handlePause}
      />

      <AutomationInfoModal
        open={infoModalOpen}
        automation={selectedAutomation}
        onCancel={() => setInfoModalOpen(false)}
        onSubmit={handleInfoSubmit}
      />

      <TriggerConfigDrawer
        open={triggerDrawerOpen}
        automation={selectedAutomation}
        onClose={() => setTriggerDrawerOpen(false)}
        onSubmit={handleTriggerSubmit}
      />
    </>
  );
};

export default AutomationBuilder;
