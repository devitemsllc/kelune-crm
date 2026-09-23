<?php

declare(strict_types=1);

namespace KeluneCRM\Handlers;

use KeluneCRM\Core\Debug;
use KeluneCRM\Services\Bounce\BounceNormalizerInterface;
use KeluneCRM\Services\Bounce\MailgunNormalizer;
use KeluneCRM\Services\Bounce\SendGridNormalizer;
use KeluneCRM\Services\Bounce\SesNormalizer;
use KeluneCRM\Services\Bounce\SignatureVerifier;
use KeluneCRM\Services\BounceService;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Public receiver for provider bounce and complaint webhooks. The URL key proves
 * the caller saw the endpoint, the provider signature proves the payload. An
 * unrecognised event is answered 200: providers disable endpoints that error.
 */
class BounceHandler
{
    /** One endpoint key per provider, so rotating one console's URL leaves the others working. */
    public const KEYS_OPTION = 'kelune_crm_bounce_handler_keys';

    /** Site-wide key; seeds the per-provider map once. */
    public const KEY_OPTION = 'kelune_crm_bounce_handler_key';

    /** Matches the plugin's other public tokens (kelunecrmsl_, kelunecrmlt_, …). */
    public const KEY_PREFIX = 'kelunecrmbh_';

    /** Above the largest batch any provider posts (SendGrid flushes at 768 KB). */
    private const MAX_BODY_BYTES = 1048576;

    private BounceService $bounceService;
    private SignatureVerifier $verifier;

    public function __construct()
    {
        $this->bounceService = new BounceService();
        $this->verifier = new SignatureVerifier();
    }

    public function registerRoutes(string $namespace = 'kelune-crm/v1'): void
    {
        // Machine-to-machine, so no nonce.
        register_rest_route($namespace, '/bounce/(?P<provider>[a-z0-9_-]+)/(?P<key>[a-zA-Z0-9_-]+)', [
            'methods' => 'POST',
            'callback' => [$this, 'handle'],
            'permission_callback' => [$this, 'allowPublicAccess'],
        ]);
    }

    /** Authorization is the URL key, enforced in handle(). */
    public function allowPublicAccess(WP_REST_Request $request): bool
    {
        return true;
    }

    /** One provider's endpoint key, minted on first use. */
    public static function key(string $provider): string
    {
        $keys = self::keys();

        if (isset($keys[$provider]) && '' !== $keys[$provider]) {
            return $keys[$provider];
        }

        // A URL already pasted into a console must keep working.
        $legacy = get_option(self::KEY_OPTION, '');

        if (is_string($legacy) && '' !== $legacy) {
            $keys[$provider] = $legacy;
            update_option(self::KEYS_OPTION, $keys, false);

            return $legacy;
        }

        return self::regenerateKey($provider);
    }

    public static function regenerateKey(string $provider): string
    {
        $key = self::KEY_PREFIX . bin2hex(random_bytes(30));

        $keys = self::keys();
        $keys[$provider] = $key;

        update_option(self::KEYS_OPTION, $keys, false);

        return $key;
    }

    /**
     * @return array<string, string>
     */
    private static function keys(): array
    {
        $stored = get_option(self::KEYS_OPTION, []);

        if (!is_array($stored)) {
            return [];
        }

        $keys = [];

        foreach ($stored as $provider => $key) {
            if (is_string($provider) && is_string($key)) {
                $keys[$provider] = $key;
            }
        }

        return $keys;
    }

    public static function endpointUrl(string $provider): string
    {
        return rest_url(
            'kelune-crm/v1/bounce/' . rawurlencode($provider) . '/' . self::key($provider)
        );
    }

    /** @return \WP_Error|\WP_REST_Response */
    public function handle(WP_REST_Request $request)
    {
        $provider = sanitize_key((string) $request->get_param('provider'));
        $key = (string) $request->get_param('key');

        $normalizers = self::normalizers();

        // Before the key check: keys mint on first read, so an unknown slug must not reach key().
        if (!isset($normalizers[$provider])) {
            return new WP_Error(
                'unknown_provider',
                __('Unknown bounce provider.', 'kelune-crm'),
                ['status' => 404]
            );
        }

        if (!hash_equals(self::key($provider), $key)) {
            return new WP_Error(
                'invalid_key',
                __('Invalid bounce endpoint key.', 'kelune-crm'),
                ['status' => 403]
            );
        }

        // SNS posts text/plain, and the signature covers these exact bytes.
        $raw_body = $request->get_body();

        if (strlen($raw_body) > self::MAX_BODY_BYTES) {
            return new WP_Error(
                'payload_too_large',
                __('Bounce payload too large.', 'kelune-crm'),
                ['status' => 413]
            );
        }

        $payload = json_decode($raw_body, true);

        if (!is_array($payload)) {
            return $this->accepted(0);
        }

        $verified = $this->verifier->verify($provider, $raw_body, $payload, $request);

        if (false === $verified) {
            return new WP_Error(
                'invalid_signature',
                __('Bounce payload signature could not be verified.', 'kelune-crm'),
                ['status' => 403]
            );
        }

        if (null === $verified) {
            Debug::log('KeluneCRM bounce: unverified payload accepted for ' . $provider . ' (no signing secret configured).');
        }

        $events = $normalizers[$provider]->normalize($payload);

        return $this->accepted($this->bounceService->handleEvents($events, $provider));
    }

    /** @return list<string> */
    public static function supportedProviders(): array
    {
        return array_keys(self::normalizers());
    }

    /** @return array<string, BounceNormalizerInterface> */
    private static function normalizers(): array
    {
        $normalizers = [
            'ses' => new SesNormalizer(),
            'mailgun' => new MailgunNormalizer(),
            'sendgrid' => new SendGridNormalizer(),
        ];

        /**
         * Filters the bounce normalizers, keyed by provider slug. A new key is a new receiver route.
         *
         * @param array<string, BounceNormalizerInterface> $normalizers
         */
        return apply_filters('kelune_crm_bounce_normalizers', $normalizers);
    }

    private function accepted(int $handled): WP_REST_Response
    {
        return new WP_REST_Response(['success' => true, 'handled' => $handled], 200);
    }
}
