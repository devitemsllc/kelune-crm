import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch } from '@store/hooks';
import {
  Form,
  Input,
  Select,
  Space,
  message,
  Divider,
  Alert,
  Checkbox,
  Spin,
  Tabs,
  Table,
  Typography,
  Tag,
} from 'antd';
import type { FormInstance } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { __ } from '@wordpress/i18n';
import { createWebhook, updateWebhook } from '../../store/slices/webhooksSlice';
import api from '../../services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { buildWebhookUrl } from '@/utils/webhookUrl';
import { formSectionDivider } from '@/utils/formStyles';
import type { Webhook } from '@/types/models';
import SubmitOnEnter from '../common/SubmitOnEnter';

const { TextArea } = Input;
const { Option } = Select;
const { Text } = Typography;

interface ListTagOption {
  id: number;
  name: string;
}

/** Custom field definition as returned by GET /custom-fields. */
interface CustomFieldDef {
  id: number;
  field_key: string;
  field_label: string;
  field_type?: string;
  field_required?: number;
}

/** One row in the Usage tab's accepted-fields table. */
interface AcceptedField {
  key: string;
  label: string;
  fieldKey: string;
  type: string;
  required: boolean;
}

interface WebhookFormProps {
  onCancel: () => void;
  editingWebhook: Webhook | null;
  /** Owned by the drawer so its footer can submit this form. */
  form: FormInstance;
  onSuccess: () => void;
  /** Called with the freshly created webhook so the parent can switch the
   *  drawer straight into edit mode (Usage tab) instead of closing. */
  onCreated?: (webhook: Webhook) => void;
  /** Which tab to open first in edit mode. Defaults to the Settings tab; the
   *  parent passes 'usage' right after create so the URL shows immediately. */
  defaultTab?: 'config' | 'usage';
}

const WebhookForm = ({
  onCancel,
  editingWebhook,
  form,
  onSuccess,
  onCreated,
  defaultTab = 'config',
}: WebhookFormProps) => {
  const dispatch = useDispatch();
  const rootRef = useRef<HTMLDivElement>(null);
  const [lists, setLists] = useState<ListTagOption[]>([]);
  const [tags, setTags] = useState<ListTagOption[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);

  const fetchLists = useCallback(async () => {
    setLoadingLists(true);
    try {
      const response = await api.get<ListTagOption[]>('/lists', {
        params: { per_page: 100 },
      });
      // Convert IDs from strings to integers
      const nextLists = (response.data || []).map((list) => ({
        ...list,
        id: parseInt(String(list.id), 10),
      }));
      setLists(nextLists);
    } catch (error) {
      console.error('Failed to fetch lists:', error);
      message.error(__('Failed to load lists', 'kelune-crm'));
    } finally {
      setLoadingLists(false);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    setLoadingTags(true);
    try {
      const response = await api.get<ListTagOption[]>('/tags', {
        params: { per_page: 100 },
      });
      // Convert IDs from strings to integers
      const nextTags = (response.data || []).map((tag) => ({
        ...tag,
        id: parseInt(String(tag.id), 10),
      }));
      setTags(nextTags);
    } catch (error) {
      console.error('Failed to fetch tags:', error);
      message.error(__('Failed to load tags', 'kelune-crm'));
    } finally {
      setLoadingTags(false);
    }
  }, []);

  // Custom fields power the accepted-fields table in the Usage tab (each is
  // accepted on the payload as custom_field__<field_key>).
  const fetchCustomFields = useCallback(async () => {
    try {
      const response = await api.get<CustomFieldDef[]>('/custom-fields', {
        params: { per_page: 100 },
      });
      setCustomFields(response.data || []);
    } catch (error) {
      console.error('Failed to fetch custom fields:', error);
    }
  }, []);

  // Fetch lists and tags on mount (the parent Drawer destroys this on close, so
  // it remounts fresh each open), then seed form values from the edited row.
  useEffect(() => {
    const loadData = async () => {
      await Promise.all([fetchLists(), fetchTags(), fetchCustomFields()]);

      if (editingWebhook) {
        form.setFieldsValue({
          webhook_name: editingWebhook.webhook_name,
          description: editingWebhook.description,
          // Coerce to numbers to match the numeric Select option values
          // (fetchLists/fetchTags parseInt the option ids; the API may send
          // the selected ids as strings).
          default_lists: (editingWebhook.default_lists || []).map(Number),
          default_tags: (editingWebhook.default_tags || []).map(Number),
          allowed_actions: editingWebhook.allowed_actions || [],
          status: editingWebhook.status,
          ip_whitelist: editingWebhook.ip_whitelist,
        });
      }
    };

    loadData();
  }, [editingWebhook, form, fetchLists, fetchTags, fetchCustomFields]);

  // When the drawer flips from create into edit mode (Usage tab), the drawer
  // body keeps the create form's scroll position — reset it to the top so the
  // URL is in view.
  useEffect(() => {
    if (!editingWebhook) {
      return;
    }
    const body = rootRef.current?.closest<HTMLElement>(
      '.kelune-crm-ant-drawer-body'
    );
    body?.scrollTo({ top: 0 });
  }, [editingWebhook]);

  const handleSubmit = async (values: Record<string, unknown>) => {
    try {
      if (editingWebhook) {
        await dispatch(
          updateWebhook({ id: editingWebhook.id, data: values })
        ).unwrap();
        message.success(__('Webhook updated successfully', 'kelune-crm'));
        form.resetFields();
        onCancel();
        onSuccess();
      } else {
        const created = await dispatch(createWebhook(values)).unwrap();
        message.success(__('Webhook created successfully', 'kelune-crm'));
        // Refresh the list in the background, then flip the drawer into edit
        // mode so the Usage tab (URL + accepted fields) is shown immediately
        // instead of closing back to the listing.
        onSuccess();
        onCreated?.(created);
      }
    } catch (error) {
      const msg = getErrorMessage(error, '');
      if (msg) {
        message.error(msg);
      } else {
        console.error('Validation failed:', error);
      }
    }
  };

  const availableActions = [
    {
      value: 'create_contact',
      label: __('Create Contact', 'kelune-crm'),
    },
    {
      value: 'update_contact',
      label: __('Update Contact', 'kelune-crm'),
    },
    { value: 'add_tag', label: __('Add Tag', 'kelune-crm') },
    { value: 'remove_tag', label: __('Remove Tag', 'kelune-crm') },
    { value: 'add_list', label: __('Add to List', 'kelune-crm') },
    {
      value: 'remove_list',
      label: __('Remove from List', 'kelune-crm'),
    },
  ];

  const configForm = (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleSubmit}
      initialValues={{
        status: 'active',
        allowed_actions: [],
      }}
    >
      <Form.Item
        label={__('Webhook Name', 'kelune-crm')}
        name="webhook_name"
        rules={[
          {
            required: true,
            message: __('Please enter webhook name', 'kelune-crm'),
          },
        ]}
      >
        <Input placeholder={__('e.g., Zapier Integration', 'kelune-crm')} />
      </Form.Item>

      <Form.Item label={__('Description', 'kelune-crm')} name="description">
        <TextArea
          rows={3}
          placeholder={__(
            'Describe what this webhook is used for...',
            'kelune-crm'
          )}
        />
      </Form.Item>

      <Divider
        orientation="left"
        orientationMargin="0"
        style={formSectionDivider}
      >
        {__('Default Settings', 'kelune-crm')}
      </Divider>

      <Form.Item
        label={__('Default Lists', 'kelune-crm')}
        name="default_lists"
        tooltip={__(
          'New contacts will be automatically added to these lists',
          'kelune-crm'
        )}
      >
        <Select
          mode="multiple"
          placeholder={
            loadingLists
              ? __('Loading lists...', 'kelune-crm')
              : __('Select lists', 'kelune-crm')
          }
          allowClear
          showSearch
          loading={loadingLists}
          optionFilterProp="children"
          optionLabelProp="children"
          notFoundContent={
            loadingLists ? (
              <Spin style={{ maxHeight: 'unset' }} />
            ) : (
              __('No lists found', 'kelune-crm')
            )
          }
        >
          {lists.map((list) => (
            <Option key={list.id} value={list.id}>
              {list.name}
            </Option>
          ))}
        </Select>
      </Form.Item>

      <Form.Item
        label={__('Default Tags', 'kelune-crm')}
        name="default_tags"
        tooltip={__(
          'These tags will be automatically applied to all contacts',
          'kelune-crm'
        )}
      >
        <Select
          mode="multiple"
          placeholder={
            loadingTags
              ? __('Loading tags...', 'kelune-crm')
              : __('Select tags', 'kelune-crm')
          }
          style={{ width: '100%' }}
          loading={loadingTags}
          showSearch
          optionFilterProp="children"
          optionLabelProp="children"
          notFoundContent={
            loadingTags ? (
              <Spin style={{ maxHeight: 'unset' }} />
            ) : (
              __('No tags found', 'kelune-crm')
            )
          }
        >
          {tags.map((tag) => (
            <Option key={tag.id} value={tag.id}>
              {tag.name}
            </Option>
          ))}
        </Select>
      </Form.Item>

      <Divider
        orientation="left"
        orientationMargin="0"
        style={formSectionDivider}
      >
        {__('Allowed Actions', 'kelune-crm')}
      </Divider>

      <Form.Item
        label={__('Select Actions', 'kelune-crm')}
        name="allowed_actions"
        tooltip={__(
          'Control what operations this webhook can perform',
          'kelune-crm'
        )}
        rules={[
          {
            required: true,
            message: __(
              'Please select at least one allowed action',
              'kelune-crm'
            ),
            type: 'array',
            min: 1,
          },
        ]}
      >
        <Checkbox.Group style={{ width: '100%' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {availableActions.map((action) => (
              <Checkbox key={action.value} value={action.value}>
                {action.label}
              </Checkbox>
            ))}
          </Space>
        </Checkbox.Group>
      </Form.Item>

      <Divider
        orientation="left"
        orientationMargin="0"
        style={formSectionDivider}
      >
        {__('Security Settings', 'kelune-crm')}
      </Divider>

      <Form.Item label={__('Status', 'kelune-crm')} name="status">
        <Select>
          <Option value="active">{__('Active', 'kelune-crm')}</Option>
          <Option value="inactive">{__('Inactive', 'kelune-crm')}</Option>
        </Select>
      </Form.Item>

      <Form.Item
        label={__('IP Whitelist', 'kelune-crm')}
        name="ip_whitelist"
        tooltip={__(
          'Enter allowed IP addresses separated by comma or newline. Supports CIDR notation (e.g., 192.168.1.0/24)',
          'kelune-crm'
        )}
        style={{ marginBottom: 0 }}
      >
        <TextArea rows={3} placeholder="192.168.1.1, 10.0.0.0/8" />
      </Form.Item>
      <SubmitOnEnter />
    </Form>
  );

  // Create mode: no tabs, just the intro alert + the config form.
  if (!editingWebhook) {
    return (
      <>
        <Alert
          message={__(
            'Create a secure endpoint to receive data from external systems. Each webhook gets a unique key for authentication.',
            'kelune-crm'
          )}
          type="info"
          style={{ marginBottom: 24, border: 'none' }}
        />
        {configForm}
      </>
    );
  }

  const webhookKey = editingWebhook.webhook_key ?? '';
  const webhookUrl = buildWebhookUrl(webhookKey);
  // Mask the secret in the displayed URL: kelunecrmwh_{first 8}{8 stars}{last 8}.
  const maskKey = (key: string): string => {
    const prefix = 'kelunecrmwh_';
    const body = key.startsWith(prefix) ? key.slice(prefix.length) : key;
    if (body.length <= 16) {
      return key;
    }
    return `${prefix}${body.slice(0, 8)}********${body.slice(-8)}`;
  };
  const maskedUrl = buildWebhookUrl(maskKey(webhookKey));

  // Human label for a custom field's machine type (falls back to the raw type).
  const CUSTOM_TYPE_LABELS: Record<string, string> = {
    text: __('Text', 'kelune-crm'),
    textarea: __('Text', 'kelune-crm'),
    number: __('Number', 'kelune-crm'),
    email: __('Email', 'kelune-crm'),
    url: __('URL', 'kelune-crm'),
    phone: __('Phone', 'kelune-crm'),
    date: __('Date', 'kelune-crm'),
    datetime: __('Date/Time', 'kelune-crm'),
    select: __('Text', 'kelune-crm'),
    radio: __('Text', 'kelune-crm'),
    checkbox: __('Text', 'kelune-crm'),
  };

  const TEXT_TYPE = __('Text', 'kelune-crm');
  const IDS_TYPE = __('IDs (comma-separated)', 'kelune-crm');

  // Fields accepted on the webhook payload. Core contact fields + list/tag
  // controls, then one row per custom field (accepted as custom_field__<key>).
  const acceptedFields: AcceptedField[] = [
    {
      key: 'email',
      label: __('Email', 'kelune-crm'),
      fieldKey: 'email',
      type: __('Email', 'kelune-crm'),
      required: true,
    },
    {
      key: 'first_name',
      label: __('First Name', 'kelune-crm'),
      fieldKey: 'first_name',
      type: TEXT_TYPE,
      required: false,
    },
    {
      key: 'last_name',
      label: __('Last Name', 'kelune-crm'),
      fieldKey: 'last_name',
      type: TEXT_TYPE,
      required: false,
    },
    {
      key: 'status',
      label: __('Status', 'kelune-crm'),
      fieldKey: 'status',
      type: TEXT_TYPE,
      required: false,
    },
    {
      key: 'lists',
      label: __('Add to Lists', 'kelune-crm'),
      fieldKey: 'lists',
      type: IDS_TYPE,
      required: false,
    },
    {
      key: 'lists_remove',
      label: __('Remove from Lists', 'kelune-crm'),
      fieldKey: 'lists_remove',
      type: IDS_TYPE,
      required: false,
    },
    {
      key: 'tags',
      label: __('Add Tags', 'kelune-crm'),
      fieldKey: 'tags',
      type: IDS_TYPE,
      required: false,
    },
    {
      key: 'tags_remove',
      label: __('Remove Tags', 'kelune-crm'),
      fieldKey: 'tags_remove',
      type: IDS_TYPE,
      required: false,
    },
    ...customFields.map((field) => ({
      key: `custom_field__${field.field_key}`,
      label: field.field_label,
      fieldKey: `custom_field__${field.field_key}`,
      type: CUSTOM_TYPE_LABELS[field.field_type ?? ''] ?? TEXT_TYPE,
      required: Number(field.field_required) === 1,
    })),
  ];

  const fieldColumns: ColumnsType<AcceptedField> = [
    {
      title: __('Field', 'kelune-crm'),
      dataIndex: 'label',
      key: 'label',
      render: (label: string, record) => (
        <div>
          <div>{label}</div>
          <Typography.Text
            type="secondary"
            style={{ fontSize: 12 }}
            copyable={{
              text: record.fieldKey,
              tooltips: [
                __('Copy key', 'kelune-crm'),
                __('Copied!', 'kelune-crm'),
              ],
            }}
          >
            {record.fieldKey}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: __('Type', 'kelune-crm'),
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => <Text type="secondary">{type}</Text>,
    },
    {
      title: __('Required', 'kelune-crm'),
      dataIndex: 'required',
      key: 'required',
      width: 120,
      render: (required: boolean) =>
        required ? (
          <Tag bordered={false} color="red">
            {__('Required', 'kelune-crm')}
          </Tag>
        ) : (
          <Tag bordered={false}>{__('Optional', 'kelune-crm')}</Tag>
        ),
    },
  ];

  const usageTab = (
    <>
      <Alert
        type="info"
        showIcon={false}
        style={{ background: '#fafafa', border: 'none', marginBottom: 24 }}
        message={<span style={{ wordBreak: 'break-all' }}>{maskedUrl}</span>}
        action={
          <Typography.Text
            copyable={{
              text: webhookUrl,
              // Antd wraps these in its own button element.
              icon: [
                <CopyOutlined key="copy" style={{ marginLeft: 12 }} />,
                <CheckOutlined
                  key="copied"
                  style={{ marginLeft: 12, color: '#52c41a' }}
                />,
              ],
              tooltips: [
                __('Copy URL', 'kelune-crm'),
                __('Copied!', 'kelune-crm'),
              ],
            }}
          />
        }
      />

      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        {__(
          'Send a POST request to the URL above with these fields as JSON or form data. Lists and tags accept comma-separated IDs; list/tag changes require the matching allowed action.',
          'kelune-crm'
        )}
      </Text>

      <Table
        columns={fieldColumns}
        dataSource={acceptedFields}
        rowKey="key"
        size="small"
        pagination={false}
      />
    </>
  );

  return (
    <div ref={rootRef}>
      <Tabs
        defaultActiveKey={defaultTab}
        items={[
          {
            key: 'config',
            label: __('Settings', 'kelune-crm'),
            // Keep the form mounted while the Usage tab is active so submit and
            // validation still work.
            forceRender: true,
            children: configForm,
          },
          {
            key: 'usage',
            label: __('Usage', 'kelune-crm'),
            children: usageTab,
          },
        ]}
      />
    </div>
  );
};

export default WebhookForm;
