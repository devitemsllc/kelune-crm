<?php

declare(strict_types=1);

namespace KeluneCRM\Api;

use KeluneCRM\Api\Controllers\AnalyticsController;
use KeluneCRM\Api\Controllers\AutomationsController;
use KeluneCRM\Api\Controllers\AutomationTemplatesController;
use KeluneCRM\Api\Controllers\BounceConfigController;
use KeluneCRM\Api\Controllers\CampaignsController;
use KeluneCRM\Api\Controllers\CampaignTrackingController;
use KeluneCRM\Api\Controllers\ContactsController;
use KeluneCRM\Api\Controllers\CustomFieldsController;
use KeluneCRM\Api\Controllers\EmailLogsController;
use KeluneCRM\Api\Controllers\EmailProviderController;
use KeluneCRM\Api\Controllers\EmailTemplatesController;
use KeluneCRM\Api\Controllers\ListsController;
use KeluneCRM\Api\Controllers\OptinController;
use KeluneCRM\Api\Controllers\RolesController;
use KeluneCRM\Api\Controllers\SettingsController;
use KeluneCRM\Api\Controllers\TagsController;
use KeluneCRM\Api\Controllers\ToolsController;
use KeluneCRM\Api\Controllers\TrackingController;
use KeluneCRM\Controllers\WebhookController;
use KeluneCRM\Handlers\BounceHandler;
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
            'roles' => new RolesController(),
            'lists' => new ListsController(),
            'tags' => new TagsController(),
            'custom_fields' => new CustomFieldsController(),
            'email_templates' => new EmailTemplatesController(),
            'email_logs' => new EmailLogsController(),
            'email_providers' => new EmailProviderController(),
            'bounce_config' => new BounceConfigController(),
            'tracking' => new TrackingController(),
            'tools' => new ToolsController(),
            'optin' => new OptinController(),
            'webhooks' => new WebhookController(),
            'webhook_handler' => new WebhookHandler(),
            'bounce_handler' => new BounceHandler(),
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
    }
}
