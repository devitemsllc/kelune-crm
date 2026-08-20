import React, { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from '@store/hooks';
import {
  Form,
  Input,
  Button,
  Space,
  Radio,
  Card,
  Select,
  InputNumber,
  DatePicker,
  message,
  Spin,
  Tag,
  Typography,
  Divider,
} from 'antd';
import type { FormInstance } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { __, _n, sprintf } from '@wordpress/i18n';
import {
  createSegment,
  updateSegment,
  previewSegmentCount,
  clearPreviewCount,
} from '../../store/slices/segmentsSlice';
import api from '../../services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import { formFieldDivider } from '@/utils/formStyles';
import type { Segment, Tag as TagModel, ContactList } from '@/types/models';
import InlineSwitch from '@/components/common/InlineSwitch';
import SubmitOnEnter from '@/components/common/SubmitOnEnter';

const { Option } = Select;
const { Text } = Typography;

interface Condition {
  field: string;
  operator: string;
  value: unknown;
}

interface SegmentBuilderProps {
  segment?: Segment | null;
  /** Owned by the drawer so its footer can submit this form. */
  form: FormInstance;
  onSave: () => void;
}

// Field definitions for segment filters
const FIELD_TYPES: Record<string, string[]> = {
  text: [
    'email',
    'first_name',
    'last_name',
    'company',
    'phone',
    'city',
    'state',
    'country',
    'postal_code',
    'source',
  ],
  number: ['lead_score'],
  date: ['created_at', 'updated_at'],
  select: ['status', 'tags', 'lists'],
};

const OPERATORS: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: 'equals', label: __('Equals', 'kelune-crm') },
    { value: 'not_equals', label: __('Not Equals', 'kelune-crm') },
    { value: 'contains', label: __('Contains', 'kelune-crm') },
    {
      value: 'not_contains',
      label: __('Does Not Contain', 'kelune-crm'),
    },
    { value: 'starts_with', label: __('Starts With', 'kelune-crm') },
    { value: 'ends_with', label: __('Ends With', 'kelune-crm') },
    { value: 'is_empty', label: __('Is Empty', 'kelune-crm') },
    { value: 'is_not_empty', label: __('Is Not Empty', 'kelune-crm') },
  ],
  number: [
    { value: 'equals', label: __('Equals', 'kelune-crm') },
    { value: 'not_equals', label: __('Not Equals', 'kelune-crm') },
    { value: 'greater_than', label: __('Greater Than', 'kelune-crm') },
    { value: 'less_than', label: __('Less Than', 'kelune-crm') },
    {
      value: 'greater_or_equal',
      label: __('Greater or Equal', 'kelune-crm'),
    },
    { value: 'less_or_equal', label: __('Less or Equal', 'kelune-crm') },
    { value: 'is_empty', label: __('Is Empty', 'kelune-crm') },
    { value: 'is_not_empty', label: __('Is Not Empty', 'kelune-crm') },
  ],
  date: [
    { value: 'equals', label: __('On', 'kelune-crm') },
    { value: 'not_equals', label: __('Not On', 'kelune-crm') },
    { value: 'before', label: __('Before', 'kelune-crm') },
    { value: 'after', label: __('After', 'kelune-crm') },
    {
      value: 'in_last_days',
      label: __('In Last X Days', 'kelune-crm'),
    },
    {
      value: 'not_in_last_days',
      label: __('Not In Last X Days', 'kelune-crm'),
    },
    { value: 'is_empty', label: __('Is Empty', 'kelune-crm') },
    { value: 'is_not_empty', label: __('Is Not Empty', 'kelune-crm') },
  ],
  lists: [
    { value: 'in_any', label: __('In Any', 'kelune-crm') },
    { value: 'in_all', label: __('In All', 'kelune-crm') },
    { value: 'not_in', label: __('Not In', 'kelune-crm') },
  ],
  tags: [
    { value: 'has_any', label: __('Has Any', 'kelune-crm') },
    { value: 'has_all', label: __('Has All', 'kelune-crm') },
    { value: 'not_has', label: __('Does Not Have', 'kelune-crm') },
  ],
  status: [
    { value: 'equals', label: __('Is', 'kelune-crm') },
    { value: 'not_equals', label: __('Is Not', 'kelune-crm') },
  ],
};

const FIELD_LABELS: Record<string, string> = {
  email: __('Email', 'kelune-crm'),
  first_name: __('First Name', 'kelune-crm'),
  last_name: __('Last Name', 'kelune-crm'),
  company: __('Company', 'kelune-crm'),
  phone: __('Phone', 'kelune-crm'),
  city: __('City', 'kelune-crm'),
  state: __('State', 'kelune-crm'),
  country: __('Country', 'kelune-crm'),
  postal_code: __('Postal Code', 'kelune-crm'),
  status: __('Status', 'kelune-crm'),
  source: __('Source', 'kelune-crm'),
  lead_score: __('Lead Score', 'kelune-crm'),
  created_at: __('Created At', 'kelune-crm'),
  updated_at: __('Updated At', 'kelune-crm'),
  lists: __('Lists', 'kelune-crm'),
  tags: __('Tags', 'kelune-crm'),
};

const SegmentBuilder = ({ segment, form, onSave }: SegmentBuilderProps) => {
  const dispatch = useDispatch();
  const { previewCount, previewLoading } = useSelector(
    (state) => state.segments
  );
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [matchType, setMatchType] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [allTags, setAllTags] = useState<TagModel[]>([]);
  const [allLists, setAllLists] = useState<ContactList[]>([]);

  const loadTagsAndLists = useCallback(async () => {
    try {
      const [tagsRes, listsRes] = await Promise.all([
        api.tags.getAll(),
        api.lists.getAll(),
      ]);
      setAllTags(tagsRes.data || []);
      setAllLists(listsRes.data || []);
    } catch (error) {
      console.error('Failed to load tags and lists:', error);
    }
  }, []);

  const addCondition = useCallback(() => {
    setConditions((prev) => [
      ...prev,
      {
        field: 'email',
        operator: 'contains',
        value: '',
      },
    ]);
  }, []);

  const handlePreview = useCallback(() => {
    if (conditions.length === 0) {
      return;
    }

    dispatch(previewSegmentCount({ conditions, match_type: matchType }));
  }, [conditions, matchType, dispatch]);

  useEffect(() => {
    loadTagsAndLists();

    if (segment) {
      form.setFieldsValue({
        name: segment.name,
        description: segment.description,
      });
      setConditions((segment.conditions as Condition[]) || []);
      setMatchType(segment.match_type || 'all');
      setAutoRefresh(segment.auto_refresh ?? true);
    } else {
      // Add initial empty condition
      addCondition();
    }

    return () => {
      dispatch(clearPreviewCount());
    };
  }, [segment, loadTagsAndLists, addCondition, form, dispatch]);

  useEffect(() => {
    // Auto-preview on conditions change with debounce
    if (conditions.length === 0) {
      return;
    }

    const timeout = setTimeout(() => {
      handlePreview();
    }, 1000);

    return () => {
      clearTimeout(timeout);
    };
  }, [conditions, matchType, handlePreview]);

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_: Condition, i: number) => i !== index));
  };

  const updateCondition = (index: number, updates: Partial<Condition>) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    setConditions(newConditions);
  };

  const getFieldType = (field: string) => {
    for (const [type, fields] of Object.entries(FIELD_TYPES)) {
      if (fields.includes(field)) {
        return type;
      }
    }
    return 'text';
  };

  const getOperatorsForField = (field: string) => {
    const fieldType = getFieldType(field);
    return OPERATORS[field] || OPERATORS[fieldType] || OPERATORS.text;
  };

  const needsValue = (operator: string) => {
    return !['is_empty', 'is_not_empty'].includes(operator);
  };

  const renderValueInput = (condition: Condition, index: number) => {
    if (!needsValue(condition.operator)) {
      return null;
    }

    const fieldType = getFieldType(condition.field);

    switch (fieldType) {
      case 'number':
        return (
          <InputNumber
            placeholder={__('Enter value', 'kelune-crm')}
            style={{ width: '100%' }}
            value={condition.value as number}
            onChange={(value) => updateCondition(index, { value })}
          />
        );

      case 'date':
        if (
          condition.operator === 'in_last_days' ||
          condition.operator === 'not_in_last_days'
        ) {
          return (
            <InputNumber
              placeholder={__('Number of days', 'kelune-crm')}
              style={{ width: '100%' }}
              value={condition.value as number}
              onChange={(value) => updateCondition(index, { value })}
            />
          );
        }
        return (
          <DatePicker
            style={{ width: '100%' }}
            value={condition.value ? dayjs(condition.value as string) : null}
            onChange={(date, dateString) =>
              updateCondition(index, { value: dateString })
            }
          />
        );

      case 'select':
        if (condition.field === 'tags') {
          return (
            <Select
              mode="multiple"
              placeholder={__('Select tags', 'kelune-crm')}
              style={{ width: '100%' }}
              value={
                Array.isArray(condition.value)
                  ? condition.value.map(Number)
                  : []
              }
              onChange={(value) => updateCondition(index, { value })}
            >
              {allTags.map((tag: TagModel) => (
                <Option key={tag.id} value={Number(tag.id)}>
                  {tag.name}
                </Option>
              ))}
            </Select>
          );
        }

        if (condition.field === 'lists') {
          return (
            <Select
              mode="multiple"
              placeholder={__('Select lists', 'kelune-crm')}
              style={{ width: '100%' }}
              value={
                Array.isArray(condition.value)
                  ? condition.value.map(Number)
                  : []
              }
              onChange={(value) => updateCondition(index, { value })}
            >
              {allLists.map((list: ContactList) => (
                <Option key={list.id} value={Number(list.id)}>
                  {list.name}
                </Option>
              ))}
            </Select>
          );
        }

        if (condition.field === 'status') {
          return (
            <Select
              placeholder={__('Select status', 'kelune-crm')}
              style={{ width: '100%' }}
              value={condition.value as string}
              onChange={(value) => updateCondition(index, { value })}
            >
              <Option value="active">{__('Active', 'kelune-crm')}</Option>
              <Option value="inactive">{__('Inactive', 'kelune-crm')}</Option>
              <Option value="pending">{__('Pending', 'kelune-crm')}</Option>
            </Select>
          );
        }
        break;

      default:
        return (
          <Input
            placeholder={__('Enter value', 'kelune-crm')}
            value={condition.value as string}
            onChange={(e) => updateCondition(index, { value: e.target.value })}
          />
        );
    }
  };

  const handleSubmit = async (values: Record<string, unknown>) => {
    if (conditions.length === 0) {
      message.error(__('Please add at least one condition', 'kelune-crm'));
      return;
    }

    try {
      const data = {
        name: values.name,
        description: values.description,
        conditions,
        match_type: matchType,
        cache_enabled: true,
        auto_refresh: autoRefresh,
      };

      if (segment) {
        await dispatch(updateSegment({ id: segment.id, ...data })).unwrap();
        message.success(__('Segment updated successfully', 'kelune-crm'));
      } else {
        await dispatch(createSegment(data)).unwrap();
        message.success(__('Segment created successfully', 'kelune-crm'));
      }

      onSave();
    } catch (error) {
      message.error(getErrorMessage(error));
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit}>
      <Form.Item
        label={__('Segment Name', 'kelune-crm')}
        name="name"
        rules={[
          {
            required: true,
            message: __('Please enter segment name', 'kelune-crm'),
          },
        ]}
      >
        <Input placeholder={__('e.g., High Value Customers', 'kelune-crm')} />
      </Form.Item>

      <Form.Item label={__('Description', 'kelune-crm')} name="description">
        <Input.TextArea
          rows={2}
          placeholder={__('Describe this segment...', 'kelune-crm')}
        />
      </Form.Item>

      <Divider style={formFieldDivider} />

      <Form.Item label={__('Match Type', 'kelune-crm')}>
        <Radio.Group
          value={matchType}
          onChange={(e) => setMatchType(e.target.value)}
        >
          <Radio value="all">
            {__('Match All Conditions (AND)', 'kelune-crm')}
          </Radio>
          <Radio value="any">
            {__('Match Any Condition (OR)', 'kelune-crm')}
          </Radio>
        </Radio.Group>
      </Form.Item>

      <Form.Item label={__('Conditions', 'kelune-crm')}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          {conditions.map((condition: Condition, index: number) => (
            <Card key={index} size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Space style={{ width: '100%' }}>
                  <Select
                    placeholder={__('Select field', 'kelune-crm')}
                    style={{ width: 180 }}
                    value={condition.field}
                    onChange={(value) => {
                      const operators = getOperatorsForField(value);
                      updateCondition(index, {
                        field: value,
                        operator: operators[0].value,
                        value: '',
                      });
                    }}
                  >
                    {Object.keys(FIELD_LABELS).map((field) => (
                      <Option key={field} value={field}>
                        {FIELD_LABELS[field]}
                      </Option>
                    ))}
                  </Select>

                  <Select
                    placeholder={__('Select operator', 'kelune-crm')}
                    style={{ width: 180 }}
                    value={condition.operator}
                    onChange={(value) =>
                      updateCondition(index, { operator: value })
                    }
                  >
                    {getOperatorsForField(condition.field).map(
                      (op: { value: string; label: string }) => (
                        <Option key={op.value} value={op.value}>
                          {op.label}
                        </Option>
                      )
                    )}
                  </Select>

                  <div style={{ flex: 1 }}>
                    {renderValueInput(condition, index)}
                  </div>

                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeCondition(index)}
                    disabled={conditions.length === 1}
                  />
                </Space>
              </Space>
            </Card>
          ))}

          <Button
            type="dashed"
            onClick={addCondition}
            icon={<PlusOutlined />}
            block
          >
            {__('Add Condition', 'kelune-crm')}
          </Button>
        </Space>
      </Form.Item>

      <Divider style={formFieldDivider} />

      <Card size="small">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <Space>
            <Text strong>{__('Preview:', 'kelune-crm')}</Text>
            {previewLoading ? (
              <Spin style={{ maxHeight: 'unset' }} />
            ) : (
              <Tag color="blue" style={{ paddingBlock: 1 }}>
                {sprintf(
                  // translators: %d: number of matching contacts
                  _n(
                    '%d contact matches',
                    '%d contacts match',
                    previewCount,
                    'kelune-crm'
                  ),
                  previewCount
                )}
              </Tag>
            )}
            <Button size="small" onClick={handlePreview}>
              {__('Refresh Preview', 'kelune-crm')}
            </Button>
          </Space>
          <InlineSwitch
            inline
            checked={autoRefresh}
            onChange={setAutoRefresh}
            style={{ marginBottom: 0 }}
            label={__('Auto Refresh', 'kelune-crm')}
            tooltip={__(
              "Automatically recalculate this segment's members on a schedule. Turn off to only update it via manual refresh.",
              'kelune-crm'
            )}
          />
        </div>
      </Card>
      <SubmitOnEnter />
    </Form>
  );
};

export default SegmentBuilder;
