import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, Tag, Tooltip } from 'antd';
import { ThunderboltOutlined, LockOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import { triggerTypeLabel } from '../typeLabels';

const TriggerNode = ({ data, selected }: NodeProps) => {
  return (
    <Card
      size="small"
      style={{
        minWidth: 200,
        border: selected ? '2px solid #1890ff' : '1px solid #d9d9d9',
        borderRadius: 8,
        boxShadow: selected
          ? '0 4px 12px rgba(24, 144, 255, 0.3)'
          : '0 2px 8px rgba(0,0,0,0.1)',
      }}
      bodyStyle={{ padding: 12 }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <ThunderboltOutlined
            style={{ fontSize: 20, color: '#faad14', marginRight: 8 }}
          />
          <strong>{__('Trigger', 'kelune-crm')}</strong>
        </div>
        <Tooltip
          title={__(
            'This step is required and cannot be deleted',
            'kelune-crm'
          )}
        >
          <LockOutlined style={{ fontSize: 14, color: '#8c8c8c' }} />
        </Tooltip>
      </div>
      <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>
        {data.label || __('Trigger Event', 'kelune-crm')}
      </div>
      {data.trigger_type && (
        <Tag color="orange" style={{ marginTop: 4 }}>
          {triggerTypeLabel(data.trigger_type)}
        </Tag>
      )}

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="trigger-output"
        style={{
          background: '#52c41a',
          width: 10,
          height: 10,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />
    </Card>
  );
};

export default TriggerNode;
