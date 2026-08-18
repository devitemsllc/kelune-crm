import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, Tag } from 'antd';
import { BranchesOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import { conditionTypeLabel } from '../typeLabels';

const ConditionNode = ({ data, selected }: NodeProps) => {
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
        background: '#fff7e6',
      }}
      bodyStyle={{ padding: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <BranchesOutlined
          style={{ fontSize: 20, color: '#fa8c16', marginRight: 8 }}
        />
        <strong>{__('Condition', 'kelune-crm')}</strong>
      </div>
      <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>
        {data.label || __('If/Then Branch', 'kelune-crm')}
      </div>
      {data.condition_type && (
        <Tag color="orange" style={{ marginTop: 4 }}>
          {conditionTypeLabel(data.condition_type)}
        </Tag>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="condition-input"
        style={{
          background: '#1890ff',
          width: 10,
          height: 10,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />

      {/* YES output handle (left) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{
          background: '#52c41a',
          width: 10,
          height: 10,
          left: '30%',
        }}
      />

      {/* NO output handle (right) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{
          background: '#f5222d',
          width: 10,
          height: 10,
          left: '70%',
        }}
      />

      {/* Labels for branches */}
      <div
        style={{
          position: 'absolute',
          bottom: -25,
          left: '20%',
          fontSize: 11,
          color: '#52c41a',
          fontWeight: 'bold',
        }}
      >
        {__('YES', 'kelune-crm')}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: -25,
          right: '20%',
          fontSize: 11,
          color: '#f5222d',
          fontWeight: 'bold',
        }}
      >
        {__('NO', 'kelune-crm')}
      </div>
    </Card>
  );
};

export default ConditionNode;
