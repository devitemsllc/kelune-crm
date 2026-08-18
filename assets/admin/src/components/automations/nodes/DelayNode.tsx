import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, Tag } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';

const DelayNode = ({ data, selected }: NodeProps) => {
  const getDelayText = () => {
    if (!data.delay_value || !data.delay_type) {
      return __('Wait...', 'kelune-crm');
    }
    return sprintf(
      __('Wait %1$s %2$s', 'kelune-crm'),
      data.delay_value,
      data.delay_type
    );
  };

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
        background: '#f0f5ff',
      }}
      bodyStyle={{ padding: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <ClockCircleOutlined
          style={{ fontSize: 20, color: '#597ef7', marginRight: 8 }}
        />
        <strong>{__('Delay', 'kelune-crm')}</strong>
      </div>
      <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>
        {data.label || getDelayText()}
      </div>
      {data.delay_value && data.delay_type && (
        <Tag color="purple" style={{ marginTop: 4 }}>
          {data.delay_value} {data.delay_type}
        </Tag>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="delay-input"
        style={{
          background: '#1890ff',
          width: 10,
          height: 10,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      />

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="delay-output"
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

export default DelayNode;
