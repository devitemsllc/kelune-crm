import { Alert, Button, Card, Form, Input } from 'antd';
import { __, sprintf } from '@wordpress/i18n';
import SettingsSectionTitle from './SettingsSectionTitle';
import useSettingsForm from './useSettingsForm';
import RichTextEditor from '@/components/common/RichTextEditor';
import { OPTIN_MERGE_TAGS } from '@/utils/mergeTags';

// Self-contained Double Opt-in settings section: the confirmation email sent to
// contacts who arrive through a source with double opt-in switched on, and
// where they land afterwards. Which sources require confirmation is set per
// source under General.
const DoubleOptinSettings = () => {
  const { form, loading, saving, error, seedKey, save } = useSettingsForm();

  return (
    <>
      <SettingsSectionTitle name={__('Double Opt-in', 'kelune-crm')} />
      {error ? (
        <Alert
          type="error"
          message={sprintf(
            // translators: %s: error message
            __('Could not load settings: %s', 'kelune-crm'),
            error
          )}
          style={{ marginBottom: 24, border: 'none' }}
        />
      ) : null}
      <Card loading={loading}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Alert
            type="info"
            message={__(
              'Contacts from a source with double opt-in enabled stay pending and receive no campaigns until they click the link in this email. Turn it on per source under General.',
              'kelune-crm'
            )}
            style={{ border: 'none', marginBottom: 24 }}
          />

          <Form.Item
            label={__('Subject', 'kelune-crm')}
            name="optin_email_subject"
            rules={[
              {
                required: true,
                message: __('Please enter a subject', 'kelune-crm'),
              },
            ]}
            tooltip={__(
              'Merge tags: {{first_name}}, {{last_name}}, {{email}}, {{business_name}}.',
              'kelune-crm'
            )}
          >
            <Input
              placeholder={__('Please confirm your subscription', 'kelune-crm')}
            />
          </Form.Item>

          <Form.Item
            label={__('Email Body', 'kelune-crm')}
            name="optin_email_body"
            tooltip={__(
              'Insert dynamic values with the Placeholders button. Must include {{confirmation_url}}.',
              'kelune-crm'
            )}
            rules={[
              {
                validator: (_, value: string) =>
                  typeof value === 'string' &&
                  value.includes('{{confirmation_url}}')
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error(
                          __(
                            'The confirmation email must contain {{confirmation_url}}.',
                            'kelune-crm'
                          )
                        )
                      ),
              },
            ]}
          >
            <RichTextEditor
              key={`optin-${seedKey}`}
              height={220}
              placeholders={OPTIN_MERGE_TAGS}
            />
          </Form.Item>

          <Form.Item
            label={__('Redirect After Confirmation', 'kelune-crm')}
            name="optin_confirm_redirect"
            tooltip={__(
              'Send confirmed contacts to your own welcome page. Leave blank to show the built-in confirmation page.',
              'kelune-crm'
            )}
          >
            <Input placeholder="https://example.com/welcome" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={saving}>
            {__('Save Settings', 'kelune-crm')}
          </Button>
        </Form>
      </Card>
    </>
  );
};

export default DoubleOptinSettings;
