import React, { useEffect } from 'react';
import {
  Button,
  Card,
  Checkbox,
  Col,
  Dropdown,
  Flex,
  Form,
  Input,
  Row,
} from 'antd';
import { DownOutlined, MacCommandOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import { __ } from '@wordpress/i18n';
import type {
  CrmRole,
  RoleCapabilityGroup,
  RolePreset,
} from '../../types/models';
import { CAP } from '../../utils/capabilities';
import { isProActive } from '../../hooks/useFeature';
import ProTag from '../common/ProTag';
import SubmitOnEnter from '../common/SubmitOnEnter';

export interface RoleFormValues {
  name: string;
  capabilities: string[];
}

interface CapabilityMatrixProps {
  groups: RoleCapabilityGroup[];
  /** Shipped capability sets offered as a starting point. */
  presets: RolePreset[];
  /** Supplied by Form.Item. */
  value?: string[];
  onChange?: (value: string[]) => void;
}

/** Capability checkboxes, grouped, each group with its own select-all. */
const CapabilityMatrix = ({
  groups,
  presets,
  value = [],
  onChange,
}: CapabilityMatrixProps) => {
  const proActive = isProActive();

  // Includes the dashboard access capability, which has no card of its own.
  const everyCapability = groups.flatMap((group) =>
    Object.keys(group.capabilities)
  );

  const toggleGroup = (slugs: string[], checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...value, ...slugs]))
      : value.filter((slug) => !slugs.includes(slug));

    onChange?.(next);
  };

  const toggleOne = (slug: string, checked: boolean) => {
    onChange?.(
      checked
        ? Array.from(new Set([...value, slug]))
        : value.filter((granted) => granted !== slug)
    );
  };

  const selectedCount = everyCapability.filter((slug) =>
    value.includes(slug)
  ).length;

  return (
    <>
      <Card
        size="small"
        style={{ background: '#fafafa', marginBottom: 24 }}
        styles={{ body: { padding: '8px 12px' } }}
      >
        <Flex align="center" justify="space-between" gap={12} wrap>
          <Checkbox
            checked={selectedCount === everyCapability.length}
            indeterminate={
              selectedCount > 0 && selectedCount < everyCapability.length
            }
            onChange={(event) =>
              onChange?.(event.target.checked ? everyCapability : [])
            }
          >
            {__('All Permissions', 'kelune-crm')}
          </Checkbox>

          <Dropdown
            trigger={['click']}
            menu={{
              items: presets.map((preset) => ({
                key: preset.slug,
                label: preset.name,
              })),
              onClick: ({ key }) => {
                const preset = presets.find((item) => item.slug === key);
                if (preset) {
                  onChange?.(preset.capabilities);
                }
              },
            }}
          >
            <Button size="small" icon={<MacCommandOutlined />}>
              {__('Preset', 'kelune-crm')} <DownOutlined />
            </Button>
          </Dropdown>
        </Flex>
      </Card>

      {groups.map((group) => {
        // Dashboard access comes with any permission (RoleList adds it on save).
        if (group.key === 'general') {
          return null;
        }

        const slugs = Object.keys(group.capabilities);
        const selected = slugs.filter((slug) => value.includes(slug));

        return (
          <Card
            key={group.key}
            size="small"
            styles={{
              header: { background: '#fafafa' },
              title: { fontWeight: 'normal' },
            }}
            style={{ margin: '24px 0 0' }}
            title={
              <Flex align="center" gap={8}>
                <Checkbox
                  checked={selected.length === slugs.length}
                  indeterminate={
                    selected.length > 0 && selected.length < slugs.length
                  }
                  onChange={(event) => toggleGroup(slugs, event.target.checked)}
                >
                  {group.label}
                </Checkbox>
                {group.pro && !proActive ? <ProTag /> : null}
              </Flex>
            }
          >
            <Row gutter={[8, 8]}>
              {slugs.map((slug) => (
                <Col key={slug} xs={24} sm={12}>
                  <Checkbox
                    checked={value.includes(slug)}
                    onChange={(event) => toggleOne(slug, event.target.checked)}
                  >
                    {group.capabilities[slug]}
                  </Checkbox>
                </Col>
              ))}
            </Row>
          </Card>
        );
      })}
    </>
  );
};

interface RoleFormProps {
  form: FormInstance<RoleFormValues>;
  groups: RoleCapabilityGroup[];
  presets: RolePreset[];
  /** The role being edited; absent while creating one. */
  role?: CrmRole | null;
  onFinish: (values: RoleFormValues) => void;
}

/**
 * Name + capability matrix for one role. The name is editable only for custom
 * CRM roles — WordPress' own and the shipped three keep the names they are
 * known by everywhere else.
 */
const RoleForm = ({ form, groups, presets, role, onFinish }: RoleFormProps) => {
  const nameLocked = Boolean(role && (!role.is_crm_role || role.is_built_in));

  useEffect(() => {
    form.setFieldsValue({
      name: role?.name ?? '',
      capabilities: role?.capabilities ?? [CAP.ACCESS],
    });
  }, [form, role]);

  return (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Form.Item
        name="name"
        label={__('Role Name', 'kelune-crm')}
        rules={[
          {
            required: true,
            message: __('Role name is required.', 'kelune-crm'),
          },
        ]}
      >
        <Input
          disabled={nameLocked}
          placeholder={__('e.g. Marketing Assistant', 'kelune-crm')}
        />
      </Form.Item>

      <Form.Item name="capabilities" noStyle>
        <CapabilityMatrix groups={groups} presets={presets} />
      </Form.Item>

      <SubmitOnEnter />
    </Form>
  );
};

export default RoleForm;
