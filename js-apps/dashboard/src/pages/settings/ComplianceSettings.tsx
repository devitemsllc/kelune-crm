import { Alert, Button, Card, Form } from 'antd';
import { __, sprintf } from '@wordpress/i18n';
import SettingsSectionTitle from './SettingsSectionTitle';
import useSettingsForm from './useSettingsForm';
import InlineSwitch from '@/components/common/InlineSwitch';

// Self-contained Compliance settings section: the switches that govern what
// data is collected about contacts and what is disclosed to third parties.
// Double opt-in is not here: it is set per signup source under General, because
// whether confirmation is required depends on where the contact came from.
const ComplianceSettings = () => {
  const { form, loading, saving, error, save } = useSettingsForm();

  return (
    <>
      <SettingsSectionTitle name={__('Compliance', 'kelune-crm')} />
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
          <InlineSwitch
            form={form}
            name="track_email_opens"
            label={__('Track Email Opens', 'kelune-crm')}
            tooltip={__(
              'Adds an invisible 1×1 image to every campaign and automation email. Turning this off stops open tracking entirely — open counts and open rates will no longer be recorded.',
              'kelune-crm'
            )}
          />

          <InlineSwitch
            form={form}
            name="track_email_clicks"
            label={__('Track Email Clicks', 'kelune-crm')}
            tooltip={__(
              'Rewrites links in campaign and automation emails to redirect via your site. Turning this off sends the original links untouched — click counts and click rates will no longer be recorded.',
              'kelune-crm'
            )}
          />

          <InlineSwitch
            form={form}
            name="use_gravatar_service"
            label={__('Use Gravatar Service', 'kelune-crm')}
            tooltip={__(
              "Shows a contact's Gravatar picture in place of their initials. This sends a hash of their email address to Gravatar (Automattic) each time the contact list is viewed. Off by default; contacts without a Gravatar account fall back to their initials.",
              'kelune-crm'
            )}
          />

          <Button type="primary" htmlType="submit" loading={saving}>
            {__('Save Settings', 'kelune-crm')}
          </Button>
        </Form>
      </Card>
    </>
  );
};

export default ComplianceSettings;
