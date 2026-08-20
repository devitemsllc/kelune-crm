<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Repositories\AutomationRepository;
use KeluneCRM\Repositories\AutomationStepRepository;
use KeluneCRM\Services\EmailService;

class AutomationsController extends BaseController
{
    protected string $restBase = 'automations';
    private \KeluneCRM\Repositories\AutomationRepository $repository;
    private \KeluneCRM\Repositories\AutomationStepRepository $stepRepository;
    private EmailService $emailService;

    public function __construct()
    {
        $this->repository = new AutomationRepository();
        $this->stepRepository = new AutomationStepRepository();
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
                    'trigger_type' => [
                        'default' => '',
                        'sanitize_callback' => 'sanitize_text_field',
                    ],
                    'orderby' => [
                        'default' => 'id',
                        'sanitize_callback' => 'sanitize_text_field',
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

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/activate', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'activateAutomation'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/pause', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'pauseAutomation'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/stats', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getStats'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/stats/summary', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getSummaryStats'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/enroll', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'enrollContact'],
            'permission_callback' => [$this, 'checkWritePermission'],
            'args' => [
                'contact_id' => [
                    'required' => true,
                    'validate_callback' => function ($param): bool {
                        return is_numeric($param);
                    },
                ],
                'context_data' => [
                    'default' => [],
                    'validate_callback' => function ($param): bool {
                        return is_array($param);
                    },
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/steps', [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'getSteps'],
                'permission_callback' => [$this, 'checkReadPermission'],
            ],
            [
                'methods' => \WP_REST_Server::CREATABLE,
                'callback' => [$this, 'createStep'],
                'permission_callback' => [$this, 'checkWritePermission'],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/steps/(?P<step_id>\d+)', [
            [
                'methods' => \WP_REST_Server::READABLE,
                'callback' => [$this, 'getStep'],
                'permission_callback' => [$this, 'checkReadPermission'],
            ],
            [
                'methods' => \WP_REST_Server::EDITABLE,
                'callback' => [$this, 'updateStep'],
                'permission_callback' => [$this, 'checkWritePermission'],
            ],
            [
                'methods' => \WP_REST_Server::DELETABLE,
                'callback' => [$this, 'deleteStep'],
                'permission_callback' => [$this, 'checkWritePermission'],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/steps/bulk', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'bulkCreateSteps'],
            'permission_callback' => [$this, 'checkWritePermission'],
            'args' => [
                'steps' => [
                    'required' => true,
                    'validate_callback' => function ($param): bool {
                        return is_array($param) && !empty($param);
                    },
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/steps/positions', [
            'methods' => \WP_REST_Server::EDITABLE,
            'callback' => [$this, 'updateStepPositions'],
            'permission_callback' => [$this, 'checkWritePermission'],
            'args' => [
                'positions' => [
                    'required' => true,
                    'validate_callback' => function ($param): bool {
                        return is_array($param);
                    },
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/steps/reorder', [
            'methods' => \WP_REST_Server::EDITABLE,
            'callback' => [$this, 'reorderSteps'],
            'permission_callback' => [$this, 'checkWritePermission'],
            'args' => [
                'orders' => [
                    'required' => true,
                    'validate_callback' => function ($param): bool {
                        return is_array($param);
                    },
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>\d+)/validate', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'validateSequence'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        // Send a test of a send_email step to a typed address, using the step's
        // live (possibly unsaved) config — the drawer's "Send Test" button.
        register_rest_route($namespace, '/' . $this->restBase . '/test-email', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'sendStepTest'],
            'permission_callback' => [$this, 'checkWritePermission'],
            'args' => [
                'email' => [
                    'required' => true,
                    'type' => 'string',
                    'sanitize_callback' => 'sanitize_email',
                ],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/bulk', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'bulkAction'],
            'permission_callback' => [$this, 'checkWritePermission'],
            'args' => [
                'action' => [
                    'required' => true,
                    // 'type' + 'validate_callback' are what make 'enum' bite:
                    // WP skips enum validation entirely for an arg with no
                    // validate_callback.
                    'type' => 'string',
                    'enum' => ['delete', 'activate', 'pause', 'duplicate'],
                    'validate_callback' => 'rest_validate_request_arg',
                    'sanitize_callback' => 'sanitize_key',
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

    /**
     * Send a test email for a send_email automation step. Stateless: the drawer
     * posts the step's current action_config so an unsaved step can be previewed.
     */
    public function sendStepTest(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $email = (string) $request->get_param('email');
        if (!is_email($email)) {
            return $this->errorResponse(__('A valid email address is required', 'kelune-crm'), 'invalid_email', 400);
        }

        $rawConfig = $request->get_param('action_config');
        $config = $this->sanitizeActionConfig('send_email', is_array($rawConfig) ? $rawConfig : []);

        if (($config['body'] ?? '') === '') {
            return $this->errorResponse(__('Add email content before sending a test.', 'kelune-crm'), 'missing_content', 400);
        }

        $result = $this->emailService->sendStepTestEmail($config, $email);
        if (is_wp_error($result)) {
            return $result;
        }

        return $this->successResponse([], __('Test email sent successfully', 'kelune-crm'));
    }

    public function getItems(\WP_REST_Request $request): \WP_REST_Response
    {
        $params = [
            'page' => $request->get_param('page'),
            'per_page' => $request->get_param('per_page'),
            'search' => $request->get_param('search'),
            'status' => $request->get_param('status'),
            'trigger_type' => $request->get_param('trigger_type'),
            'orderby' => $request->get_param('orderby'),
            'order' => $request->get_param('order'),
        ];

        $automations = $this->repository->getAll($params);
        $total = $this->repository->getCount($params);

        return $this->successResponse([
            'data' => array_map(function ($automation) {
                return $automation->toArray();
            }, $automations),
            'total' => $total,
            'page' => $params['page'],
            'per_page' => $params['per_page'],
        ]);
    }

    public function getItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');
        $automation = $this->repository->find($id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($automation->toArray());
    }

    public function createItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $data = $this->sanitizeAutomationData((array) $request->get_json_params());

        if (empty($data['name'])) {
            return $this->errorResponse(__('Automation name is required', 'kelune-crm'), 'missing_field', 400);
        }

        if (empty($data['trigger_type'])) {
            return $this->errorResponse(__('Trigger type is required', 'kelune-crm'), 'missing_field', 400);
        }

        $automation_id = $this->repository->create($data);

        if (!$automation_id) {
            return $this->errorResponse(__('Failed to create automation', 'kelune-crm'), 'create_failed', 500);
        }

        $automation = $this->repository->find($automation_id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($automation->toArray(), __('Automation created successfully', 'kelune-crm'));
    }

    public function updateItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');
        $data = $this->sanitizeAutomationData((array) $request->get_json_params());

        $automation = $this->repository->find($id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        $result = $this->repository->update($id, $data);

        if (!$result) {
            return $this->errorResponse(__('Failed to update automation', 'kelune-crm'), 'update_failed', 500);
        }

        $updated_automation = $this->repository->find($id);

        if (!$updated_automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($updated_automation->toArray(), __('Automation updated successfully', 'kelune-crm'));
    }

    public function deleteItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');

        $automation = $this->repository->find($id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        $result = $this->repository->delete($id);

        if (!$result) {
            return $this->errorResponse(__('Failed to delete automation', 'kelune-crm'), 'delete_failed', 500);
        }

        return $this->successResponse([], __('Automation deleted successfully', 'kelune-crm'));
    }

    public function duplicateItem(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');

        $new_id = $this->repository->duplicate($id);

        if (!$new_id) {
            return $this->errorResponse(__('Failed to duplicate automation', 'kelune-crm'), 'duplicate_failed', 500);
        }

        $automation = $this->repository->find($new_id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($automation->toArray(), __('Automation duplicated successfully', 'kelune-crm'));
    }

    public function activateAutomation(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');

        $automation = $this->repository->find($id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        $validation_errors = $this->stepRepository->validateSequence($id);

        if (!empty($validation_errors)) {
            return new \WP_Error('validation_failed', __('Automation has validation errors', 'kelune-crm'), [
                'status' => 400,
                'errors' => $validation_errors,
            ]);
        }

        $result = $this->repository->activate($id);

        if (!$result) {
            return $this->errorResponse(__('Failed to activate automation', 'kelune-crm'), 'activate_failed', 500);
        }

        return $this->successResponse([], __('Automation activated successfully', 'kelune-crm'));
    }

    public function pauseAutomation(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');

        $automation = $this->repository->find($id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        if (!$automation->isActive()) {
            return $this->errorResponse(__('Only active automations can be paused', 'kelune-crm'), 'invalid_status', 400);
        }

        $result = $this->repository->pause($id);

        if (!$result) {
            return $this->errorResponse(__('Failed to pause automation', 'kelune-crm'), 'pause_failed', 500);
        }

        return $this->successResponse([], __('Automation paused successfully', 'kelune-crm'));
    }

    public function getStats(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');

        $automation = $this->repository->find($id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        $stats = $this->repository->getStats($id);

        return $this->successResponse($stats);
    }

    public function getSummaryStats(\WP_REST_Request $request): \WP_REST_Response
    {
        $stats = $this->repository->getSummaryStats();

        return $this->successResponse($stats);
    }

    public function enrollContact(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $id = $request->get_param('id');
        $contact_id = absint($request->get_param('contact_id'));
        $context_data = $request->get_param('context_data');
        // Context data is stored and later merged into email merge tags, so it
        // is sanitized like any other free-form config tree.
        $context_data = is_array($context_data) ? $this->sanitizeContextData($context_data) : [];

        $automation = $this->repository->find($id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        if (!$automation->canEnroll()) {
            return $this->errorResponse(__('Automation is not active', 'kelune-crm'), 'cannot_enroll', 400);
        }

        $result = $this->repository->enrollContact($id, $contact_id, $context_data);

        if (!$result) {
            // Not a server fault: the contact is already enrolled, or the
            // automation's re-entry policy is holding them back — a conflict.
            return $this->errorResponse(__('Contact could not be enrolled (already enrolled or re-entry not yet allowed).', 'kelune-crm'), 'enroll_failed', 409);
        }

        return $this->successResponse([], __('Contact enrolled successfully', 'kelune-crm'));
    }

    public function getSteps(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $automation_id = $request->get_param('id');

        $automation = $this->repository->find($automation_id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        $steps = $this->stepRepository->getByAutomation($automation_id);

        return $this->successResponse([
            'data' => array_map(function ($step) {
                return $step->toArray();
            }, $steps),
        ]);
    }

    public function getStep(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $automation_id = $request->get_param('id');
        $step_id = $request->get_param('step_id');

        $step = $this->stepRepository->find($step_id);

        if (!$step || $step->automation_id != $automation_id) {
            return $this->errorResponse(__('Step not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($step->toArray());
    }

    public function createStep(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $automation_id = $request->get_param('id');
        $data = $this->sanitizeStepData((array) $request->get_json_params());

        $automation = $this->repository->find($automation_id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        $data['automation_id'] = $automation_id;
        $step_id = $this->stepRepository->create($data);

        if (!$step_id) {
            return $this->errorResponse(__('Failed to create step', 'kelune-crm'), 'create_failed', 500);
        }

        $step = $this->stepRepository->find($step_id);

        if (!$step) {
            return $this->errorResponse(__('Step not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($step->toArray(), __('Step created successfully', 'kelune-crm'));
    }

    public function updateStep(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $automation_id = $request->get_param('id');
        $step_id = $request->get_param('step_id');
        $data = $this->sanitizeStepData((array) $request->get_json_params());

        $automation = $this->repository->find($automation_id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        $step = $this->stepRepository->find($step_id);

        if (!$step || $step->automation_id != $automation_id) {
            return $this->errorResponse(__('Step not found', 'kelune-crm'), 'not_found', 404);
        }

        $result = $this->stepRepository->update($step_id, $data);

        if (!$result) {
            return $this->errorResponse(__('Failed to update step', 'kelune-crm'), 'update_failed', 500);
        }

        $updated_step = $this->stepRepository->find($step_id);

        if (!$updated_step) {
            return $this->errorResponse(__('Step not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($updated_step->toArray(), __('Step updated successfully', 'kelune-crm'));
    }

    public function deleteStep(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $automation_id = $request->get_param('id');
        $step_id = $request->get_param('step_id');

        $automation = $this->repository->find($automation_id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        $step = $this->stepRepository->find($step_id);

        if (!$step || $step->automation_id != $automation_id) {
            return $this->errorResponse(__('Step not found', 'kelune-crm'), 'not_found', 404);
        }

        if ($step->isTrigger()) {
            return $this->errorResponse(
                __('Cannot delete trigger step. Every automation must have a trigger. You can change the trigger type in settings.', 'kelune-crm'),
                'cannot_delete_trigger',
                400
            );
        }

        // delete() cascades to the branch below this step, so settle everyone
        // waiting anywhere in it before the rows go.
        $this->repository->releaseRemovedSteps(
            $automation_id,
            $this->stepRepository->getBranchIds($step_id)
        );

        $result = $this->stepRepository->delete($step_id);

        if (!$result) {
            return $this->errorResponse(__('Failed to delete step', 'kelune-crm'), 'delete_failed', 500);
        }

        return $this->successResponse([], __('Step deleted successfully', 'kelune-crm'));
    }

    public function bulkCreateSteps(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $automation_id = $request->get_param('id');
        $steps = $request->get_param('steps');

        $automation = $this->repository->find($automation_id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        // Each step carries the same untrusted shape as createStep, so it gets
        // the same rebuild — the bulk route is not a way around the sanitizer.
        $steps = array_map(
            fn ($step): array => $this->sanitizeStepData(is_array($step) ? $step : []),
            is_array($steps) ? $steps : []
        );

        $result = $this->stepRepository->syncSteps($automation_id, $steps);

        // Contacts parked on a deleted step are settled before the step rows
        // go, so a running automation can be edited without stranding anyone.
        $this->repository->releaseRemovedSteps($automation_id, $result['removed']);
        $this->stepRepository->deleteSteps($result['removed']);

        return $this->successResponse([
            'step_ids' => $result['ids'],
        ], __('Workflow saved successfully', 'kelune-crm'));
    }

    public function updateStepPositions(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $automation_id = $request->get_param('id');
        $positions = $request->get_param('positions');

        $automation = $this->repository->find($automation_id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        // Positions are pure geometry: an id and two integers, nothing else.
        $positions = array_values(array_filter(array_map(
            static function ($position): ?array {
                if (!is_array($position) || empty($position['id'])) {
                    return null;
                }

                return [
                    'id' => absint($position['id']),
                    'position_x' => absint($position['position_x'] ?? 0),
                    'position_y' => absint($position['position_y'] ?? 0),
                ];
            },
            is_array($positions) ? $positions : []
        )));

        $result = $this->stepRepository->bulkUpdatePositions($positions);

        if (!$result) {
            return $this->errorResponse(__('Failed to update positions', 'kelune-crm'), 'update_failed', 500);
        }

        return $this->successResponse([], __('Positions updated successfully', 'kelune-crm'));
    }

    public function reorderSteps(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $automation_id = $request->get_param('id');
        $orders = $request->get_param('orders');

        $automation = $this->repository->find($automation_id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        $result = $this->stepRepository->reorder($automation_id, $orders);

        if (!$result) {
            return $this->errorResponse(__('Failed to reorder steps', 'kelune-crm'), 'reorder_failed', 500);
        }

        return $this->successResponse([], __('Steps reordered successfully', 'kelune-crm'));
    }

    public function validateSequence(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $automation_id = $request->get_param('id');

        $automation = $this->repository->find($automation_id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        $errors = $this->stepRepository->validateSequence($automation_id);

        return $this->successResponse([
            'valid' => empty($errors),
            'errors' => $errors,
        ]);
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

                    case 'activate':
                        $validation_errors = $this->stepRepository->validateSequence($id);
                        if (empty($validation_errors)) {
                            $result = $this->repository->activate($id);
                        } else {
                            $result = false;
                        }
                        break;

                    case 'pause':
                        $automation = $this->repository->find($id);
                        if ($automation && $automation->isActive()) {
                            $result = $this->repository->pause($id);
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

        return $this->successResponse(
            [
                'results' => $results,
            ],
            sprintf(
                /* translators: %1$d: number of automations processed successfully, %2$d: number that failed */
                __('%1$d automations processed successfully, %2$d failed', 'kelune-crm'),
                count($results['success']),
                count($results['failed'])
            )
        );
    }

    /**
     * Sanitize an automation payload.
     *
     * Rebuilt from known keys, so anything not named here cannot reach the
     * database — notably `created_by` and the stats counters, which a caller
     * could otherwise use to spoof authorship or fabricate reporting numbers.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function sanitizeAutomationData(array $data): array
    {
        $clean = [];

        if (isset($data['name'])) {
            $clean['name'] = sanitize_text_field((string) $data['name']);
        }

        if (isset($data['description'])) {
            $clean['description'] = sanitize_textarea_field((string) $data['description']);
        }

        if (isset($data['trigger_type'])) {
            $clean['trigger_type'] = sanitize_key((string) $data['trigger_type']);
        }

        if (isset($data['trigger_config'])) {
            $clean['trigger_config'] = is_array($data['trigger_config'])
                ? $this->sanitizeConfigTree($data['trigger_config'])
                : [];
        }

        if (isset($data['entry_conditions'])) {
            $clean['entry_conditions'] = $this->sanitizeEntryConditions(
                is_array($data['entry_conditions']) ? $data['entry_conditions'] : []
            );
        }

        if (isset($data['status'])) {
            $status = sanitize_key((string) $data['status']);
            $clean['status'] = in_array($status, ['draft', 'active', 'paused'], true)
                ? $status
                : 'draft';
        }

        return $clean;
    }

    /**
     * Sanitize an automation's entry conditions.
     *
     * Rebuilt from two known keys so nothing else reaches the column. The
     * re-entry wait is stored three ways on purpose: amount+unit round-trip the
     * form control, `wait_days` is the value the enrolment gate enforces.
     *
     * @param array<int|string, mixed> $data
     * @return array<string, mixed>
     */
    private function sanitizeEntryConditions(array $data): array
    {
        $clean = [];

        $reentry = isset($data['reentry']) && is_array($data['reentry']) ? $data['reentry'] : [];

        $unit = isset($reentry['wait_unit']) ? sanitize_key((string) $reentry['wait_unit']) : 'days';
        if (!in_array($unit, ['minutes', 'hours', 'days', 'weeks'], true)) {
            $unit = 'days';
        }

        $clean['reentry'] = [
            'allow' => !empty($reentry['allow']),
            'wait_value' => isset($reentry['wait_value']) && '' !== $reentry['wait_value']
                ? max(0, absint($reentry['wait_value']))
                : null,
            'wait_unit' => $unit,
            'wait_days' => isset($reentry['wait_days']) ? max(0.0, (float) $reentry['wait_days']) : 0.0,
        ];

        $conditions = [];
        $rawConditions = isset($data['conditions']) && is_array($data['conditions']) ? $data['conditions'] : [];
        foreach ($rawConditions as $condition) {
            if (is_array($condition)) {
                $conditions[] = $this->sanitizeConditionConfig($condition);
            }
        }
        $clean['conditions'] = $conditions;

        return $clean;
    }

    /**
     * Sanitize an automation step payload.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    private function sanitizeStepData(array $data): array
    {
        $clean = [];

        // The builder returns each existing step's own id so the sync updates
        // that row instead of replacing it — queue rows reference steps by id.
        if (!empty($data['id'])) {
            $clean['id'] = absint($data['id']);
        }

        if (isset($data['label'])) {
            $clean['label'] = sanitize_text_field((string) $data['label']);
        }

        foreach (['step_type', 'action_type', 'condition_type', 'delay_type', 'branch_type'] as $key) {
            if (isset($data[$key])) {
                $clean[$key] = sanitize_key((string) $data[$key]);
            }
        }

        foreach (['step_order', 'position_x', 'position_y', 'delay_value'] as $key) {
            if (isset($data[$key])) {
                $clean[$key] = absint($data[$key]);
            }
        }

        if (array_key_exists('parent_step_id', $data)) {
            $clean['parent_step_id'] = $data['parent_step_id'] === null
                ? null
                : absint($data['parent_step_id']);
        }

        // bulkCreate() links parents by array INDEX (the DB ids do not exist yet
        // on a fresh save), so this must survive the rebuild or every step is
        // orphaned and the workflow flattens.
        if (array_key_exists('parent_index', $data)) {
            $clean['parent_index'] = $data['parent_index'] === null
                ? null
                : absint($data['parent_index']);
        }

        if (isset($data['action_config'])) {
            $clean['action_config'] = $this->sanitizeActionConfig(
                (string) ($clean['action_type'] ?? ''),
                is_array($data['action_config']) ? $data['action_config'] : []
            );
        }

        if (isset($data['condition_config'])) {
            $clean['condition_config'] = $this->sanitizeConditionConfig(
                is_array($data['condition_config']) ? $data['condition_config'] : []
            );
        }

        return $clean;
    }

    /**
     * Sanitize a step's action_config, per action type.
     *
     * Each action reads a different set of keys, so each gets its own whitelist —
     * a send_email step can never carry a webhook URL, and vice versa.
     *
     * @param array<string, mixed> $config
     * @return array<string, mixed>
     */
    private function sanitizeActionConfig(string $action_type, array $config): array
    {
        switch ($action_type) {
            case 'send_email':
                $clean = [
                    // Authored in the email composer and sent as HTML, so it
                    // keeps post-safe markup.
                    'subject' => sanitize_text_field((string) ($config['subject'] ?? '')),
                    // Inbox preview text (preheader); display text, so header-safe.
                    'preview_text' => sanitize_text_field((string) ($config['preview_text'] ?? '')),
                    'body' => wp_kses_post((string) ($config['body'] ?? '')),
                ];

                if (isset($config['content_mode'])) {
                    $mode = sanitize_key((string) $config['content_mode']);
                    // Anything unexpected falls back to the Visual editor.
                    $clean['content_mode'] = in_array($mode, ['builder', 'richtext'], true)
                        ? $mode
                        : 'builder';
                }

                if (isset($config['json_structure'])) {
                    $clean['json_structure'] = is_array($config['json_structure'])
                        ? $this->sanitizeConfigTree($config['json_structure'])
                        : null;
                }

                if (!empty($config['template_id'])) {
                    $clean['template_id'] = absint($config['template_id']);
                }

                $sender_type = sanitize_key((string) ($config['sender_type'] ?? 'global'));
                $clean['sender_type'] = in_array($sender_type, ['global', 'provider', 'custom'], true)
                    ? $sender_type
                    : 'global';

                if (!empty($config['email_provider_id'])) {
                    $clean['email_provider_id'] = absint($config['email_provider_id']);
                }

                $clean['from_name'] = sanitize_text_field((string) ($config['from_name'] ?? ''));
                $clean['from_email'] = !empty($config['from_email'])
                    ? sanitize_email((string) $config['from_email'])
                    : '';
                $clean['reply_to'] = !empty($config['reply_to'])
                    ? sanitize_email((string) $config['reply_to'])
                    : '';

                return $clean;

            case 'add_tag':
            case 'remove_tag':
                return [
                    'tag_ids' => $this->sanitizeIdList($config['tag_ids'] ?? []),
                ];

            case 'add_list':
            case 'remove_list':
                return [
                    'list_ids' => $this->sanitizeIdList($config['list_ids'] ?? []),
                ];

                // Executed by the Pro add-on's AdvancedActionProcessor. Free still
                // stores the config, because the builder UI lives here.
            case 'update_field':
                return [
                    'field' => sanitize_key((string) ($config['field'] ?? '')),
                    'value' => sanitize_text_field((string) ($config['value'] ?? '')),
                ];

            case 'webhook':
                $method = strtoupper(sanitize_key((string) ($config['method'] ?? 'POST')));

                return [
                    'url' => esc_url_raw((string) ($config['url'] ?? ''), ['http', 'https']),
                    'method' => in_array($method, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], true)
                        ? $method
                        : 'POST',
                ];

            default:
                return [];
        }
    }

    /**
     * Sanitize a step's condition_config.
     *
     * @param array<string, mixed> $config
     * @return array<string, mixed>
     */
    private function sanitizeConditionConfig(array $config): array
    {
        $clean = [];

        foreach (['field', 'operator'] as $key) {
            if (isset($config[$key])) {
                $clean[$key] = sanitize_key((string) $config[$key]);
            }
        }

        if (isset($config['value'])) {
            $clean['value'] = is_array($config['value'])
                ? $this->sanitizeIdList($config['value'])
                : sanitize_text_field((string) $config['value']);
        }

        foreach (['tag_id', 'list_id', 'segment_id', 'campaign_id', 'days'] as $key) {
            if (isset($config[$key])) {
                $clean[$key] = absint($config[$key]);
            }
        }

        return $clean;
    }

    /**
     * Coerce a value to a list of positive integer ids.
     *
     * @param mixed $ids
     * @return array<int, int>
     */
    private function sanitizeIdList($ids): array
    {
        if (!is_array($ids)) {
            return [];
        }

        return array_values(array_filter(array_map('absint', $ids)));
    }

    /**
     * Sanitize trigger context data.
     *
     * Same treatment as any other config tree, but keyed by string: this is a
     * named map (`order_id`, `product_id`, …) that later resolves as merge tags,
     * and the repository's contract is a string-keyed array.
     *
     * @param array<int|string, mixed> $data
     * @return array<string, mixed>
     */
    private function sanitizeContextData(array $data): array
    {
        $clean = [];

        foreach ($this->sanitizeConfigTree($data) as $key => $value) {
            $clean[(string) $key] = $value;
        }

        return $clean;
    }

    /**
     * Recursively sanitize a free-form config tree (trigger config, builder
     * block structure).
     *
     * The shape is open-ended (the builder invents its own block keys), so
     * every leaf string is reduced to post-safe markup instead — colours, ids
     * and URLs survive, executable content does not.
     *
     * @param array<int|string, mixed> $tree
     * @return array<int|string, mixed>
     */
    private function sanitizeConfigTree(array $tree): array
    {
        $clean = [];

        foreach ($tree as $key => $value) {
            $safe_key = is_int($key) ? $key : sanitize_text_field((string) $key);

            if (is_array($value)) {
                $clean[$safe_key] = $this->sanitizeConfigTree($value);
            } elseif (is_string($value)) {
                $clean[$safe_key] = wp_kses_post($value);
            } elseif (is_scalar($value) || $value === null) {
                $clean[$safe_key] = $value;
            }
        }

        return $clean;
    }
}
