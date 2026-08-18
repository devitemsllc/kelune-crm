<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Services\CronMonitorService;

/**
 * Diagnostic endpoints behind Settings → Cron Monitor.
 */
class ToolsController extends BaseController
{
    protected string $restBase = 'tools';

    private CronMonitorService $cronMonitor;

    public function __construct()
    {
        $this->cronMonitor = new CronMonitorService();
    }

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

        register_rest_route($namespace, '/' . $this->restBase . '/cron-status', [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'getCronStatus'],
                'permission_callback' => [$this, 'checkPermission'],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/run-cron', [
            [
                'methods' => \WP_REST_Server::CREATABLE,
                'callback' => [$this, 'runCron'],
                'permission_callback' => [$this, 'checkPermission'],
                'args' => [
                    'hook' => [
                        'type' => 'string',
                        'required' => true,
                        'sanitize_callback' => 'sanitize_key',
                    ],
                ],
            ],
        ]);
    }

    public function getCronStatus(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        return $this->successResponse([
            'events' => $this->cronMonitor->getEvents(),
            'server' => $this->cronMonitor->getServerInfo(),
        ]);
    }

    public function runCron(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $hook = (string) $request->get_param('hook');

        $result = $this->cronMonitor->runEvent($hook);

        if (is_wp_error($result)) {
            return $result;
        }

        // A manual run fires the hook now but does not touch the schedule, so
        // "Next Run" (and any Overdue tag) is unchanged by design.
        return $this->successResponse(
            [
                'events' => $this->cronMonitor->getEvents(),
                'server' => $this->cronMonitor->getServerInfo(),
            ],
            __('Task ran successfully.', 'kelune-crm')
        );
    }
}
