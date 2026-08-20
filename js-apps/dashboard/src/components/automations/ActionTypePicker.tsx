import React, { useState } from 'react';
import { Card, List, Typography } from 'antd';
import { isProActive } from '../../hooks/useFeature';
import { ProTag } from '../common/ProTag';
import ProUpgradeModal from '../common/ProUpgradeModal';
import { ACTION_TYPES, type ActionTypeOption } from './actionTypeOptions';

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
  const [lockedAction, setLockedAction] = useState<ActionTypeOption | null>(
    null
  );

  return (
    <>
      <Card size="small" styles={{ body: { padding: 0 } }}>
        <List
          size="small"
          dataSource={ACTION_TYPES}
          renderItem={(action) => {
            const locked = Boolean(action.pro) && !proActive;
            return (
              <List.Item
                key={action.value}
                onClick={() =>
                  locked ? setLockedAction(action) : onSelect(action.value)
                }
                style={{ padding: 12, margin: 0, cursor: 'pointer' }}
              >
                <List.Item.Meta
                  avatar={action.icon}
                  title={
                    <span>
                      {action.title}
                      {locked && (
                        <span style={{ marginInlineStart: 8 }}>
                          <ProTag />
                        </span>
                      )}
                    </span>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {action.description}
                    </Text>
                  }
                />
              </List.Item>
            );
          }}
        />
      </Card>

      <ProUpgradeModal
        open={Boolean(lockedAction)}
        onClose={() => setLockedAction(null)}
        title={lockedAction?.title ?? ''}
      />
    </>
  );
};

export default ActionTypePicker;
