import { Alert, Button, Card, Divider, Form, Input } from 'antd';
import { __, sprintf } from '@wordpress/i18n';
import SettingsSectionTitle from './SettingsSectionTitle';
import useSettingsForm from './useSettingsForm';
import InlineSwitch from '@/components/common/InlineSwitch';
import ImagePicker from '@/components/common/ImagePicker';
import { ListSelect, TagSelect } from '@/components/common/AudienceSelect';

const { TextArea } = Input;

const sectionDivider = { margin: '40px 0 24px' };

// Self-contained General settings section: business identity plus the automatic
// contact entry points (WordPress users, signups, comments). Sender and footer
// settings live in Global Email — this page is about who the business is and
// where its contacts come from.
const GeneralSettings = () => {
  const { form, loading, saving, error, save } = useSettingsForm();

  const signupEnabled = Form.useWatch('signup_optin_enabled', form);
  const commentEnabled = Form.useWatch('comment_optin_enabled', form);

  return (
    <>
      <SettingsSectionTitle name={__('General', 'kelune-crm')} />
      {error ? (
        <Alert
          type="error"
          message={sprintf(
            // translators: %s is the error message.
            __('Could not load settings: %s', 'kelune-crm'),
            error
          )}
          style={{ marginBottom: 24, border: 'none' }}
        />
      ) : null}
      <Card loading={loading}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item
            label={__('Logo', 'kelune-crm')}
            name="business_logo"
            tooltip={__(
              'Shown on the unsubscribe and subscription confirmation pages. A square image of at least 400×400px works best.',
              'kelune-crm'
            )}
          >
            <ImagePicker title={__('Select business logo', 'kelune-crm')} />
          </Form.Item>

          <Form.Item
            label={__('Business Name', 'kelune-crm')}
            name="business_name"
            rules={[
              {
                required: true,
                message: __('Please enter your business name', 'kelune-crm'),
              },
            ]}
            tooltip={__(
              'Used in your email footer and on public pages.',
              'kelune-crm'
            )}
          >
            <Input />
          </Form.Item>

          <Form.Item
            label={__('Business Full Address', 'kelune-crm')}
            name="business_address"
            tooltip={__(
              'A postal address in marketing emails is required by anti-spam law in most countries. Insert it with the {{business_address}} merge tag.',
              'kelune-crm'
            )}
          >
            <TextArea rows={3} />
          </Form.Item>

          <Divider
            orientation="left"
            orientationMargin="0"
            style={sectionDivider}
          >
            {__('WordPress Account Sync', 'kelune-crm')}
          </Divider>

          <InlineSwitch
            form={form}
            name="sync_users_enabled"
            label={__(
              'Keep contacts in sync with WordPress user profiles',
              'kelune-crm'
            )}
            tooltip={__(
              "When a user edits their profile, the linked contact's name and email are updated to match. The sync is one-way: a change made in the CRM is never pushed back onto the user account.",
              'kelune-crm'
            )}
          />

          <InlineSwitch
            form={form}
            name="sync_delete_contact_on_user_delete"
            label={__(
              'Delete the contact when its WordPress user is deleted',
              'kelune-crm'
            )}
            tooltip={__(
              'Permanently removes the contact along with its tags, lists, notes and activity. Leave it off to keep the contact and only unlink the account.',
              'kelune-crm'
            )}
          />

          <Divider
            orientation="left"
            orientationMargin="0"
            style={sectionDivider}
          >
            {__('New User Registrations', 'kelune-crm')}
          </Divider>

          <InlineSwitch
            form={form}
            name="signup_optin_enabled"
            label={__(
              'Create a contact when someone registers on this site',
              'kelune-crm'
            )}
            tooltip={__(
              'Runs on WordPress user registration, whichever form or plugin creates the account.',
              'kelune-crm'
            )}
          />

          {signupEnabled ? (
            <>
              <Form.Item
                label={__('Assign to Lists', 'kelune-crm')}
                name="signup_optin_list_ids"
              >
                <ListSelect />
              </Form.Item>
              <Form.Item
                label={__('Assign Tags', 'kelune-crm')}
                name="signup_optin_tag_ids"
              >
                <TagSelect />
              </Form.Item>
              <InlineSwitch
                form={form}
                name="signup_optin_double_optin"
                label={__(
                  'Require email confirmation (double opt-in)',
                  'kelune-crm'
                )}
                tooltip={__(
                  'The contact stays pending and receives no campaigns until they confirm. Configure the confirmation email under Double Opt-in.',
                  'kelune-crm'
                )}
              />
            </>
          ) : null}

          <Divider
            orientation="left"
            orientationMargin="0"
            style={sectionDivider}
          >
            {__('Comment Form Opt-in', 'kelune-crm')}
          </Divider>

          <InlineSwitch
            form={form}
            name="comment_optin_enabled"
            label={__(
              'Show a subscribe checkbox on the comment form',
              'kelune-crm'
            )}
            tooltip={__(
              "Only themes that build their comment form with WordPress's comment_form() show the checkbox.",
              'kelune-crm'
            )}
          />

          {commentEnabled ? (
            <>
              <Form.Item
                label={__('Checkbox Label', 'kelune-crm')}
                name="comment_optin_label"
                tooltip={__(
                  'The wording next to the checkbox on your comment form.',
                  'kelune-crm'
                )}
              >
                <Input
                  placeholder={__('Subscribe to our newsletter', 'kelune-crm')}
                />
              </Form.Item>
              <Form.Item
                label={__('Assign to Lists', 'kelune-crm')}
                name="comment_optin_list_ids"
              >
                <ListSelect />
              </Form.Item>
              <Form.Item
                label={__('Assign Tags', 'kelune-crm')}
                name="comment_optin_tag_ids"
              >
                <TagSelect />
              </Form.Item>
              <InlineSwitch
                form={form}
                name="comment_optin_auto_checked"
                label={__('Tick the checkbox by default', 'kelune-crm')}
                tooltip={__(
                  'Pre-ticks the box. Where consent must be freely given (for example under GDPR), leave this off.',
                  'kelune-crm'
                )}
              />
              <InlineSwitch
                form={form}
                name="comment_optin_hide_if_subscribed"
                label={__(
                  'Hide the checkbox from people who are already subscribed',
                  'kelune-crm'
                )}
                tooltip={__(
                  "Only works for logged-in visitors — an anonymous commenter's address is unknown until they submit.",
                  'kelune-crm'
                )}
              />
              <InlineSwitch
                form={form}
                name="comment_optin_double_optin"
                label={__(
                  'Require email confirmation (double opt-in)',
                  'kelune-crm'
                )}
                tooltip={__(
                  'The contact stays pending and receives no campaigns until they confirm. Configure the confirmation email under Double Opt-in.',
                  'kelune-crm'
                )}
              />
            </>
          ) : null}

          <Button type="primary" htmlType="submit" loading={saving}>
            {__('Save Settings', 'kelune-crm')}
          </Button>
        </Form>
      </Card>
    </>
  );
};

export default GeneralSettings;
