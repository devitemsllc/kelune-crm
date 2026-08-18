<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Repositories\AutomationRepository;
use KeluneCRM\Repositories\AutomationStepRepository;
use KeluneCRM\Services\AutomationTemplateService;

/**
 * REST controller for the automation template library ("Use a Template").
 *
 * The template set is authored in code by {@see AutomationTemplateService} and
 * served on the fly; importing clones a template's steps into a real, draft
 * automation through the first-party repositories. Steps are copied verbatim —
 * tag/list action steps ship with no id preselected, so the user picks or creates
 * one inline on the draft (templates never silently create tags/lists).
 *
 * The Free plugin owns this mechanism and the base workflows; Pro (and third
 * parties) append premium workflows via the `kelune_crm_automation_templates`
 * filter, so no separate Pro controller/route is needed.
 */
class AutomationTemplatesController extends BaseController
{
    protected string $restBase = 'automations';
    private AutomationRepository $repository;
    private AutomationStepRepository $stepRepository;
    private AutomationTemplateService $templateService;

    public function __construct()
    {
        $this->repository = new AutomationRepository();
        $this->stepRepository = new AutomationStepRepository();
        $this->templateService = new AutomationTemplateService();
    }

    public function registerRoutes(string $namespace): void
    {
        $this->namespace = $namespace;

        register_rest_route($namespace, '/' . $this->restBase . '/templates', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getTemplates'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/templates/(?P<template_id>[a-z0-9-]+)', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getTemplate'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/templates/(?P<template_id>[a-z0-9-]+)/import', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'importTemplate'],
            'permission_callback' => [$this, 'checkWritePermission'],
            'args' => [
                'name' => [
                    'required' => false,
                    'sanitize_callback' => 'sanitize_text_field',
                ],
            ],
        ]);
    }

    public function getTemplates(\WP_REST_Request $request): \WP_REST_Response
    {
        return $this->successResponse([
            'data' => $this->templateService->getTemplates(),
        ]);
    }

    public function getTemplate(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $template = $this->templateService->getTemplate((string) $request->get_param('template_id'));

        if (!$template) {
            return $this->errorResponse(__('Template not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($template);
    }

    public function importTemplate(\WP_REST_Request $request): \WP_REST_Response|\WP_Error
    {
        $template = $this->templateService->getTemplate((string) $request->get_param('template_id'));

        if (!$template) {
            return $this->errorResponse(__('Template not found', 'kelune-crm'), 'not_found', 404);
        }

        $custom_name = $request->get_param('name');
        /** @var array<int, array<string, mixed>> $steps */
        $steps = is_array($template['steps'] ?? null) ? $template['steps'] : [];

        $automation_data = [
            'name' => $custom_name ?: $template['name'],
            'description' => $template['description'] ?? '',
            'trigger_type' => $steps[0]['trigger_type'] ?? 'manual',
            'trigger_config' => $steps[0]['trigger_config'] ?? [],
            'status' => 'draft',
        ];

        $automation_id = $this->repository->create($automation_data);

        if (!$automation_id) {
            return $this->errorResponse(__('Failed to create automation from template', 'kelune-crm'), 'create_failed', 500);
        }

        /** @var array<int, int> $step_id_map template step index => created step ID */
        $step_id_map = [];
        $links = $this->resolveTemplateStepLinks($steps);

        foreach ($steps as $index => $step_data) {
            // Linear spine: a single column with each step below the last. Branching
            // needs the Pro condition processor, which template workflows never use.
            $position_x = 250;
            $position_y = 100 + ($index * 130);

            $step_id = $this->stepRepository->create([
                'automation_id' => $automation_id,
                'step_order' => $index,
                'step_type' => $step_data['step_type'],
                'action_type' => $step_data['action_type'] ?? null,
                'action_config' => $step_data['action_config'] ?? [],
                'condition_type' => $step_data['condition_type'] ?? null,
                'condition_config' => $step_data['condition_config'] ?? [],
                'delay_type' => $step_data['delay_type'] ?? null,
                'delay_value' => $step_data['delay_value'] ?? null,
                'position_x' => $position_x,
                'position_y' => $position_y,
                'label' => $step_data['label'] ?? '',
            ]);

            if ($step_id) {
                $step_id_map[$index] = $step_id;
            }
        }

        foreach ($links as $step_index => $parent_info) {
            if (isset($step_id_map[$step_index], $step_id_map[$parent_info['parent_index']])) {
                $this->stepRepository->update($step_id_map[$step_index], [
                    'parent_step_id' => $step_id_map[$parent_info['parent_index']],
                    'branch_type' => $parent_info['branch_type'],
                ]);
            }
        }

        $automation = $this->repository->find($automation_id);

        if (!$automation) {
            return $this->errorResponse(__('Automation not found', 'kelune-crm'), 'not_found', 404);
        }

        return $this->successResponse($automation->toArray(), __('Template imported successfully', 'kelune-crm'));
    }

    /**
     * Infer parent/branch links for a flat list of template steps.
     *
     * Template workflows are linear (no condition branching), so each step simply
     * chains beneath the one before it; the trigger at index 0 is the root and has
     * no parent. An explicit parent_index/branch_type on a step still wins, leaving
     * room for a future branching template.
     *
     * @param array<int, array<string, mixed>> $steps
     * @return array<int, array{parent_index: int, branch_type: string|null}>
     */
    private function resolveTemplateStepLinks(array $steps): array
    {
        $links = [];

        foreach ($steps as $index => $step) {
            if ($index === 0) {
                continue; // Trigger is the root, no parent.
            }

            if (isset($step['parent_index'])) {
                $links[$index] = [
                    'parent_index' => (int) $step['parent_index'],
                    'branch_type' => $step['branch_type'] ?? null,
                ];
                continue;
            }

            $links[$index] = ['parent_index' => $index - 1, 'branch_type' => null];
        }

        return $links;
    }
}
