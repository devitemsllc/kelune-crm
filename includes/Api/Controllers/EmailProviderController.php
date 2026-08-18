<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Models\EmailProvider;
use KeluneCRM\Repositories\EmailProviderRepository;
use KeluneCRM\Services\Providers\ProviderFactory;

/**
 * REST CRUD for email provider connections, plus connection testing and
 * verified-sender lookups. Mirrors the secret-masking contract used by
 * SettingsController: stored secrets are never sent to the browser in
 * plaintext; the client echoes a sentinel back for unchanged secrets.
 */
class EmailProviderController extends BaseController
{
    protected string $restBase = 'email-providers';

    private EmailProviderRepository $repository;

    private ProviderFactory $factory;

    /**
     * Sentinel returned in place of stored secrets. Matches SettingsController so
     * the frontend handles masked secrets the same way everywhere.
     */
    private const SECRET_MASK = '__secret_unchanged__';

    public function __construct()
    {
        $this->repository = new EmailProviderRepository();
        $this->factory = new ProviderFactory();
    }

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

        register_rest_route($namespace, '/' . $this->restBase, [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'getItems'],
                'permission_callback' => [$this, 'checkReadPermission'],
            ],
            [
                'methods' => \WP_REST_Server::CREATABLE,
                'callback' => [$this, 'createItem'],
                'permission_callback' => [$this, 'checkWritePermission'],
            ],
        ]);

        // Test an arbitrary (possibly unsaved) connection config.
        register_rest_route($namespace, '/' . $this->restBase . '/test', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'testItem'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)', [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'getItem'],
                'permission_callback' => [$this, 'checkReadPermission'],
            ],
            [
                'methods' => \WP_REST_Server::EDITABLE,
                'callback' => [$this, 'updateItem'],
                'permission_callback' => [$this, 'checkWritePermission'],
            ],
            [
                'methods' => \WP_REST_Server::DELETABLE,
                'callback' => [$this, 'deleteItem'],
                'permission_callback' => [$this, 'checkWritePermission'],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/verified-senders', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getVerifiedSenders'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        // Connection Details view (stats + valid senders + verified domains).
        // SES returns live send-quota stats; other providers return their bound
        // sender only.
        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/connection-details', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'connectionDetails'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        // Manual sender emails for a connection (Amazon SES only): register/remove
        // an extra From address so mail sent as it routes through this connection
        // untouched instead of being force-rewritten.
        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/senders', [
            [
                'methods' => \WP_REST_Server::CREATABLE,
                'callback' => [$this, 'addSender'],
                'permission_callback' => [$this, 'checkWritePermission'],
            ],
            [
                'methods' => \WP_REST_Server::DELETABLE,
                'callback' => [$this, 'removeSender'],
                'permission_callback' => [$this, 'checkWritePermission'],
            ],
        ]);
    }

    public function getItems(\WP_REST_Request $request): \WP_REST_Response
    {
        $params = [
            'page' => absint($request->get_param('page') ?: 1),
            'per_page' => absint($request->get_param('per_page') ?: 20),
            'search' => sanitize_text_field((string) ($request->get_param('search') ?? '')),
            'status' => sanitize_text_field((string) ($request->get_param('status') ?? '')),
            'provider_type' => sanitize_key((string) ($request->get_param('provider_type') ?? '')),
            'orderby' => sanitize_key((string) ($request->get_param('orderby') ?? 'id')),
            'order' => sanitize_text_field((string) ($request->get_param('order') ?? 'DESC')),
        ];

        $items = $this->repository->getAll($params);
        $total = $this->repository->getCount($params);

        $response = $this->successResponse(
            array_map(fn (EmailProvider $p): array => $p->toArray(self::SECRET_MASK), $items)
        );
        $response->header('X-WP-Total', (string) $total);

        return $response;
    }

    public function getItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $provider = $this->repository->find((int) $request->get_param('id'));

        if (!$provider) {
            return $this->errorResponse(__('Email provider not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($provider->toArray(self::SECRET_MASK));
    }

    public function createItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $data = $request->get_json_params() ?: [];

        $validated = $this->validateInput($data);
        if (is_wp_error($validated)) {
            return $validated;
        }

        $clean = $this->sanitizeInputData($data, []);

        $credentials_valid = $this->validateCredentials($clean['provider_type'], $clean['credentials']);
        if (is_wp_error($credentials_valid)) {
            return $credentials_valid;
        }

        $id = $this->repository->create($clean);
        if (!$id) {
            return $this->errorResponse(__('Failed to create email provider', 'kelune-crm'), 'create_failed', 500);
        }

        // Populate the connection's verified senders so from-email routing works
        // immediately.
        $this->syncVerifiedSenders($id);

        $provider = $this->repository->find($id);
        if (!$provider) {
            return $this->errorResponse(__('Email provider not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse(
            $provider->toArray(self::SECRET_MASK),
            __('Email provider created successfully', 'kelune-crm')
        );
    }

    public function updateItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = (int) $request->get_param('id');
        $existing = $this->repository->find($id);

        if (!$existing) {
            return $this->errorResponse(__('Email provider not found', 'kelune-crm'), 'not_found', 404);
        }

        $data = $request->get_json_params() ?: [];

        // Merge for validation so an unchanged provider_type/sender still validates.
        $merged = array_merge($existing->toArray(), $data);
        $validated = $this->validateInput($merged);
        if (is_wp_error($validated)) {
            return $validated;
        }

        $clean = $this->sanitizeInputData($data, $existing->credentials, $existing->settings);

        $credentials_valid = $this->validateCredentials($clean['provider_type'], $clean['credentials']);
        if (is_wp_error($credentials_valid)) {
            return $credentials_valid;
        }

        if (!$this->repository->update($id, $clean)) {
            return $this->errorResponse(__('Failed to update email provider', 'kelune-crm'), 'update_failed', 500);
        }

        // Refresh verified senders so from-email routing reflects the saved
        // credentials/sender.
        $this->syncVerifiedSenders($id);

        $provider = $this->repository->find($id);
        if (!$provider) {
            return $this->errorResponse(__('Email provider not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse(
            $provider->toArray(self::SECRET_MASK),
            __('Email provider updated successfully', 'kelune-crm')
        );
    }

    public function deleteItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = (int) $request->get_param('id');

        if (!$this->repository->find($id)) {
            return $this->errorResponse(__('Email provider not found', 'kelune-crm'), 'not_found', 404);
        }

        if (!$this->repository->delete($id)) {
            return $this->errorResponse(__('Failed to delete email provider', 'kelune-crm'), 'delete_failed', 500);
        }

        return $this->successResponse([], __('Email provider deleted successfully', 'kelune-crm'));
    }

    /**
     * Test a connection. Accepts either a saved provider id (secrets pulled from
     * storage) or a full inline config for an unsaved connection.
     */
    public function testItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $rate_limit = $this->checkRateLimitForTest();
        if (is_wp_error($rate_limit)) {
            return $rate_limit;
        }

        $data = $request->get_json_params() ?: [];

        $config = $this->buildTestConfig($data);
        if (is_wp_error($config)) {
            return $config;
        }

        [$type, $providerConfig] = $config;

        $driver = $this->factory->make($type);
        if (!$driver) {
            return $this->errorResponse(__('Invalid email provider type', 'kelune-crm'), 'invalid_type', 400);
        }

        $result = $driver->testConnection($providerConfig);
        if (is_wp_error($result)) {
            return $this->errorResponse($result->get_error_message(), (string) $result->get_error_code(), 400);
        }

        return $this->successResponse(
            [],
            __('Connection successful! This provider is configured correctly.', 'kelune-crm')
        );
    }

    /**
     * Fetch and cache the verified sender identities for a saved provider.
     */
    public function getVerifiedSenders(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = (int) $request->get_param('id');
        $provider = $this->repository->find($id);

        if (!$provider) {
            return $this->errorResponse(__('Email provider not found', 'kelune-crm'), 'not_found', 404);
        }

        $driver = $this->factory->make($provider->provider_type);
        if (!$driver) {
            return $this->errorResponse(__('Invalid email provider type', 'kelune-crm'), 'invalid_type', 400);
        }

        $senders = $driver->getVerifiedSenders($provider->toProviderConfig());
        $this->repository->updateVerifiedSenders($id, $senders);

        return $this->successResponse([
            'verified_senders' => $senders,
            // When empty the provider could not enumerate identities (no
            // permission, or SMTP): the UI then allows any sender with a warning.
            'can_enumerate' => !empty($senders),
        ]);
    }

    /**
     * Connection Details for the info modal. Returns the connection's sender
     * identity, its valid sending emails, the verified domains that gate manual
     * additions, and — for SES — live send-quota stats. Non-SES connections
     * expose only their bound sender.
     */
    public function connectionDetails(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = (int) $request->get_param('id');
        $provider = $this->repository->find($id);
        if (!$provider) {
            return $this->errorResponse(__('Email provider not found', 'kelune-crm'), 'not_found', 404);
        }

        $driver = $this->factory->make($provider->provider_type);
        $identities = $driver ? array_map('strtolower', $driver->getVerifiedSenders($provider->toProviderConfig())) : [];
        $verified_domains = array_values(array_filter($identities, static fn (string $i): bool => strpos($i, '@') === false));

        $stats = null;
        if ($driver instanceof \KeluneCRM\Services\Providers\SESProvider) {
            $stats = $driver->getSendStats($provider->toProviderConfig());
        }

        return $this->successResponse([
            'provider_type' => $provider->provider_type,
            'provider_label' => $this->factory->getLabel($provider->provider_type),
            'sender_email' => $provider->sender_email,
            'sender_name' => $provider->sender_name,
            'force_from_name' => ($provider->settings['force_from_name'] ?? 'no') === 'yes',
            'valid_senders' => $provider->allowedSenders(),
            'manual_senders' => $provider->manualSenders(),
            'verified_domains' => $verified_domains,
            // Manual senders can only be added when a verified SES domain exists.
            'can_add_senders' => $provider->provider_type === 'ses' && $verified_domains !== [],
            'stats' => $stats,
        ]);
    }

    /**
     * Register an extra sender email on a connection (Amazon SES only). The
     * address's domain must be a verified SES domain; on success it is stored in
     * the connection's manual senders so mail sent as it routes through this
     * connection untouched instead of being force-rewritten.
     */
    public function addSender(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = (int) $request->get_param('id');
        $provider = $this->repository->find($id);
        if (!$provider) {
            return $this->errorResponse(__('Email provider not found', 'kelune-crm'), 'not_found', 404);
        }

        if ($provider->provider_type !== 'ses') {
            return $this->errorResponse(
                __('Adding sender emails is only supported for Amazon SES connections.', 'kelune-crm'),
                'not_supported',
                400
            );
        }

        $email = strtolower(sanitize_email((string) $request->get_param('email')));
        if (!is_email($email)) {
            return $this->errorResponse(__('Please provide a valid email address.', 'kelune-crm'), 'invalid_email', 400);
        }

        if ($provider->ownsSender($email)) {
            return $this->errorResponse(__('This email is already a sender on this connection.', 'kelune-crm'), 'sender_exists', 422);
        }

        // The email's domain must be a verified SES domain. SES identities are
        // returned mixed — keep the bare-domain entries and confirm the address
        // sits on one of them.
        $driver = $this->factory->make($provider->provider_type);
        if (!$driver) {
            return $this->errorResponse(__('Invalid email provider type', 'kelune-crm'), 'invalid_type', 400);
        }
        $identities = array_map('strtolower', $driver->getVerifiedSenders($provider->toProviderConfig()));
        $domains = array_values(array_filter($identities, static fn (string $i): bool => strpos($i, '@') === false));
        $email_domain = substr($email, strpos($email, '@') + 1);
        if (!in_array($email_domain, $domains, true)) {
            return $this->errorResponse(
                __('Invalid email address! Please use a verified domain.', 'kelune-crm'),
                'unverified_domain',
                422
            );
        }

        // Not already claimed by another active connection.
        $owner = $this->repository->findForSender($email);
        if ($owner && (int) $owner->id !== $id) {
            return $this->errorResponse(
                __('This email is already used by another connection.', 'kelune-crm'),
                'sender_conflict',
                422
            );
        }

        $manual = $provider->manualSenders();
        $manual[] = $email;
        $this->repository->updateManualSenders($id, $manual);

        $provider = $this->repository->find($id);
        if (!$provider) {
            return $this->errorResponse(__('Email provider not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse(
            $provider->toArray(self::SECRET_MASK),
            __('Sender email added.', 'kelune-crm')
        );
    }

    /**
     * Remove a manually-added sender email from a connection (Amazon SES only).
     * Only manual entries can be removed — the bound sender and provider-enumerated
     * identities are permanent.
     */
    public function removeSender(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = (int) $request->get_param('id');
        $provider = $this->repository->find($id);
        if (!$provider) {
            return $this->errorResponse(__('Email provider not found', 'kelune-crm'), 'not_found', 404);
        }

        if ($provider->provider_type !== 'ses') {
            return $this->errorResponse(
                __('Removing sender emails is only supported for Amazon SES connections.', 'kelune-crm'),
                'not_supported',
                400
            );
        }

        $email = strtolower(sanitize_email((string) $request->get_param('email')));
        $manual = array_map('strtolower', $provider->manualSenders());
        if (!in_array($email, $manual, true)) {
            return $this->errorResponse(
                __('This email is not a manually-added sender on this connection.', 'kelune-crm'),
                'sender_not_found',
                404
            );
        }

        $remaining = array_values(array_filter($manual, static fn (string $e): bool => $e !== $email));
        $this->repository->updateManualSenders($id, $remaining);

        $provider = $this->repository->find($id);
        if (!$provider) {
            return $this->errorResponse(__('Email provider not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse(
            $provider->toArray(self::SECRET_MASK),
            __('Sender email removed.', 'kelune-crm')
        );
    }

    /**
     * Refresh a connection's stored verified senders from the provider, best
     * effort. The list feeds the from-email → connection routing (see
     * {@see \KeluneCRM\Repositories\EmailProviderRepository::findForSender()}),
     * so it must be populated at save time, not only when the UI asks. Network or
     * permission failures are swallowed — the connection still saves, and the
     * sender list stays whatever it was (an empty list simply means "allow any
     * sender", handled downstream).
     */
    private function syncVerifiedSenders(int $id): void
    {
        $provider = $this->repository->find($id);
        if (!$provider || !$provider->isActive()) {
            return;
        }

        $driver = $this->factory->make($provider->provider_type);
        if (!$driver) {
            return;
        }

        try {
            $senders = $driver->getVerifiedSenders($provider->toProviderConfig());
        } catch (\Throwable) {
            return;
        }

        if (!empty($senders)) {
            $this->repository->updateVerifiedSenders($id, $senders);
        }
    }

    /**
     * Validate the public fields of a create/update payload.
     *
     * @param array<string, mixed> $data
     * @return true|\WP_Error
     */
    private function validateInput(array $data): bool|\WP_Error
    {
        $errors = [];

        if (empty($data['name'])) {
            $errors[] = __('Name is required', 'kelune-crm');
        }

        $type = $data['provider_type'] ?? '';
        if (!is_string($type) || !$this->factory->isValidType($type)) {
            $errors[] = __('A valid provider type is required', 'kelune-crm');
            $type = '';
        }

        if (empty($data['sender_email'])) {
            $errors[] = __('Sender email is required', 'kelune-crm');
        } elseif (!is_email((string) $data['sender_email'])) {
            $errors[] = __('Sender email is invalid', 'kelune-crm');
        }

        if (!empty($data['reply_to']) && !is_email((string) $data['reply_to'])) {
            $errors[] = __('Reply-to email is invalid', 'kelune-crm');
        }

        if ($errors) {
            return $this->errorResponse(implode(', ', $errors), 'validation_failed', 400);
        }

        return true;
    }

    /**
     * Sanitize a create/update payload into a repository-ready array. Secret
     * credentials left as the sentinel are preserved from $existing rather than
     * overwritten with the mask.
     *
     * @param array<string, mixed> $data
     * @param array<string, mixed> $existing Existing stored credentials.
     * @param array<string, mixed> $existing_settings Existing stored settings.
     * @return array<string, mixed>
     */
    private function sanitizeInputData(array $data, array $existing, array $existing_settings = []): array
    {
        $type = sanitize_key((string) ($data['provider_type'] ?? ''));
        $status = sanitize_key((string) ($data['status'] ?? 'active'));

        $clean = [
            'name' => sanitize_text_field((string) ($data['name'] ?? '')),
            'provider_type' => $type,
            'sender_name' => sanitize_text_field((string) ($data['sender_name'] ?? '')),
            'sender_email' => sanitize_email((string) ($data['sender_email'] ?? '')),
            'reply_to' => !empty($data['reply_to']) ? sanitize_email((string) $data['reply_to']) : '',
            'region' => sanitize_text_field((string) ($data['region'] ?? '')),
            'credentials' => $this->sanitizeCredentials($type, $data['credentials'] ?? [], $existing),
            'settings' => $this->sanitizeSettings($type, $data['settings'] ?? [], $existing_settings),
            'status' => in_array($status, ['active', 'inactive'], true) ? $status : 'active',
        ];

        if (isset($data['is_default'])) {
            $clean['is_default'] = (bool) $data['is_default'];
        }

        return $clean;
    }

    /**
     * Sanitize the per-provider option flags (force_from_name / force_from_email
     * / return_path / smtp_auto_tls). Only the flags a provider type actually
     * supports are kept.
     *
     * @param mixed $raw
     * @param array<string, mixed> $existing Existing stored settings (to preserve
     *                                       admin-managed keys not sent in the payload).
     * @return array<string, mixed>
     */
    private function sanitizeSettings(string $type, $raw, array $existing = []): array
    {
        $raw = is_array($raw) ? $raw : [];

        $flag = function (string $key, string $default) use ($raw): string {
            $value = isset($raw[$key]) ? (string) $raw[$key] : $default;
            return in_array($value, ['yes', 'no'], true) ? $value : $default;
        };

        $settings = [
            'force_from_name' => $flag('force_from_name', 'no'),
        ];

        // Manual sender emails are managed by the dedicated senders endpoints,
        // never by the connection form — carry them forward untouched so a
        // provider edit doesn't wipe them.
        $manual = $existing['manual_senders'] ?? [];
        if (is_array($manual) && $manual !== []) {
            $settings['manual_senders'] = array_values(array_map('strval', $manual));
        }

        if (in_array($type, ['smtp', 'ses'], true)) {
            $settings['force_from_email'] = $flag('force_from_email', 'yes');
        }
        if (in_array($type, ['smtp', 'ses', 'mailgun'], true)) {
            $settings['return_path'] = $flag('return_path', 'yes');
        }
        if ($type === 'smtp') {
            $settings['smtp_auto_tls'] = $flag('smtp_auto_tls', 'yes');
        }

        return $settings;
    }

    /**
     * Ensure the provider-specific credentials required to send are present.
     *
     * @param array<string, mixed> $credentials Resolved credentials (sentinels already carried forward).
     * @return true|\WP_Error
     */
    private function validateCredentials(string $type, array $credentials): bool|\WP_Error
    {
        $missing = [];
        switch ($type) {
            case 'smtp':
                if (empty($credentials['smtp_host'])) {
                    $missing[] = __('SMTP host', 'kelune-crm');
                }
                break;
            case 'ses':
                if (empty($credentials['ses_access_key_id'])) {
                    $missing[] = __('Access Key ID', 'kelune-crm');
                }
                if (empty($credentials['ses_secret_access_key'])) {
                    $missing[] = __('Secret Access Key', 'kelune-crm');
                }
                break;
            case 'mailgun':
                if (empty($credentials['mailgun_api_key'])) {
                    $missing[] = __('API key', 'kelune-crm');
                }
                if (empty($credentials['mailgun_domain'])) {
                    $missing[] = __('Domain', 'kelune-crm');
                }
                break;
            case 'sendgrid':
                if (empty($credentials['sendgrid_api_key'])) {
                    $missing[] = __('API key', 'kelune-crm');
                }
                break;
        }

        if ($missing !== []) {
            return $this->errorResponse(
                /* translators: %s: comma-separated list of missing credential fields */
                sprintf(__('Missing required credentials: %s', 'kelune-crm'), implode(', ', $missing)),
                'validation_failed',
                400
            );
        }

        return true;
    }

    /**
     * Sanitize provider-specific credentials, preserving unchanged secrets.
     *
     * @param mixed $raw
     * @param array<string, mixed> $existing
     * @return array<string, mixed>
     */
    private function sanitizeCredentials(string $type, $raw, array $existing): array
    {
        $raw = is_array($raw) ? $raw : [];

        // Carry forward any secret submitted as the unchanged-sentinel.
        $secretValue = function (string $key) use ($raw, $existing): string {
            $value = $raw[$key] ?? '';
            if ($value === '' || $value === self::SECRET_MASK) {
                return (string) ($existing[$key] ?? '');
            }
            return trim(sanitize_text_field((string) $value));
        };

        switch ($type) {
            case 'smtp':
                $encryption = sanitize_key((string) ($raw['smtp_encryption'] ?? 'tls'));
                return [
                    'smtp_host' => sanitize_text_field((string) ($raw['smtp_host'] ?? '')),
                    'smtp_port' => absint($raw['smtp_port'] ?? 587),
                    'smtp_username' => sanitize_text_field((string) ($raw['smtp_username'] ?? '')),
                    'smtp_password' => $secretValue('smtp_password'),
                    'smtp_encryption' => in_array($encryption, ['none', 'ssl', 'tls'], true) ? $encryption : 'tls',
                ];
            case 'ses':
                return [
                    'ses_access_key_id' => trim(sanitize_text_field((string) ($raw['ses_access_key_id'] ?? ''))),
                    'ses_secret_access_key' => $secretValue('ses_secret_access_key'),
                ];
            case 'mailgun':
                return [
                    'mailgun_api_key' => $secretValue('mailgun_api_key'),
                    'mailgun_domain' => sanitize_text_field((string) ($raw['mailgun_domain'] ?? '')),
                ];
            case 'sendgrid':
                return [
                    'sendgrid_api_key' => $secretValue('sendgrid_api_key'),
                ];
            default:
                return [];
        }
    }

    /**
     * Build the [type, providerConfig] pair to test, from either a saved id or
     * an inline config. Secrets sent as the sentinel are pulled from storage.
     *
     * @param array<string, mixed> $data
     * @return array{0: string, 1: array<string, mixed>}|\WP_Error
     */
    private function buildTestConfig(array $data): array|\WP_Error
    {
        // Test a saved provider by id.
        if (!empty($data['id'])) {
            $provider = $this->repository->find((int) $data['id']);
            if (!$provider) {
                return $this->errorResponse(__('Email provider not found', 'kelune-crm'), 'not_found', 404);
            }

            // Merge any inline credential edits over the stored ones so a test
            // before saving reflects what the user just typed.
            $merged = $provider->credentials;
            if (!empty($data['credentials']) && is_array($data['credentials'])) {
                $merged = $this->sanitizeCredentials($provider->provider_type, $data['credentials'], $provider->credentials);
            }

            $model = new EmailProvider([
                'provider_type' => $provider->provider_type,
                'sender_email' => $data['sender_email'] ?? $provider->sender_email,
                'sender_name' => $data['sender_name'] ?? $provider->sender_name,
                'region' => $data['region'] ?? $provider->region,
                'credentials' => $merged,
            ]);

            return [$provider->provider_type, $model->toProviderConfig()];
        }

        // Test an unsaved inline config.
        $type = sanitize_key((string) ($data['provider_type'] ?? ''));
        if (!$this->factory->isValidType($type)) {
            return $this->errorResponse(__('A valid provider type is required', 'kelune-crm'), 'invalid_type', 400);
        }

        $model = new EmailProvider([
            'provider_type' => $type,
            'sender_email' => sanitize_email((string) ($data['sender_email'] ?? '')),
            'sender_name' => sanitize_text_field((string) ($data['sender_name'] ?? '')),
            'region' => sanitize_text_field((string) ($data['region'] ?? '')),
            'credentials' => $this->sanitizeCredentials($type, $data['credentials'] ?? [], []),
        ]);

        return [$type, $model->toProviderConfig()];
    }

    /**
     * Rate-limit connection tests: 5 per user per minute.
     */
    private function checkRateLimitForTest(): bool|\WP_Error
    {
        $key = 'kelune_crm_provider_test_limit_' . get_current_user_id();
        $count = (int) get_transient($key);

        if ($count >= 5) {
            return $this->errorResponse(
                __('Too many test attempts. Please wait a minute and try again.', 'kelune-crm'),
                'too_many_requests',
                429
            );
        }

        set_transient($key, $count + 1, 60);

        return true;
    }
}
