import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  Alert,
  Button,
  Card,
  Divider,
  Flex,
  Input,
  Space,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { CheckOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link, useLocation } from 'react-router-dom';
import { __, sprintf } from '@wordpress/i18n';
import { useDispatch } from '@store/hooks';
import {
  startGlobalLoading,
  stopGlobalLoading,
} from '@store/slices/globalLoadingSlice';
import SettingsSectionTitle from './SettingsSectionTitle';
import ActionConfirm from '@/components/common/ActionConfirm';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/getErrorMessage';
import type {
  BounceConfig,
  BounceProvider,
  EmailProviderType,
} from '@/types/models';

const { Text } = Typography;

const PROVIDER_LABEL: Record<EmailProviderType, string> = {
  smtp: __('SMTP', 'kelune-crm'),
  ses: __('Amazon SES', 'kelune-crm'),
  mailgun: __('Mailgun', 'kelune-crm'),
  sendgrid: __('SendGrid', 'kelune-crm'),
};

// What each provider's own console calls the key.
const SECRET_LABEL: Partial<Record<EmailProviderType, string>> = {
  mailgun: __('HTTP webhook signing key', 'kelune-crm'),
  sendgrid: __('Signed Event Webhook verification key', 'kelune-crm'),
};

const SETUP_STEPS: Partial<Record<EmailProviderType, string[]>> = {
  ses: [
    __(
      'In Amazon SNS, create a Standard topic in the same region as your sending identity, and add an HTTPS subscription pointing at the URL above. The subscription confirms itself.',
      'kelune-crm'
    ),
    __(
      'In Amazon SES, open the sending identity and set its Bounce and Complaint notifications to that topic.',
      'kelune-crm'
    ),
    __(
      'Required: enable "Include original headers" on those notifications — without it a bounce cannot be traced back to the message that caused it.',
      'kelune-crm'
    ),
  ],
  mailgun: [
    __(
      'In Mailgun, open Sending → Webhooks for your domain and add the URL above for the Permanent Failure, Temporary Failure, Spam Complaint and Unsubscribe events.',
      'kelune-crm'
    ),
    __(
      'Copy the HTTP webhook signing key from the same screen and paste it below. It is a different value from your API key.',
      'kelune-crm'
    ),
  ],
  sendgrid: [
    __(
      'In SendGrid, open Settings → Mail Settings → Event Webhook and set the URL above as the endpoint, with Bounced, Dropped, Spam Reports, Unsubscribed and Group Unsubscribed selected.',
      'kelune-crm'
    ),
    __(
      'Turn on Signed Event Webhook first, then copy the generated verification key and paste it below. A key saved here while signing is still off makes this site reject every event SendGrid sends.',
      'kelune-crm'
    ),
  ],
};

const BASE_PATH = '/settings/bounce-handling';

// Card body has no padding; each section insets itself so the rules run edge to edge.
const sectionBody: CSSProperties = { padding: 20 };

const sectionRule: CSSProperties = { margin: 0 };

const sectionLabel: CSSProperties = {
  display: 'block',
  fontWeight: 600,
  marginBottom: 8,
};

const sectionLabelInline: CSSProperties = { fontWeight: 600 };

const sectionText: CSSProperties = { color: 'rgba(0, 0, 0, 0.75)' };

// Masks the key from a shoulder or a screenshot; Copy still yields the whole URL.
const maskEndpoint = (url: string): string => {
  const cut = url.lastIndexOf('/');

  if (cut === -1) {
    return url;
  }

  const prefix = 'kelunecrmbh_';
  const key = url.slice(cut + 1);
  const body = key.startsWith(prefix) ? key.slice(prefix.length) : key;

  if (body.length <= 16) {
    return url;
  }

  return `${url.slice(0, cut + 1)}${prefix}${body.slice(0, 8)}********${body.slice(-8)}`;
};

const BounceHandling = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const [config, setConfig] = useState<BounceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.bounceConfig.get();
      setConfig(response.data);
    } catch (err) {
      setError(
        getErrorMessage(
          err,
          __('Failed to load bounce handling settings', 'kelune-crm')
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const providers = config?.providers ?? [];

  // Tab comes straight from the URL, so each provider's setup is bookmarkable.
  const requested = location.pathname.split('/')[3] ?? '';
  const active =
    providers.find((entry) => entry.provider === requested) ?? providers[0];

  const handleRegenerate = async (provider: EmailProviderType) => {
    setRegenerating(provider);
    dispatch(startGlobalLoading());
    try {
      const response = await api.bounceConfig.regenerateKey(provider);
      setConfig(response.data);
      message.success(__('Receiver URL regenerated.', 'kelune-crm'));
    } catch (err) {
      message.error(
        getErrorMessage(err, __('Failed to regenerate the key', 'kelune-crm'))
      );
    } finally {
      dispatch(stopGlobalLoading());
      setRegenerating(null);
    }
  };

  const handleSaveSecret = async (provider: EmailProviderType) => {
    const secret = (secrets[provider] ?? '').trim();
    if (!secret) {
      return;
    }

    setSavingKey(provider);
    dispatch(startGlobalLoading());
    try {
      const response = await api.bounceConfig.saveSigningSecret(
        provider,
        secret
      );
      setConfig(response.data);
      setSecrets((current) => ({ ...current, [provider]: '' }));
      message.success(__('Signing secret saved.', 'kelune-crm'));
    } catch (err) {
      message.error(
        getErrorMessage(
          err,
          __('Failed to save the signing secret', 'kelune-crm')
        )
      );
    } finally {
      dispatch(stopGlobalLoading());
      setSavingKey(null);
    }
  };

  const handleClearSecret = async (provider: EmailProviderType) => {
    setSavingKey(provider);
    dispatch(startGlobalLoading());
    try {
      const response = await api.bounceConfig.clearSigningSecret(provider);
      setConfig(response.data);
      message.success(__('Signing secret removed.', 'kelune-crm'));
    } catch (err) {
      message.error(
        getErrorMessage(
          err,
          __('Failed to remove the signing secret', 'kelune-crm')
        )
      );
    } finally {
      dispatch(stopGlobalLoading());
      setSavingKey(null);
    }
  };

  const renderProvider = (entry: BounceProvider) => {
    const steps = SETUP_STEPS[entry.provider] ?? [];

    if (!entry.has_feed) {
      return (
        <div style={sectionBody}>
          <Text style={sectionText}>
            {__(
              'SMTP has no bounce feed. The protocol gives a sending server no way to report a later bounce or a spam complaint back, so mail sent over plain SMTP cannot be tracked for either. To suppress dead addresses automatically, send through Amazon SES, Mailgun or SendGrid — through this plugin or any other.',
              'kelune-crm'
            )}
          </Text>
        </div>
      );
    }

    return (
      <>
        <div style={sectionBody}>
          <Flex
            align="center"
            justify="space-between"
            gap={8}
            style={{ marginBottom: 8 }}
          >
            <span style={sectionLabelInline}>
              {__('Receiver URL', 'kelune-crm')}
            </span>
            <ActionConfirm
              action="regenerate"
              customDescription={__(
                'The URL already pasted into this provider console stops working until you paste the new one. Other providers are unaffected. Regenerate?',
                'kelune-crm'
              )}
              onConfirm={() => void handleRegenerate(entry.provider)}
            >
              <Tooltip title={__('Regenerate URL', 'kelune-crm')}>
                <Button
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={regenerating === entry.provider}
                  aria-label={__('Regenerate URL', 'kelune-crm')}
                />
              </Tooltip>
            </ActionConfirm>
          </Flex>
          <Alert
            type="info"
            showIcon={false}
            style={{ background: '#fafafa', border: 'none', marginBottom: 8 }}
            message={
              <span style={{ wordBreak: 'break-all' }}>
                {maskEndpoint(entry.endpoint_url)}
              </span>
            }
            action={
              <Text
                className="kelune-crm-cc-copy-button"
                copyable={{
                  text: entry.endpoint_url,
                  // Antd wraps these in its own button element.
                  icon: [
                    <span key="copy">
                      <CopyOutlined /> {__('Copy', 'kelune-crm')}
                    </span>,
                    <span key="copied">
                      <CheckOutlined /> {__('Copied', 'kelune-crm')}
                    </span>,
                  ],
                  tooltips: [
                    __('Copy URL', 'kelune-crm'),
                    __('Copied!', 'kelune-crm'),
                  ],
                }}
              />
            }
          />
          <Text type="secondary">
            {__(
              'Paste this into the provider console. The key in it is what authorizes the receiver, so treat it as a credential.',
              'kelune-crm'
            )}
          </Text>
        </div>

        <Divider style={sectionRule} />

        <div style={sectionBody}>
          <div style={sectionLabel}>
            {__('Configuration Guide', 'kelune-crm')}
          </div>
          <ol style={{ paddingInlineStart: 20, margin: 0 }}>
            {steps.map((step, index) => (
              <li
                key={step}
                style={{
                  marginBottom: index === steps.length - 1 ? 0 : 8,
                }}
              >
                <Text style={sectionText}>{step}</Text>
              </li>
            ))}
          </ol>
        </div>

        <Divider style={sectionRule} />

        <div style={sectionBody}>
          {entry.uses_signing_secret ? (
            <>
              <div style={sectionLabel}>{SECRET_LABEL[entry.provider]}</div>
              <Space.Compact style={{ width: '100%' }}>
                <Input.Password
                  value={secrets[entry.provider] ?? ''}
                  onChange={(event) =>
                    setSecrets((current) => ({
                      ...current,
                      [entry.provider]: event.target.value,
                    }))
                  }
                  placeholder={
                    entry.has_signing_secret
                      ? __(
                          'Saved — paste a new key to replace it',
                          'kelune-crm'
                        )
                      : sprintf(
                          // translators: %s: the provider's own name for the credential.
                          __('Paste the %s', 'kelune-crm'),
                          SECRET_LABEL[entry.provider] ?? ''
                        )
                  }
                  onPressEnter={() => void handleSaveSecret(entry.provider)}
                />
                <Button
                  type="primary"
                  loading={savingKey === entry.provider}
                  disabled={!(secrets[entry.provider] ?? '').trim()}
                  onClick={() => void handleSaveSecret(entry.provider)}
                >
                  {__('Save', 'kelune-crm')}
                </Button>
                {entry.has_signing_secret ? (
                  <ActionConfirm
                    action="delete"
                    customDescription={__(
                      'Payloads from this provider stop being verified and are accepted on the URL key alone. Remove the signing secret?',
                      'kelune-crm'
                    )}
                    onConfirm={() => void handleClearSecret(entry.provider)}
                  >
                    <Button danger>{__('Remove', 'kelune-crm')}</Button>
                  </ActionConfirm>
                ) : null}
              </Space.Compact>
              <Alert
                type={entry.has_signing_secret ? 'success' : 'warning'}
                message={
                  entry.has_signing_secret
                    ? __(
                        'Every notification is checked against this provider signature before any contact is suppressed.',
                        'kelune-crm'
                      )
                    : __(
                        'Until a key is saved, notifications are trusted on the URL alone — anyone who learns that URL could suppress any address on your list.',
                        'kelune-crm'
                      )
                }
                style={{ border: 'none', marginTop: 12 }}
              />
            </>
          ) : (
            <>
              <div style={sectionLabel}>
                {__('Signature Verification', 'kelune-crm')}
              </div>
              <Alert
                type="success"
                message={__(
                  'Notifications are verified against the signing certificate Amazon publishes, so there is no key to enter here.',
                  'kelune-crm'
                )}
                style={{ border: 'none' }}
              />
            </>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <SettingsSectionTitle name={__('Bounce Handling', 'kelune-crm')} />

      {error ? (
        <Alert
          type="error"
          message={sprintf(
            // translators: %s: error message
            __('Could not load bounce handling settings: %s', 'kelune-crm'),
            error
          )}
          style={{ marginBottom: 24, border: 'none' }}
        />
      ) : null}

      <Alert
        type="info"
        message={__(
          'Give a provider its receiver URL and it reports back when an address is dead or a recipient marks a message as spam, and those contacts stop receiving mail at once — which is what keeps a sending account in good standing. It applies to mail sent through this plugin or any other, so no email connection is needed here.',
          'kelune-crm'
        )}
        style={{ marginBottom: 24, border: 'none' }}
      />

      <Card
        size="small"
        className="kelune-crm-cc-nav-tabs"
        loading={loading}
        tabList={providers.map((entry) => ({
          key: entry.provider,
          label: (
            <Link
              to={`${BASE_PATH}/${entry.provider}`}
              style={{ color: 'inherit' }}
            >
              {PROVIDER_LABEL[entry.provider]}
            </Link>
          ),
        }))}
        activeTabKey={active?.provider}
        tabProps={{ size: 'middle' }}
        styles={{
          header: { background: '#fafafa', fontWeight: 500 },
          body: { padding: 0 },
        }}
      >
        {active ? renderProvider(active) : null}
      </Card>
    </>
  );
};

export default BounceHandling;
