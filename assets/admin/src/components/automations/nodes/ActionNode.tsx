import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Card, Tag } from 'antd';
import {
  MailOutlined,
  TagOutlined,
  EditOutlined,
  ApiOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import { actionTypeLabel } from '../typeLabels';

const ActionNode = ({ data, selected }: NodeProps) => {
  const getActionIcon = (actionType: string) => {
    const icons: Record<string, React.ReactNode> = {
      send_email: <MailOutlined />,
      add_tag: <TagOutlined />,
      remove_tag: <TagOutlined />,
      update_field: <EditOutlined />,
      webhook: <ApiOutlined />,
      notification: <BellOutlined />,
    };
    return icons[actionType] || <EditOutlined />;
  };

  const getActionColor = (actionType: string) => {
    const colors: Record<string, string> = {
      send_email: '#1890ff',
      add_tag: '#52c41a',
      remove_tag: '#f5222d',
      update_field: '#722ed1',
      webhook: '#13c2c2',
      notification: '#fa8c16',
    };
    return colors[actionType] || '#1890ff';
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
      }}
      bodyStyle={{ padding: 12 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span
          style={{
            fontSize: 20,
            color: getActionColor(data.action_type),
            marginRight: 8,
          }}
        >
          {getActionIcon(data.action_type)}
        </span>
        <strong>{__('Action', 'kelune-crm')}</strong>
      </div>
      <div style={{ fontSize: 13, color: '#595959', marginBottom: 4 }}>
        {data.label || __('Perform Action', 'kelune-crm')}
      </div>
      {data.action_type && (
        <Tag color="blue" style={{ marginTop: 4 }}>
          {actionTypeLabel(data.action_type)}
        </Tag>
      )}

      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="action-input"
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
        id="action-output"
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

export default ActionNode;
