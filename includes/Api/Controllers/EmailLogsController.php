<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Repositories\EmailLogRepository;
use KeluneCRM\Services\EmailLogService;
use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use WP_REST_Server;

/**
 * REST API endpoints for email logs.
 */
class EmailLogsController extends BaseController
{
    protected string $restBase = 'email-logs';

    private \KeluneCRM\Repositories\EmailLogRepository $repository;
    private \KeluneCRM\Services\EmailLogService $service;

    public function __construct()
    {
        $this->repository = new EmailLogRepository();
        $this->service = new EmailLogService();
    }

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

        register_rest_route($namespace, '/' . $this->restBase, [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [$this, 'getItems'],
                'permission_callback' => [$this, 'checkReadPermission'],
                'args' => [
                    'page' => [
                        'default' => 1,
                        'sanitize_callback' => 'absint',
                    ],
                    'per_page' => [
                        'default' => 20,
                        'sanitize_callback' => 'absint',
                    ],
                    'search' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'email_type' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'status' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'provider' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'contact_id' => [
                        'sanitize_callback' => 'absint',
                    ],
                    'campaign_id' => [
                        'sanitize_callback' => 'absint',
                    ],
                    'automation_id' => [
                        'sanitize_callback' => 'absint',
                    ],
                    'date_from' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'date_to' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'orderby' => [
                        'default' => 'id',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'order' => [
                        'default' => 'desc',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [$this, 'getItem'],
                'permission_callback' => [$this, 'checkReadPermission'],
                'args' => [
                    'id' => [
                        'required' => true,
                        'sanitize_callback' => 'absint',
                    ],
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)', [
            [
                'methods' => WP_REST_Server::DELETABLE,
                'callback' => [$this, 'deleteItem'],
                'permission_callback' => [$this, 'checkDeletePermission'],
                'args' => [
                    'id' => [
                        'required' => true,
                        'sanitize_callback' => 'absint',
                    ],
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/bulk-delete', [
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [$this, 'bulkDelete'],
                'permission_callback' => [$this, 'checkDeletePermission'],
                'args' => [
                    'ids' => [
                        'required' => true,
                        'type' => 'array',
                        'items' => [
                            'type' => 'integer',
                        ],
                    ],
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/resend', [
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [$this, 'resendEmail'],
                'permission_callback' => [$this, 'checkWritePermission'],
                'args' => [
                    'id' => [
                        'required' => true,
                        'sanitize_callback' => 'absint',
                    ],
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/stats', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [$this, 'getStats'],
                'permission_callback' => [$this, 'checkReadPermission'],
                'args' => [
                    'date_from' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'date_to' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'email_type' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/export', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [$this, 'exportCSV'],
                'permission_callback' => [$this, 'checkReadPermission'],
                'args' => [
                    'search' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'email_type' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'status' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'provider' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'contact_id' => [
                        'sanitize_callback' => 'absint',
                    ],
                    'campaign_id' => [
                        'sanitize_callback' => 'absint',
                    ],
                    'automation_id' => [
                        'sanitize_callback' => 'absint',
                    ],
                    'date_from' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'date_to' => [
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                ],
            ],
        ]);
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function getItems(WP_REST_Request $request)
    {
        try {
            $page = $request->get_param('page') ?? 1;
            $per_page = min($request->get_param('per_page') ?? 20, 100);

            $params = [
                'page' => $page,
                'per_page' => $per_page,
                'orderby' => $request->get_param('orderby') ?? 'id',
                'order' => strtoupper($request->get_param('order') ?? 'DESC'),
            ];

            if ($search = $request->get_param('search')) {
                $params['search'] = $search;
            }

            if ($email_type = $request->get_param('email_type')) {
                $params['email_type'] = $email_type;
            }

            if ($status = $request->get_param('status')) {
                $params['status'] = $status;
            }

            if ($provider = $request->get_param('provider')) {
                $params['provider'] = $provider;
            }

            if ($contact_id = $request->get_param('contact_id')) {
                $params['contact_id'] = $contact_id;
            }

            if ($campaign_id = $request->get_param('campaign_id')) {
                $params['campaign_id'] = $campaign_id;
            }

            if ($automation_id = $request->get_param('automation_id')) {
                $params['automation_id'] = $automation_id;
            }

            if ($date_from = $request->get_param('date_from')) {
                $params['date_from'] = $date_from;
            }

            if ($date_to = $request->get_param('date_to')) {
                $params['date_to'] = $date_to;
            }

            $items = $this->repository->getAll($params);
            $total = $this->repository->getTotalCount($params);

            $items_array = array_map(function ($log) {
                return $log->toArray();
            }, $items);

            $response = [
                'items' => $items_array,
                'total' => $total,
                'page' => $page,
                'per_page' => $per_page,
                'total_pages' => ceil($total / $per_page),
            ];

            return $this->successResponse($response);

        } catch (\Exception $e) {
            return $this->errorResponse(
                sprintf(
                    /* translators: %s: underlying error message. */
                    __('Failed to fetch email logs: %s', 'kelune-crm'),
                    $e->getMessage()
                ),
                'fetch_failed',
                500
            );
        }
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function getItem(WP_REST_Request $request)
    {
        $id = $request->get_param('id');

        $log = $this->repository->find($id);

        if (!$log) {
            return $this->errorResponse(
                __('Email log not found', 'kelune-crm'),
                'not_found',
                404
            );
        }

        return $this->successResponse($log->toArray());
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function deleteItem(WP_REST_Request $request)
    {
        $id = $request->get_param('id');

        $log = $this->repository->find($id);

        if (!$log) {
            return $this->errorResponse(
                __('Email log not found', 'kelune-crm'),
                'not_found',
                404
            );
        }

        $deleted = $this->repository->delete($id);

        if (!$deleted) {
            return $this->errorResponse(
                __('Failed to delete email log', 'kelune-crm'),
                'delete_failed',
                500
            );
        }

        return $this->successResponse([], __('Email log deleted successfully', 'kelune-crm'));
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function bulkDelete(WP_REST_Request $request)
    {
        $ids = $request->get_param('ids');

        if (empty($ids) || !is_array($ids)) {
            return $this->errorResponse(
                __('Invalid IDs provided', 'kelune-crm'),
                'invalid_ids',
                400
            );
        }

        $ids = array_map('absint', $ids);
        $ids = array_filter($ids);

        if (empty($ids)) {
            return $this->errorResponse(
                __('No valid IDs provided', 'kelune-crm'),
                'no_valid_ids',
                400
            );
        }

        $deleted_count = $this->repository->bulkDelete($ids);

        return $this->successResponse(
            ['deleted_count' => $deleted_count],
            sprintf(
                /* translators: %d: number of email logs deleted. */
                _n(
                    '%d email log deleted successfully',
                    '%d email logs deleted successfully',
                    $deleted_count,
                    'kelune-crm'
                ),
                $deleted_count
            )
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function resendEmail(WP_REST_Request $request)
    {
        $id = $request->get_param('id');

        $log = $this->repository->find($id);

        if (!$log) {
            return $this->errorResponse(
                __('Email log not found', 'kelune-crm'),
                'not_found',
                404
            );
        }

        $result = $this->service->resendEmail($id);

        if (is_wp_error($result)) {
            return $this->errorResponse(
                $result->get_error_message(),
                'resend_failed',
                500
            );
        }

        return $this->successResponse(
            ['new_log_id' => $result],
            __('Email resent successfully', 'kelune-crm')
        );
    }

    /**
     * @return WP_REST_Response|WP_Error
     */
    public function getStats(WP_REST_Request $request)
    {
        try {
            // created_at is stored in UTC, so the default window is UTC days too.
            $date_to = $request->get_param('date_to') ?? gmdate('Y-m-d');
            $date_from = $request->get_param('date_from') ?? gmdate('Y-m-d', (int) strtotime('-30 days'));

            $email_type = $request->get_param('email_type');

            $stats = $this->repository->getStatsByDateRange($date_from, $date_to, $email_type);

            return $this->successResponse($stats);

        } catch (\Exception $e) {
            return $this->errorResponse(
                sprintf(
                    /* translators: %s: underlying error message. */
                    __('Failed to fetch statistics: %s', 'kelune-crm'),
                    $e->getMessage()
                ),
                'stats_failed',
                500
            );
        }
    }

    /**
     * Export email logs to CSV (streamed raw, then exits).
     */
    public function exportCSV(WP_REST_Request $request): void
    {
        try {
            // Order by id/DESC to match the list default — a created_at sort
            // scrambles rows whose timestamps tie (bulk sends share a second).
            $params = [
                'orderby' => 'id',
                'order' => 'DESC',
            ];

            if ($search = $request->get_param('search')) {
                $params['search'] = $search;
            }

            if ($email_type = $request->get_param('email_type')) {
                $params['email_type'] = $email_type;
            }

            if ($status = $request->get_param('status')) {
                $params['status'] = $status;
            }

            if ($provider = $request->get_param('provider')) {
                $params['provider'] = $provider;
            }

            if ($contact_id = $request->get_param('contact_id')) {
                $params['contact_id'] = $contact_id;
            }

            if ($campaign_id = $request->get_param('campaign_id')) {
                $params['campaign_id'] = $campaign_id;
            }

            if ($automation_id = $request->get_param('automation_id')) {
                $params['automation_id'] = $automation_id;
            }

            if ($date_from = $request->get_param('date_from')) {
                $params['date_from'] = $date_from;
            }

            if ($date_to = $request->get_param('date_to')) {
                $params['date_to'] = $date_to;
            }

            $logs = $this->repository->getAll($params);

            $csv_data = $this->generateCSV($logs);
            $filename = 'email-logs-' . gmdate('Y-m-d') . '-' . time() . '.csv';

            // Stream the CSV as a raw download. Returning it through the REST
            // response would JSON-encode the string (quoting the whole file and
            // escaping newlines), so we send it directly and stop execution.
            if (!headers_sent()) {
                header('Content-Type: text/csv; charset=utf-8');
                header('Content-Disposition: attachment; filename="' . $filename . '"');
                header('Content-Length: ' . strlen($csv_data));
            }

            // Raw CSV file body — not HTML, so output escaping does not apply.
            echo $csv_data; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
            exit;
        } catch (\Exception) {
            status_header(500);
            exit;
        }
    }

    /**
     * @param array<int, mixed> $logs
     */
    private function generateCSV(array $logs): string
    {
        // In-memory stream for building the CSV payload; WP_Filesystem has no
        // equivalent for php://temp, and no file touches the filesystem.
        $output = fopen('php://temp', 'r+'); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen

        if ($output === false) {
            return '';
        }

        fputcsv($output, [
            __('ID', 'kelune-crm'),
            __('Type', 'kelune-crm'),
            __('Campaign ID', 'kelune-crm'),
            __('Automation ID', 'kelune-crm'),
            __('Contact ID', 'kelune-crm'),
            __('To', 'kelune-crm'),
            __('From', 'kelune-crm'),
            __('Subject', 'kelune-crm'),
            __('Status', 'kelune-crm'),
            __('Provider', 'kelune-crm'),
            __('Tracking Token', 'kelune-crm'),
            __('Queued At', 'kelune-crm'),
            __('Sent At', 'kelune-crm'),
            __('Delivered At', 'kelune-crm'),
            __('Opened At', 'kelune-crm'),
            __('Clicked At', 'kelune-crm'),
            __('Bounced At', 'kelune-crm'),
            __('Open Count', 'kelune-crm'),
            __('Click Count', 'kelune-crm'),
            __('Error Message', 'kelune-crm'),
            __('Created At', 'kelune-crm'),
            __('Updated At', 'kelune-crm'),
        ]);

        // Write data. Free-text columns (recipient, sender, subject, error) can
        // originate from public input, so each is guarded against being executed
        // as a spreadsheet formula when the export is opened.
        foreach ($logs as $log) {
            fputcsv($output, [
                (int) $log->id,
                $this->escapeCsvCell((string) $log->email_type),
                $log->campaign_id ?? '',
                $log->automation_id ?? '',
                $log->contact_id ?? '',
                $this->escapeCsvCell((string) $log->email_to),
                $this->escapeCsvCell((string) ($log->email_from ?? '')),
                $this->escapeCsvCell((string) $log->subject),
                $this->escapeCsvCell((string) $log->status),
                $this->escapeCsvCell((string) ($log->provider ?? '')),
                $this->escapeCsvCell((string) ($log->tracking_token ?? '')),
                $log->queued_at ?? '',
                $log->sent_at ?? '',
                $log->delivered_at ?? '',
                $log->opened_at ?? '',
                $log->clicked_at ?? '',
                $log->bounced_at ?? '',
                (int) $log->open_count,
                (int) $log->click_count,
                $this->escapeCsvCell((string) ($log->error_message ?? '')),
                $log->created_at,
                $log->updated_at ?? '',
            ]);
        }

        rewind($output);
        $csv = stream_get_contents($output);
        fclose($output); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose

        return $csv === false ? '' : $csv;
    }
}
