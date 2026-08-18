import React, { useState, useEffect } from 'react';
import {
  Modal,
  Table,
  Button,
  Space,
  Tag,
  Tooltip,
  Typography,
  message,
  theme,
} from 'antd';
import type { ColumnsType, ColumnType } from 'antd/es/table';
import {
  ThunderboltOutlined,
  FileAddOutlined,
  EyeOutlined,
  FireOutlined,
} from '@ant-design/icons';
import { __, sprintf } from '@wordpress/i18n';
import api from '../../services/api';
import { ListTableFooter } from '../common/list';
import TemplatePreviewModal from './TemplatePreviewModal';

const { Text } = Typography;

interface TemplateStep {
  step_type?: string;
  [key: string]: unknown;
}

interface AutomationTemplate {
  id?: string;
  name?: string;
  description?: string;
  icon?: string;
  popular?: boolean;
  steps?: TemplateStep[];
  [key: string]: unknown;
}

interface TemplateSelectionModalProps {
  visible: boolean;
  onCancel: () => void;
  onSelectTemplate: (template: Record<string, unknown>) => void;
  onCreateFromScratch: () => void;
}

const TemplateSelectionModal = ({
  visible,
  onCancel,
  onSelectTemplate,
  onCreateFromScratch,
}: TemplateSelectionModalProps) => {
  const [templates, setTemplates] = useState<AutomationTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState<'template' | 'scratch'>(
    'template'
  );
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [previewTemplate, setPreviewTemplate] =
    useState<AutomationTemplate | null>(null);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const { token } = theme.useToken();

  useEffect(() => {
    if (visible) {
      setSelectedMode('template');
      setPage(1);
      loadTemplates();
    }
  }, [visible]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const response = await api.templates.getAll();
      setTemplates(response.data.data || []);
    } catch (error) {
      message.error(__('Failed to load templates', 'kelune-crm'));
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTemplate = async (template: AutomationTemplate) => {
    if (!template.id) return;
    try {
      const response = await api.templates.import(
        template.id,
        template.name || ''
      );
      message.success(
        __(
          'Template imported successfully! Customize and activate when ready.',
          'kelune-crm'
        )
      );
      onSelectTemplate(response.data);
    } catch (error) {
      message.error(__('Failed to import template', 'kelune-crm'));
      console.error('Failed to import template:', error);
    }
  };

  const handlePreview = (template: AutomationTemplate) => {
    setPreviewTemplate(template);
    setPreviewModalVisible(true);
  };

  const pagedTemplates = templates.slice((page - 1) * perPage, page * perPage);

  const columns: ColumnsType<AutomationTemplate> = [
    {
      title: __('Template', 'kelune-crm'),
      key: 'template',
      render: (_, record) => (
        <div>
          <Space size={8}>
            <Text
              style={{ fontWeight: 500, cursor: 'pointer' }}
              onClick={() => handlePreview(record)}
            >
              {record.name || __('(untitled)', 'kelune-crm')}
            </Text>
            {record.popular && (
              <Tag
                color="gold"
                bordered={false}
                icon={<FireOutlined />}
                style={{ margin: 0 }}
              >
                {__('Popular', 'kelune-crm')}
              </Tag>
            )}
          </Space>
          {record.description && (
            <div style={{ color: 'rgba(0, 0, 0, 0.60)', fontSize: 12 }}>
              {record.description}
            </div>
          )}
        </div>
      ),
    },
    {
      title: __('Workflow', 'kelune-crm'),
      key: 'workflow',
      render: (_, record) => {
        const stepCount = record.steps?.length || 0;
        const hasConditions = record.steps?.some(
          (step) => step.step_type === 'condition'
        );
        const hasDelays = record.steps?.some(
          (step) => step.step_type === 'delay'
        );
        return (
          <Space size={4} wrap>
            <Tag bordered={false}>
              {sprintf(
                // translators: %d: number of workflow steps.
                __('%d steps', 'kelune-crm'),
                stepCount
              )}
            </Tag>
            {hasConditions && (
              <Tag bordered={false} color="purple">
                {__('Branching', 'kelune-crm')}
              </Tag>
            )}
            {hasDelays && (
              <Tag bordered={false} color="blue">
                {__('Delays', 'kelune-crm')}
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: __('Actions', 'kelune-crm'),
      key: 'actions',
      align: 'right',
      render: (_, record) => (
        <Space>
          <Tooltip title={__('Preview', 'kelune-crm')}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handlePreview(record)}
            />
          </Tooltip>
          <Button
            type="primary"
            size="small"
            onClick={() => handleSelectTemplate(record)}
          >
            {__('Use Template', 'kelune-crm')}
          </Button>
        </Space>
      ),
    } as ColumnType<AutomationTemplate>,
  ];

  return (
    <>
      <Modal
        destroyOnHidden
        centered
        title={__('Create New Automation', 'kelune-crm')}
        open={visible}
        onCancel={onCancel}
        width={1000}
        footer={null}
      >
        {/* Header Options */}
        <Space
          size="middle"
          style={{
            width: '100%',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <Button
            size="large"
            icon={<ThunderboltOutlined />}
            onClick={() => {
              setSelectedMode('template');
              setPage(1);
              loadTemplates();
            }}
            style={{
              height: 'auto',
              minWidth: 240,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 32px',
              ...(selectedMode === 'template'
                ? {
                    borderColor: token.colorPrimary,
                    color: token.colorPrimary,
                    background: token.colorPrimaryBg,
                  }
                : {}),
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>
              {__('Use a Template', 'kelune-crm')}
            </div>
            <div
              style={{
                fontSize: 12,
                color:
                  selectedMode === 'template' ? token.colorPrimary : '#8c8c8c',
                marginTop: 4,
              }}
            >
              {sprintf(
                // translators: %d: number of available templates.
                __('Choose from %d+ templates below', 'kelune-crm'),
                templates.length
              )}
            </div>
          </Button>

          <div
            style={{
              padding: '0 16px',
              color: '#d9d9d9',
              fontSize: 18,
              fontWeight: 300,
            }}
          >
            {__('OR', 'kelune-crm')}
          </div>

          <Button
            size="large"
            icon={<FileAddOutlined />}
            onClick={() => {
              setSelectedMode('scratch');
              onCreateFromScratch();
            }}
            style={{
              height: 'auto',
              minWidth: 240,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 32px',
              ...(selectedMode === 'scratch'
                ? {
                    borderColor: token.colorPrimary,
                    color: token.colorPrimary,
                    background: token.colorPrimaryBg,
                  }
                : {}),
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8 }}>
              {__('Create from Scratch', 'kelune-crm')}
            </div>
            <div
              style={{
                fontSize: 12,
                color:
                  selectedMode === 'scratch' ? token.colorPrimary : '#8c8c8c',
                marginTop: 4,
              }}
            >
              {__('Build your own workflow', 'kelune-crm')}
            </div>
          </Button>
        </Space>

        <Table
          columns={columns}
          dataSource={pagedTemplates}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          pagination={false}
          footer={() => (
            <ListTableFooter
              page={page}
              perPage={perPage}
              total={templates.length}
              onChange={(nextPage, nextSize) => {
                setPage(nextPage);
                setPerPage(nextSize);
              }}
            />
          )}
        />
      </Modal>

      {/* Preview Modal */}
      <TemplatePreviewModal
        template={previewTemplate}
        visible={previewModalVisible}
        onClose={() => setPreviewModalVisible(false)}
        onUse={handleSelectTemplate}
      />
    </>
  );
};

export default TemplateSelectionModal;
