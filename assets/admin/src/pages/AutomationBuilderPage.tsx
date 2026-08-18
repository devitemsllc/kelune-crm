import React from 'react';
import { useParams } from 'react-router-dom';
import AutomationBuilder from '../components/automations/AutomationBuilder';

const AutomationBuilderPage = () => {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="kelune-crm-cc-automation-builder-container">
      <AutomationBuilder automationId={id} />
    </div>
  );
};

export default AutomationBuilderPage;
