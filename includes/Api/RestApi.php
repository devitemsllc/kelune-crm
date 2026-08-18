<?php

declare(strict_types=1);

namespace KeluneCRM\Api;

use KeluneCRM\Api\Controllers\AnalyticsController;
use KeluneCRM\Api\Controllers\AutomationsController;
use KeluneCRM\Api\Controllers\AutomationTemplatesController;
use KeluneCRM\Api\Controllers\CampaignsController;
use KeluneCRM\Api\Controllers\CampaignTrackingController;
use KeluneCRM\Api\Controllers\ContactsController;
use KeluneCRM\Api\Controllers\CustomFieldsController;
use KeluneCRM\Api\Controllers\EmailLogsController;
use KeluneCRM\Api\Controllers\EmailProviderController;
use KeluneCRM\Api\Controllers\EmailTemplatesController;
use KeluneCRM\Api\Controllers\ListsController;
use KeluneCRM\Api\Controllers\OptinController;
use KeluneCRM\Api\Controllers\SettingsController;
use KeluneCRM\Api\Controllers\TagsController;
use KeluneCRM\Api\Controllers\ToolsController;
use KeluneCRM\Api\Controllers\TrackingController;
use KeluneCRM\Controllers\WebhookController;
use KeluneCRM\Handlers\WebhookHandler;

class RestApi
{
    private string $namespace = 'kelune-crm/v1';

    /** @var array<string, object> */
    private array $controllers = [];

    public function register(): void
    {
        $this->initControllers();
        $this->registerRoutes();
    }

    private function initControllers(): void
    {
        // Core (Free) controllers. Pro-only controllers are appended by the Pro
        // add-on via the `kelune_crm_rest_controllers` filter; when Pro is
        // inactive those routes are absent and the dashboard shows an upgrade
        // teaser for the corresponding pages.
        $controllers = [
            'contacts' => new ContactsController(),
            'campaigns' => new CampaignsController(),
            'campaign_tracking' => new CampaignTrackingController(),
            'automations' => new AutomationsController(),
            'automation_templates' => new AutomationTemplatesController(),
            'analytics' => new AnalyticsController(),
            'settings' => new SettingsController(),
            'lists' => new ListsController(),
            'tags' => new TagsController(),
            'custom_fields' => new CustomFieldsController(),
            'email_templates' => new EmailTemplatesController(),
            'email_logs' => new EmailLogsController(),
            'email_providers' => new EmailProviderController(),
            'tracking' => new TrackingController(),
            'tools' => new ToolsController(),
            'optin' => new OptinController(),
            'webhooks' => new WebhookController(),
            'webhook_handler' => new WebhookHandler(),
        ];

        /**
         * Filter the REST controllers before their routes are registered.
         *
         * Each value is a controller object exposing `registerRoutes(string $namespace)`.
         * The Pro add-on appends its controllers (Segments, SmartLinks) here.
         *
         * @param array<string, object> $controllers Map of key => controller instance.
         */
        $this->controllers = apply_filters('kelune_crm_rest_controllers', $controllers);
    }

    private function registerRoutes(): void
    {
        foreach ($this->controllers as $controller) {
            if (method_exists($controller, 'registerRoutes')) {
                $controller->registerRoutes($this->namespace);
            }
        }

        $this->registerUtilityRoutes();
    }

    private function registerUtilityRoutes(): void
    {
        register_rest_route($this->namespace, '/import', [
            'methods' => 'POST',
            'callback' => [$this, 'handleImport'],
            'permission_callback' => [$this, 'checkPermission'],
        ]);

        register_rest_route($this->namespace, '/export', [
            'methods' => 'POST',
            'callback' => [$this, 'handleExport'],
            'permission_callback' => [$this, 'checkPermission'],
        ]);

        register_rest_route($this->namespace, '/batch', [
            'methods' => 'POST',
            'callback' => [$this, 'handleBatch'],
            'permission_callback' => [$this, 'checkPermission'],
        ]);
    }

    public function handleImport(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $type = $request->get_param('type');
        $data = $request->get_param('data');
        $options = $request->get_param('options') ?? [];

        switch ($type) {
            case 'contacts':
                return $this->importContacts($data, $options);
            case 'campaigns':
                return $this->importCampaigns($data, $options);
            default:
                return new \WP_Error('invalid_type', __('Invalid import type', 'kelune-crm'), ['status' => 400]);
        }
    }

    public function handleExport(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $type = $request->get_param('type');
        $filters = $request->get_param('filters') ?? [];
        $format = $request->get_param('format') ?? 'csv';

        switch ($type) {
            case 'contacts':
                return $this->exportContacts($filters, $format);
            case 'campaigns':
                return $this->exportCampaigns($filters, $format);
            default:
                return new \WP_Error('invalid_type', __('Invalid export type', 'kelune-crm'), ['status' => 400]);
        }
    }

    public function handleBatch(\WP_REST_Request $request): \WP_REST_Response
    {
        $operations = $request->get_param('operations');
        $results = [];

        foreach ($operations as $operation) {
            $method = $operation['method'] ?? 'GET';
            $endpoint = $operation['endpoint'];
            $data = $operation['data'] ?? [];

            $internal_request = new \WP_REST_Request($method);
            $internal_request->set_route($this->namespace . '/' . $endpoint);
            $internal_request->set_body_params($data);

            $response = rest_do_request($internal_request);
            $results[] = [
                'id' => $operation['id'] ?? null,
                'status' => $response->get_status(),
                'data' => $response->get_data(),
            ];
        }

        return rest_ensure_response([
            'results' => $results,
            'success' => count(array_filter($results, fn (array $r): bool => $r['status'] < 400)) === count($results),
        ]);
    }

    private function importContacts(mixed $data, mixed $options): \WP_REST_Response
    {
        return rest_ensure_response([
            'imported' => 0,
            'updated' => 0,
            'failed' => 0,
            'errors' => [],
        ]);
    }

    /** @param array<string, mixed> $filters */
    private function exportContacts($filters, string $format): \WP_REST_Response
    {
        return rest_ensure_response([
            'file_url' => '',
            'total' => 0,
        ]);
    }

    private function importCampaigns(mixed $data, mixed $options): \WP_REST_Response
    {
        return rest_ensure_response([
            'imported' => 0,
            'failed' => 0,
            'errors' => [],
        ]);
    }

    /** @param array<string, mixed> $filters */
    private function exportCampaigns($filters, string $format): \WP_REST_Response
    {
        return rest_ensure_response([
            'file_url' => '',
            'total' => 0,
        ]);
    }

    public function checkPermission(\WP_REST_Request $request): bool
    {
        $nonce = $request->get_header('X-WP-Nonce');
        if (!$nonce || !wp_verify_nonce($nonce, 'wp_rest')) {
            return false;
        }

        return current_user_can('manage_options');
    }
}
