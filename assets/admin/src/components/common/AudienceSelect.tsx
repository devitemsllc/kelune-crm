import { useEffect, useState } from 'react';
import { Select, message } from 'antd';
import { __, sprintf } from '@wordpress/i18n';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import type { ContactList, Tag } from '@/types/models';

type AudienceKind = 'tags' | 'lists';

interface AudienceOption {
  id: number | string;
  name: string;
}

interface AudienceSelectProps {
  /** Selected ids. Injected by Form.Item. */
  value?: number[] | number;
  /** Injected by Form.Item. */
  onChange?: (value: number[] | number) => void;
  placeholder?: string;
  /** Single-select when false. Defaults to multiple. */
  multiple?: boolean;
  disabled?: boolean;
}

const LABELS: Record<
  AudienceKind,
  { placeholder: string; error: string; orphan: string }
> = {
  tags: {
    placeholder: __('Select tags...', 'kelune-crm'),
    error: __('Failed to load tags', 'kelune-crm'),
    // translators: %d: id of a tag that no longer exists.
    orphan: __('Deleted tag (#%d)', 'kelune-crm'),
  },
  lists: {
    placeholder: __('Select lists...', 'kelune-crm'),
    error: __('Failed to load lists', 'kelune-crm'),
    // translators: %d: id of a list that no longer exists.
    orphan: __('Deleted list (#%d)', 'kelune-crm'),
  },
};

/**
 * Select bound to the CRM's tags or lists.
 *
 * Ids are normalised to Number on both the option value and the incoming
 * selection: PHP serialises ids as strings, and a string value against a
 * numeric option makes AntD render the raw id instead of the label. A selected
 * id with no matching option (its tag/list was deleted) is rendered as a
 * labelled, still-removable placeholder rather than the bare number.
 */
const useAudienceOptions = (kind: AudienceKind) => {
  const [options, setOptions] = useState<AudienceOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchOptions = async () => {
      setLoading(true);
      try {
        const response =
          kind === 'tags' ? await api.tags.getAll() : await api.lists.getAll();
        if (!active) return;
        const items: Array<Tag | ContactList> = response.data ?? [];
        setOptions(
          items.map(({ id, name }) => ({ id, name: name ?? String(id) }))
        );
      } catch (error) {
        if (active) message.error(getErrorMessage(error, LABELS[kind].error));
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchOptions();

    return () => {
      active = false;
    };
  }, [kind]);

  return { options, loading };
};

const createAudienceSelect = (kind: AudienceKind) => {
  const AudienceSelect = ({
    value,
    onChange,
    placeholder,
    multiple = true,
    disabled,
  }: AudienceSelectProps) => {
    const { options, loading } = useAudienceOptions(kind);

    const normalized = Array.isArray(value)
      ? value.map(Number)
      : value === undefined || value === null || (value as unknown) === ''
        ? undefined
        : Number(value);

    // Base options plus a labelled placeholder for any selected id whose entity
    // is no longer in the list, so a deleted tag/list reads "Deleted tag (#3)"
    // instead of the raw "3" and stays removable.
    const selectOptions = options.map(({ id, name }) => ({
      value: Number(id),
      label: name,
    }));
    const known = new Set(selectOptions.map((o) => o.value));
    const selectedIds = Array.isArray(normalized)
      ? normalized
      : normalized === undefined
        ? []
        : [normalized];
    selectedIds.forEach((id) => {
      if (!Number.isNaN(id) && !known.has(id)) {
        known.add(id);
        selectOptions.push({
          value: id,
          label: sprintf(LABELS[kind].orphan, id),
        });
      }
    });

    return (
      <Select
        mode={multiple ? 'multiple' : undefined}
        value={normalized}
        onChange={onChange}
        placeholder={placeholder ?? LABELS[kind].placeholder}
        loading={loading}
        disabled={disabled}
        allowClear
        showSearch
        optionFilterProp="label"
        options={selectOptions}
      />
    );
  };

  return AudienceSelect;
};

export const TagSelect = createAudienceSelect('tags');
export const ListSelect = createAudienceSelect('lists');
