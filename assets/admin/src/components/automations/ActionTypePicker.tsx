import React from 'react';
import { Card, List, Typography } from 'antd';
import { isProActive } from '../../hooks/useFeature';
import { ACTION_TYPES } from './actionTypeOptions';

const { Text } = Typography;

interface ActionTypePickerProps {
  onSelect: (value: string) => void;
}

/**
 * Choose what an action step does.
 *
 * Shown once, when the step has no action type yet. The type is not editable
 * afterwards: each action stores a different `action_config` shape, so allowing
 * a swap would strand the previous action's keys in the saved config (the step
 * config is persisted as one JSON blob). Picking here and offering an explicit
 * Replace later keeps that impossible by construction.
 */
const ActionTypePicker = ({ onSelect }: ActionTypePickerProps) => {
  const proActive = isProActive();
  // Pro-only actions are hidden entirely until Pro is active — never shown as
  // locked/badged rows in the picker.
  const actions = proActive ? ACTION_TYPES : ACTION_TYPES.filter((a) => !a.pro);

  return (
    <Card size="small" styles={{ body: { padding: 0 } }}>
      <List
        size="small"
        dataSource={actions}
        renderItem={(action) => (
          <List.Item
            key={action.value}
            onClick={() => onSelect(action.value)}
            style={{ padding: 12, margin: 0, cursor: 'pointer' }}
          >
            <List.Item.Meta
              avatar={action.icon}
              title={action.title}
              description={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {action.description}
                </Text>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
};

export default ActionTypePicker;
