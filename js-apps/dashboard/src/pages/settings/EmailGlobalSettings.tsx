import { Alert, Button, Card, Divider, Form, Input } from 'antd';
import { __, sprintf } from '@wordpress/i18n';
import SettingsSectionTitle from './SettingsSectionTitle';
import useSettingsForm from './useSettingsForm';
import RichTextEditor from '@/components/common/RichTextEditor';
import { FOOTER_MERGE_TAGS, footerComplianceMessage } from '@/utils/mergeTags';
import { formSectionDivider } from '@/utils/formStyles';

// Self-contained Global Email settings section: the site-wide sender identity
// and the footer appended to every campaign. Per-connection senders live in
// Email Providers and win over the defaults set here.
const EmailGlobalSettings = () => {
  const { form, loading, saving, error, seedKey, save } = useSettingsForm();

  return (
    <>
      <SettingsSectionTitle name={__('Global Email', 'kelune-crm')} />
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
              "These are the fallback sender details. A campaign's own From address is used first, then the sender bound to the email provider connection it sends through, and only then these.",
              'kelune-crm'
            )}
            style={{ border: 'none', marginBottom: 24 }}
          />

          <Form.Item
            label={__('From Name', 'kelune-crm')}
            name="email_from_name"
            tooltip={__(
              'The name recipients see in their inbox.',
              'kelune-crm'
            )}
          >
            <Input placeholder={__('Acme Inc.', 'kelune-crm')} />
          </Form.Item>

          <Form.Item
            label={__('From Email', 'kelune-crm')}
            name="email_from_email"
            rules={[
              {
                type: 'email',
                message: __('Enter a valid email address', 'kelune-crm'),
              },
            ]}
            tooltip={__(
              'Use an address on a domain your provider is authorised to send for, or messages may not be delivered.',
              'kelune-crm'
            )}
          >
            <Input placeholder="hello@example.com" />
          </Form.Item>

          <Form.Item
            label={__('Reply-To Name', 'kelune-crm')}
            name="email_reply_to_name"
            tooltip={__(
              'The name shown on replies. Leave blank to use the reply-to address on its own.',
              'kelune-crm'
            )}
          >
            <Input placeholder={__('Acme Support', 'kelune-crm')} />
          </Form.Item>

          <Form.Item
            label={__('Reply-To Email', 'kelune-crm')}
            name="email_reply_to_email"
            rules={[
              {
                type: 'email',
                message: __('Enter a valid email address', 'kelune-crm'),
              },
            ]}
            tooltip={__(
              'Where replies go. Leave blank to reply to the From address.',
              'kelune-crm'
            )}
          >
            <Input placeholder="support@example.com" />
          </Form.Item>

          <Divider
            orientation="left"
            orientationMargin="0"
            style={formSectionDivider}
          >
            {__('Footer & Unsubscribe', 'kelune-crm')}
          </Divider>

          <Form.Item
            label={__('Footer Content', 'kelune-crm')}
            name="email_footer_html"
            tooltip={__(
              'Appended to every campaign. Insert dynamic values with the Placeholders button.',
              'kelune-crm'
            )}
            rules={[
              {
                validator: (_, value: string) =>
                  typeof value === 'string' &&
                  value.includes('{{unsubscribe_url}}')
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error(
                          __(
                            'The footer must contain {{unsubscribe_url}} so recipients can opt out.',
                            'kelune-crm'
                          )
                        )
                      ),
              },
            ]}
            style={{ marginBottom: 8 }}
          >
            <RichTextEditor
              key={`footer-${seedKey}`}
              height={220}
              placeholders={FOOTER_MERGE_TAGS}
            />
          </Form.Item>

          <Alert
            type="warning"
            style={{ border: 'none', marginBottom: 24 }}
            message={footerComplianceMessage()}
          />

          <Form.Item
            label={__('Redirect After Unsubscribe', 'kelune-crm')}
            name="email_unsubscribe_redirect"
            tooltip={__(
              'Send people to your own page after they unsubscribe. Leave blank to show the built-in confirmation page.',
              'kelune-crm'
            )}
          >
            <Input placeholder="https://example.com/goodbye" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={saving}>
            {__('Save Settings', 'kelune-crm')}
          </Button>
        </Form>
      </Card>
    </>
  );
};

export default EmailGlobalSettings;
