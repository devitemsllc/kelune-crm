import { useEffect, useRef, useState } from 'react';
import { Form, message } from 'antd';
import type { FormInstance } from 'antd';
import { __ } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '@store/slices/globalLoadingSlice';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';

type SettingsValues = Record<string, unknown>;

interface UseSettingsForm {
  form: FormInstance;
  /** True while the initial GET is in flight — drive a skeleton with it. */
  loading: boolean;
  /** True while a save is in flight — drive the submit button with it. */
  saving: boolean;
  /** Message from a failed load, so the section can say why it is empty. */
  error: string | null;
  /**
   * Bumps once the form has been seeded. Uncontrolled editors (RichTextEditor)
   * read their value once on mount, so use this as their React `key` to reseed
   * them when the async load lands.
   */
  seedKey: number;
  save: (values: SettingsValues) => Promise<void>;
}

const useSettingsForm = (): UseSettingsForm => {
  const [form] = Form.useForm();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedKey, setSeedKey] = useState(0);

  // Fetch once: StrictMode double-invokes mount effects, and a second bump of
  // seedKey remounts the editors keyed on it mid-initialisation.
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) {
      return;
    }
    loadedRef.current = true;

    const load = async (): Promise<void> => {
      try {
        const response = await api.settings.getAll();
        form.setFieldsValue(response.data ?? {});
        setSeedKey((key) => key + 1);
      } catch (err) {
        setError(
          getErrorMessage(err, __('Failed to load settings', 'kelune-crm'))
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [form]);

  const save = async (values: SettingsValues) => {
    setSaving(true);
    dispatch(startGlobalLoading());
    try {
      const response = await api.settings.update(values);
      form.setFieldsValue(response.data ?? {});
      message.success(__('Settings saved successfully', 'kelune-crm'));
    } catch (err) {
      message.error(
        getErrorMessage(err, __('Failed to save settings', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
      setSaving(false);
    }
  };

  return { form, loading, saving, error, seedKey, save };
};

export default useSettingsForm;
