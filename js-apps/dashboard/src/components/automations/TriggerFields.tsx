import React, { useCallback, useEffect, useState } from 'react';
import { Divider, Form, Input, Select } from 'antd';
import { __ } from '@wordpress/i18n';
import type { FormInstance } from 'antd';
import api from '../../services/api';
import { formSectionDivider } from '../../utils/formStyles';
import {
  LIST_TRIGGERS,
  TAG_TRIGGERS,
  TRIGGER_OPTIONS,
  WAIT_UNITS,
} from './triggerTypes';
import type { ContactList, Tag } from '@/types/models';

interface TriggerFieldsProps {
  /** The host form; the fields bind to trigger_type, trigger_config.* and settings.*. */
  form: FormInstance;
}

/**
 * How contacts get into an automation: the trigger that fires, whatever entity
 * it targets, and whether one contact may run through more than once. Defined
 * once and mounted by both surfaces that write it — the create modal and the
 * canvas trigger drawer — so the two cannot disagree.
 */
const TriggerFields = ({ form }: TriggerFieldsProps) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [lists, setLists] = useState<ContactList[]>([]);

  const triggerType = Form.useWatch('trigger_type', form) as string | undefined;
  // Drives both the visibility of Wait Between Entries and which of the two
  // re-entry fields is last in the form (the last one carries no bottom margin).
  const allowReentry = Boolean(
    Form.useWatch(['settings', 'allow_reentry'], form)
  );

  // Each source loads independently so one failing route never wipes the other.
  const fetchEntities = useCallback(async () => {
    const [tagsRes, listsRes] = await Promise.allSettled([
      api.tags.getAll(),
      api.lists.getAll(),
    ]);

    if (tagsRes.status === 'fulfilled') setTags(tagsRes.value.data || []);
    if (listsRes.status === 'fulfilled') setLists(listsRes.value.data || []);
  }, []);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  const configField = () => {
    if (TAG_TRIGGERS.has(triggerType ?? '')) {
      return (
        <Form.Item
          label={__('Tag', 'kelune-crm')}
          name={['trigger_config', 'tag_id']}
          rules={[
            {
              required: true,
              message: __('Please select a tag', 'kelune-crm'),
            },
          ]}
          tooltip={__(
            'Only contacts whose tag change matches this tag are enrolled.',
            'kelune-crm'
          )}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={__('Select tag', 'kelune-crm')}
            options={tags.map((tag) => ({
              value: Number(tag.id),
              label: tag.name,
            }))}
          />
        </Form.Item>
      );
    }

    if (LIST_TRIGGERS.has(triggerType ?? '')) {
      return (
        <Form.Item
          label={__('List', 'kelune-crm')}
          name={['trigger_config', 'list_id']}
          rules={[
            {
              required: true,
              message: __('Please select a list', 'kelune-crm'),
            },
          ]}
          tooltip={__(
            'Only contacts whose list change matches this list are enrolled.',
            'kelune-crm'
          )}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={__('Select list', 'kelune-crm')}
            options={lists.map((list) => ({
              value: Number(list.id),
              label: list.name,
            }))}
          />
        </Form.Item>
      );
    }

    return null;
  };

  return (
    <>
      <Form.Item
        label={__('Trigger Type', 'kelune-crm')}
        name="trigger_type"
        rules={[
          {
            required: true,
            message: __('Please select a trigger', 'kelune-crm'),
          },
        ]}
        tooltip={__(
          'Sets what enrols contacts into this automation.',
          'kelune-crm'
        )}
      >
        <Select
          placeholder={__('Select trigger', 'kelune-crm')}
          options={TRIGGER_OPTIONS}
          onChange={() => form.setFieldsValue({ trigger_config: {} })}
        />
      </Form.Item>

      {configField()}

      <Divider
        orientation="left"
        orientationMargin="0"
        style={formSectionDivider}
      >
        {__('Enrollment', 'kelune-crm')}
      </Divider>

      <Form.Item
        label={__('Allow Re-entry', 'kelune-crm')}
        name={['settings', 'allow_reentry']}
        tooltip={__(
          'Allow contacts to enter this automation multiple times',
          'kelune-crm'
        )}
        style={allowReentry ? undefined : { marginBottom: 0 }}
      >
        <Select
          options={[
            {
              value: false,
              label: __('No - Run once per contact', 'kelune-crm'),
            },
            {
              value: true,
              label: __('Yes - Allow multiple entries', 'kelune-crm'),
            },
          ]}
        />
      </Form.Item>

      {/* Wait Between Entries only applies when re-entry is allowed — hidden
          for run-once, where there is no second entry to delay. */}
      {allowReentry && (
        <Form.Item
          label={__('Wait Between Entries', 'kelune-crm')}
          tooltip={__(
            'How long to wait before allowing re-entry',
            'kelune-crm'
          )}
          style={{ marginBottom: 0 }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <Form.Item name={['settings', 'reentry_wait_value']} noStyle>
              <Input
                type="number"
                min={0}
                placeholder={__('Amount', 'kelune-crm')}
                style={{ flex: 1 }}
              />
            </Form.Item>
            <Form.Item name={['settings', 'reentry_wait_unit']} noStyle>
              <Select style={{ width: 120 }} options={WAIT_UNITS} />
            </Form.Item>
          </div>
        </Form.Item>
      )}
    </>
  );
};

export default TriggerFields;
