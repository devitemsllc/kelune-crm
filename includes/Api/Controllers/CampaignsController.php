<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Repositories\CampaignRepository;
use KeluneCRM\Services\EmailService;

class CampaignsController extends BaseController
{
    protected string $restBase = 'campaigns';
    private \KeluneCRM\Repositories\CampaignRepository $repository;
    private \KeluneCRM\Services\EmailService $emailService;

    public function __construct()
    {
        $this->repository = new CampaignRepository();
        $this->emailService = new EmailService();
    }

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

        register_rest_route($namespace, '/' . $this->restBase, [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'getItems'],
                'permission_callback' => [$this, 'checkReadPermission'],
                'args' => [
                    'page' => [
                        'default' => 1,
                        'validate_callback' => function ($param): bool {
                            return is_numeric($param);
                        },
                    ],
                    'per_page' => [
                        'default' => 20,
                        'validate_callback' => function ($param): bool {
                            return is_numeric($param);
                        },
                    ],
                    'search' => [
                        'default' => '',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'status' => [
                        'default' => '',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'campaign_type' => [
                        'default' => '',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'orderby' => [
                        'default' => 'id',
                        'sanitize_callback' => 'sanitize_key',
                    ],
                    'order' => [
                        'default' => 'DESC',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                ],
            ],
            [
                'methods' => \WP_REST_Server::CREATABLE,
                'callback' => [$this, 'createItem'],
                'permission_callback' => [$this, 'checkWritePermission'],
            ],
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

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/duplicate', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'duplicateItem'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/send', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'sendCampaign'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/schedule', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'scheduleCampaign'],
            'permission_callback' => [$this, 'checkWritePermission'],
            'args' => [
                'scheduled_at' => [
                    'required' => true,
                    'sanitize_callback' => 'sanitize_text_field',
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/pause', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'pauseCampaign'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/resume', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'resumeCampaign'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/test', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'sendTest'],
            'permission_callback' => [$this, 'checkWritePermission'],
            'args' => [
                'email' => [
                    'required' => true,
                    'validate_callback' => function ($param) {
                        return is_email($param);
                    },
                    'sanitize_callback' => 'sanitize_email',
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/stats', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getStats'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/recipients/count', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getRecipientCount'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        // Detailed analytics breakdowns (geographic|device|browser|links)
        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/analytics/(?P<type>[a-z]+)', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getAnalytics'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/stats/summary', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getSummaryStats'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/templates', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getTemplates'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/templates/(?P<id>[a-zA-Z0-9_-]+)', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getTemplate'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/bulk', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'bulkAction'],
            'permission_callback' => [$this, 'checkWritePermission'],
            'args' => [
                'action' => [
                    'required' => true,
                    'enum' => ['delete', 'pause', 'resume', 'duplicate'],
                ],
                'ids' => [
                    'required' => true,
                    'validate_callback' => function ($param): bool {
                        return is_array($param) && !empty($param);
                    },
                ],
            ],
        ]);
    }

    public function getItems(\WP_REST_Request $request): \WP_REST_Response
    {
        $params = [
            'page' => $request->get_param('page'),
            'per_page' => $request->get_param('per_page'),
            'search' => $request->get_param('search'),
            'status' => $request->get_param('status'),
            'campaign_type' => $request->get_param('campaign_type'),
            'orderby' => $request->get_param('orderby'),
            'order' => $request->get_param('order'),
        ];

        $campaigns = $this->repository->getAll($params);
        $total = $this->repository->getCount($params);

        return $this->successResponse([
            'data' => array_map(function ($campaign) {
                return $campaign->toArray();
            }, $campaigns),
            'total' => $total,
            'page' => $params['page'],
            'per_page' => $params['per_page'],
        ]);
    }

    public function getItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');
        $campaign = $this->repository->find($id);

        if (!$campaign) {
            return $this->errorResponse(__('Campaign not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($campaign->toArray());
    }

    public function createItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $data = $request->get_json_params();

        if (empty($data['name'])) {
            return $this->errorResponse(__('Campaign name is required', 'kelune-crm'), 'missing_field', 400);
        }

        $data = $this->sanitizeCampaignData($data);

        if (!empty($data['from_email']) && !is_email($data['from_email'])) {
            return $this->errorResponse(__('A valid From email address is required', 'kelune-crm'), 'invalid_email', 400);
        }

        $campaign_id = $this->repository->create($data);

        if (!$campaign_id) {
            return $this->errorResponse(__('Failed to create campaign', 'kelune-crm'), 'create_failed', 500);
        }

        $campaign = $this->repository->find($campaign_id);

        if (!$campaign) {
            return $this->errorResponse(__('Campaign not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($campaign->toArray(), __('Campaign created successfully', 'kelune-crm'));
    }

    public function updateItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');
        $data = $request->get_json_params();

        $campaign = $this->repository->find($id);

        if (!$campaign) {
            return $this->errorResponse(__('Campaign not found', 'kelune-crm'), 'not_found', 404);
        }

        $data = $this->sanitizeCampaignData($data);

        if (!empty($data['from_email']) && !is_email($data['from_email'])) {
            return $this->errorResponse(__('A valid From email address is required', 'kelune-crm'), 'invalid_email', 400);
        }

        $result = $this->repository->update($id, $data);

        if (!$result) {
            return $this->errorResponse(__('Failed to update campaign', 'kelune-crm'), 'update_failed', 500);
        }

        $updated_campaign = $this->repository->find($id);

        if (!$updated_campaign) {
            return $this->errorResponse(__('Campaign not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($updated_campaign->toArray(), __('Campaign updated successfully', 'kelune-crm'));
    }

    public function deleteItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');

        $campaign = $this->repository->find($id);

        if (!$campaign) {
            return $this->errorResponse(__('Campaign not found', 'kelune-crm'), 'not_found', 404);
        }

        $result = $this->repository->delete($id);

        if (!$result) {
            return $this->errorResponse(__('Failed to delete campaign', 'kelune-crm'), 'delete_failed', 500);
        }

        return $this->successResponse([], __('Campaign deleted successfully', 'kelune-crm'));
    }

    public function duplicateItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');

        $new_id = $this->repository->duplicate($id);

        if (!$new_id) {
            return $this->errorResponse(__('Failed to duplicate campaign', 'kelune-crm'), 'duplicate_failed', 500);
        }

        $campaign = $this->repository->find($new_id);

        if (!$campaign) {
            return $this->errorResponse(__('Campaign not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($campaign->toArray(), __('Campaign duplicated successfully', 'kelune-crm'));
    }

    public function sendCampaign(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = (int) $request->get_param('id');

        $campaign = $this->repository->find($id);

        if (!$campaign) {
            return $this->errorResponse(__('Campaign not found', 'kelune-crm'), 'not_found', 404);
        }

        if (!$campaign->isDraft() && !$campaign->isScheduled()) {
            return $this->errorResponse(__('Only draft or scheduled campaigns can be sent', 'kelune-crm'), 'invalid_status', 400);
        }

        $queued = $this->emailService->queueCampaign($id);

        if (is_wp_error($queued)) {
            return $queued;
        }

        // Begin sending immediately via the loopback rather than waiting for the
        // queue's cron minute.
        \KeluneCRM\Services\QueueRunner::kick('campaign_queue');

        return $this->successResponse([
            'queued' => $queued,
        ], __('Campaign queued for sending', 'kelune-crm'));
    }

    public function scheduleCampaign(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');
        $scheduled_at = $request->get_param('scheduled_at');

        $campaign = $this->repository->find($id);

        if (!$campaign) {
            return $this->errorResponse(__('Campaign not found', 'kelune-crm'), 'not_found', 404);
        }

        $result = $this->repository->update($id, [
            'status' => 'scheduled',
            'scheduled_at' => $scheduled_at,
        ]);

        if (!$result) {
            return $this->errorResponse(__('Failed to schedule campaign', 'kelune-crm'), 'schedule_failed', 500);
        }

        return $this->successResponse([], __('Campaign scheduled successfully', 'kelune-crm'));
    }

    public function pauseCampaign(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');

        $campaign = $this->repository->find($id);

        if (!$campaign) {
            return $this->errorResponse(__('Campaign not found', 'kelune-crm'), 'not_found', 404);
        }

        if (!$campaign->isSending()) {
            return $this->errorResponse(__('Only sending campaigns can be paused', 'kelune-crm'), 'invalid_status', 400);
        }

        $result = $this->repository->update($id, [
            'status' => 'paused',
        ]);

        if (!$result) {
            return $this->errorResponse(__('Failed to pause campaign', 'kelune-crm'), 'pause_failed', 500);
        }

        return $this->successResponse([], __('Campaign paused successfully', 'kelune-crm'));
    }

    public function resumeCampaign(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');

        $campaign = $this->repository->find($id);

        if (!$campaign) {
            return $this->errorResponse(__('Campaign not found', 'kelune-crm'), 'not_found', 404);
        }

        if (!$campaign->isPaused()) {
            return $this->errorResponse(__('Only paused campaigns can be resumed', 'kelune-crm'), 'invalid_status', 400);
        }

        $result = $this->repository->update($id, [
            'status' => 'sending',
        ]);

        if (!$result) {
            return $this->errorResponse(__('Failed to resume campaign', 'kelune-crm'), 'resume_failed', 500);
        }

        return $this->successResponse([], __('Campaign resumed successfully', 'kelune-crm'));
    }

    public function sendTest(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');
        $email = $request->get_param('email');

        $result = $this->emailService->sendTestEmail($id, $email);

        if (is_wp_error($result)) {
            return $result;
        }

        return $this->successResponse([], __('Test email sent successfully', 'kelune-crm'));
    }

    /**
     * Sanitize raw campaign payload before it reaches the repository.
     *
     * Rebuilds the array from known keys rather than filtering the caller's —
     * seeding from `$data` would carry every unrecognised key straight through
     * to the repository. Anything not named here simply cannot be written.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function sanitizeCampaignData(array $data): array
    {
        $clean = [];

        $text_fields = ['name', 'subject', 'preview_text', 'from_name', 'campaign_type', 'status', 'scheduled_at', 'sent_at', 'ab_test_winner_metric'];
        foreach ($text_fields as $field) {
            if (isset($data[$field])) {
                $clean[$field] = sanitize_text_field((string) $data[$field]);
            }
        }

        // Multiline free text — keep newlines (sanitize_text_field would strip them).
        if (isset($data['description'])) {
            $clean['description'] = sanitize_textarea_field((string) $data['description']);
        }

        foreach (['from_email', 'reply_to'] as $field) {
            if (isset($data[$field]) && $data[$field] !== '') {
                $clean[$field] = sanitize_email((string) $data[$field]);
            }
        }

        if (isset($data['email_content'])) {
            $clean['email_content'] = wp_kses_post((string) $data['email_content']);
        }

        if (array_key_exists('email_provider_id', $data)) {
            $clean['email_provider_id'] = !empty($data['email_provider_id'])
                ? absint($data['email_provider_id'])
                : null;
        }

        // Which editor produced the content. Anything unexpected (incl. the
        // removed html/text modes) falls back to the Rich Text editor.
        if (isset($data['content_mode'])) {
            $mode = sanitize_key((string) $data['content_mode']);
            $clean['content_mode'] = in_array($mode, ['builder', 'richtext'], true)
                ? $mode
                : 'richtext';
        }

        // The visual builder's block tree. Accept either a JSON string or an
        // already-decoded array; store a normalized JSON string (or null when
        // empty/invalid). This is editor state rather than the sent body — that
        // is always the wp_kses_post'd email_content above — but it is rendered
        // back into the admin editor, so its leaves are kses'd too.
        if (isset($data['json_structure'])) {
            $structure = $data['json_structure'];
            if (is_string($structure) && $structure !== '') {
                $decoded = json_decode($structure, true);
                $structure = is_array($decoded) ? $decoded : null;
            }
            $clean['json_structure'] = is_array($structure)
                ? wp_json_encode($this->sanitizeStructure($structure))
                : null;
        }

        if (isset($data['template_id'])) {
            $clean['template_id'] = $data['template_id'] !== ''
                ? absint($data['template_id'])
                : null;
        }

        foreach (['target_segments', 'target_lists', 'target_tags', 'exclude_segments', 'exclude_lists', 'exclude_tags'] as $field) {
            if (isset($data[$field]) && is_array($data[$field])) {
                $clean[$field] = array_values(array_filter(array_map('absint', $data[$field])));
            }
        }

        // Per-campaign option flags. Free-form, so sanitized as a tree; `stats`
        // is deliberately NOT accepted — reporting is derived from real sends,
        // not from whatever the client claims.
        if (isset($data['settings']) && is_array($data['settings'])) {
            $clean['settings'] = $this->sanitizeStructure($data['settings']);
        }

        if (isset($data['ab_testing_enabled'])) {
            $clean['ab_testing_enabled'] = (int) (bool) $data['ab_testing_enabled'];
        }

        if (isset($clean['ab_test_winner_metric']) && !in_array($clean['ab_test_winner_metric'], ['open_rate', 'click_rate'], true)) {
            $clean['ab_test_winner_metric'] = 'open_rate';
        }

        if (isset($data['ab_test_sample_size'])) {
            $clean['ab_test_sample_size'] = min(100, max(1, absint($data['ab_test_sample_size'])));
        }

        return $clean;
    }

    /**
     * Recursively sanitize a free-form tree (builder block structure, settings).
     *
     * The shape is open-ended — the visual builder invents its own block keys —
     * so this cannot be a flat whitelist. Every leaf string is reduced to
     * post-safe markup, which leaves colours, ids and URLs untouched while
     * stripping anything executable out of block content.
     *
     * @param array<int|string, mixed> $tree
     * @return array<int|string, mixed>
     */
    private function sanitizeStructure(array $tree): array
    {
        $clean = [];

        foreach ($tree as $key => $value) {
            $safe_key = is_int($key) ? $key : sanitize_text_field((string) $key);

            if (is_array($value)) {
                $clean[$safe_key] = $this->sanitizeStructure($value);
            } elseif (is_string($value)) {
                $clean[$safe_key] = wp_kses_post($value);
            } elseif (is_scalar($value) || $value === null) {
                $clean[$safe_key] = $value;
            }
        }

        return $clean;
    }

    public function getStats(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');

        $campaign = $this->repository->find($id);

        if (!$campaign) {
            return $this->errorResponse(__('Campaign not found', 'kelune-crm'), 'not_found', 404);
        }

        $stats = $this->repository->getStats($id);

        return $this->successResponse($stats);
    }

    public function getAnalytics(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = (int) $request->get_param('id');
        $type = (string) $request->get_param('type');

        $campaign = $this->repository->find($id);

        if (!$campaign) {
            return $this->errorResponse(__('Campaign not found', 'kelune-crm'), 'not_found', 404);
        }

        switch ($type) {
            case 'geographic':
                $data = $this->repository->getGeographicStats($id);
                break;
            case 'device':
                $data = $this->repository->getEngagementBreakdown($id, 'device_type');
                break;
            case 'browser':
                $data = $this->repository->getEngagementBreakdown($id, 'browser');
                break;
            case 'links':
                $data = $this->repository->getLinkStats($id);
                break;
            default:
                return $this->errorResponse(__('Unknown analytics type', 'kelune-crm'), 'invalid_type', 400);
        }

        return $this->successResponse($data);
    }

    public function getRecipientCount(\WP_REST_Request $request): \WP_REST_Response
    {
        $id = $request->get_param('id');

        $count = $this->repository->calculateRecipientCount($id);

        return $this->successResponse([
            'count' => $count,
        ]);
    }

    public function getSummaryStats(\WP_REST_Request $request): \WP_REST_Response
    {
        $stats = $this->repository->getSummaryStats();

        return $this->successResponse($stats);
    }

    public function getTemplates(\WP_REST_Request $request): \WP_REST_Response
    {
        $templateService = new \KeluneCRM\Services\EmailTemplateService();
        $templates = $templateService->getTemplates();

        return $this->successResponse($templates);
    }

    public function getTemplate(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');
        $templateService = new \KeluneCRM\Services\EmailTemplateService();
        $template = $templateService->getTemplate($id);

        if (!$template) {
            return $this->errorResponse(__('Template not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($template);
    }

    public function bulkAction(\WP_REST_Request $request): \WP_REST_Response
    {
        $action = $request->get_param('action');
        $ids = $request->get_param('ids');

        $results = [
            'success' => [],
            'failed' => [],
        ];

        foreach ($ids as $id) {
            try {
                switch ($action) {
                    case 'delete':
                        $result = $this->repository->delete($id);
                        break;

                    case 'pause':
                        $campaign = $this->repository->find($id);
                        if ($campaign && $campaign->status === 'sending') {
                            $result = $this->repository->update($id, ['status' => 'paused']);
                        } else {
                            $result = false;
                        }
                        break;

                    case 'resume':
                        $campaign = $this->repository->find($id);
                        if ($campaign && $campaign->status === 'paused') {
                            $result = $this->repository->update($id, ['status' => 'sending']);
                        } else {
                            $result = false;
                        }
                        break;

                    case 'duplicate':
                        $result = $this->repository->duplicate($id);
                        break;

                    default:
                        $result = false;
                }

                if ($result !== false) {
                    $results['success'][] = $id;
                } else {
                    $results['failed'][] = $id;
                }
            } catch (\Exception $e) {
                $results['failed'][] = $id;
            }
        }

        return $this->successResponse([
            'results' => $results,
        ], sprintf(
            /* translators: 1: number of campaigns processed successfully, 2: number that failed. */
            __('%1$d campaigns processed successfully, %2$d failed', 'kelune-crm'),
            count($results['success']),
            count($results['failed'])
        ));
    }
}
