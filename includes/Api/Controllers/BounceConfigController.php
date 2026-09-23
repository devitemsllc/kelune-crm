<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Handlers\BounceHandler;
use KeluneCRM\Models\EmailProvider;
use KeluneCRM\Services\Bounce\SigningSecrets;
use KeluneCRM\Support\Capabilities;

/**
 * Receiver URL and signing secret per provider. Organised by provider, not by
 * connection: every supported provider is always described, and no email
 * connection is consulted.
 */
class BounceConfigController extends BaseController
{
    protected string $restBase = 'bounce-config';

    protected string $readCapability = Capabilities::MANAGE_SETTINGS;

    protected string $writeCapability = Capabilities::MANAGE_SETTINGS;

    protected string $deleteCapability = Capabilities::MANAGE_SETTINGS;

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

        register_rest_route($namespace, '/' . $this->restBase, [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'getConfig'],
                'permission_callback' => [$this, 'checkPermission'],
            ],
        ]);

        register_rest_route(
            $namespace,
            '/' . $this->restBase . '/providers/(?P<provider>[a-z0-9_-]+)/regenerate',
            [
                [
                    'methods' => \WP_REST_Server::CREATABLE,
                    'callback' => [$this, 'regenerateKey'],
                    'permission_callback' => [$this, 'checkWritePermission'],
                    'args' => [
                        'provider' => [
                            'type' => 'string',
                            'required' => true,
                            'sanitize_callback' => 'sanitize_key',
                        ],
                    ],
                ],
            ]
        );

        register_rest_route($namespace, '/' . $this->restBase . '/providers/(?P<provider>[a-z0-9_-]+)', [
            [
                'methods' => \WP_REST_Server::EDITABLE,
                'callback' => [$this, 'updateProvider'],
                'permission_callback' => [$this, 'checkWritePermission'],
                'args' => [
                    'provider' => [
                        'type' => 'string',
                        'required' => true,
                        'sanitize_callback' => 'sanitize_key',
                    ],
                ],
            ],
        ]);
    }

    public function getConfig(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        return $this->successResponse($this->config());
    }

    public function regenerateKey(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $provider = sanitize_key((string) $request->get_param('provider'));

        if (!in_array($provider, BounceHandler::supportedProviders(), true)) {
            return $this->errorResponse(
                __('Unknown bounce provider.', 'kelune-crm'),
                'unknown_provider',
                404
            );
        }

        BounceHandler::regenerateKey($provider);

        return $this->successResponse(
            $this->config(),
            __('Receiver URL regenerated.', 'kelune-crm')
        );
    }

    /** An empty submission is a no-op, never a clear; clearing is the explicit `clear` flag. */
    public function updateProvider(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $provider = sanitize_key((string) $request->get_param('provider'));

        if (!SigningSecrets::usesSecret($provider)) {
            return $this->errorResponse(
                __('This provider does not use a webhook signing secret.', 'kelune-crm'),
                'unsupported_provider',
                400
            );
        }

        $submitted = $request->get_param('signing_secret');
        $submitted = is_string($submitted) ? $submitted : '';
        $clear = (bool) $request->get_param('clear');

        if ($clear) {
            SigningSecrets::set($provider, '');

            return $this->successResponse(
                $this->config(),
                __('Signing secret removed.', 'kelune-crm')
            );
        }

        if ('' === $submitted || EmailProvider::SECRET_MASK === $submitted) {
            return $this->successResponse($this->config());
        }

        // No provider issues a key containing a control character.
        $secret = trim((string) preg_replace('/[\x00-\x1F\x7F]/', '', $submitted));

        if (!SigningSecrets::set($provider, $secret)) {
            return $this->errorResponse(
                __('Failed to save the signing secret', 'kelune-crm'),
                'update_failed',
                500
            );
        }

        return $this->successResponse(
            $this->config(),
            __('Signing secret saved.', 'kelune-crm')
        );
    }

    /** @return array<string, mixed> */
    private function config(): array
    {
        $providers = [];

        foreach (BounceHandler::supportedProviders() as $slug) {
            $providers[] = [
                'provider' => $slug,
                'has_feed' => true,
                'endpoint_url' => BounceHandler::endpointUrl($slug),
                'uses_signing_secret' => SigningSecrets::usesSecret($slug),
                'has_signing_secret' => '' !== SigningSecrets::get($slug),
            ];
        }

        // SMTP has no feed; described so the tab explains why no URL is offered.
        $providers[] = [
            'provider' => 'smtp',
            'has_feed' => false,
            'endpoint_url' => '',
            'uses_signing_secret' => false,
            'has_signing_secret' => false,
        ];

        return ['providers' => $providers];
    }
}
