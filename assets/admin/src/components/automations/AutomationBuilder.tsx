import React, { useEffect } from 'react';
import { useDispatch, useSelector } from '@store/hooks';
import { Alert, Spin } from 'antd';
import { __ } from '@wordpress/i18n';
import AutomationCanvas from './AutomationCanvas';
import {
  fetchAutomation,
  fetchAutomationSteps,
  bulkCreateSteps,
  updateAutomation,
} from '../../store/slices/automationsSlice';

interface AutomationBuilderProps {
  automationId?: number | string;
}

const AutomationBuilder = ({ automationId }: AutomationBuilderProps) => {
  const dispatch = useDispatch();
  const { selectedAutomation, steps, stepsLoading } = useSelector(
    (state) => state.automations
  );

  useEffect(() => {
    if (automationId) {
      dispatch(fetchAutomation(automationId));
      dispatch(fetchAutomationSteps(automationId));
    }
  }, [automationId, dispatch]);

  const handleSaveWorkflow = async (steps: Record<string, unknown>[]) => {
    if (!automationId) return;
    await dispatch(bulkCreateSteps({ id: automationId, steps })).unwrap();
  };

  // The trigger node mirrors the automation's own trigger (stored on the record,
  // not as a step), so editing it on the canvas persists straight to the record.
  const handleSaveTrigger = async (data: {
    trigger_type?: string;
    trigger_config?: Record<string, unknown>;
  }) => {
    if (!automationId) return;
    await dispatch(updateAutomation({ id: automationId, data })).unwrap();
  };

  if (stepsLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin tip={__('Loading workflow...', 'kelune-crm')} />
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
    <AutomationCanvas
      automationId={automationId}
      automationName={selectedAutomation.name}
      triggerType={selectedAutomation.trigger_type}
      triggerConfig={selectedAutomation.trigger_config}
      initialSteps={steps}
      onSave={handleSaveWorkflow}
      onSaveTrigger={handleSaveTrigger}
    />
  );
};

export default AutomationBuilder;
