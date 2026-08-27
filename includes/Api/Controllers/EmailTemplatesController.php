<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

use KeluneCRM\Repositories\EmailTemplateRepository;
use KeluneCRM\Services\EmailHtmlRenderer;

class EmailTemplatesController extends BaseController
{
    protected string $restBase = 'email-templates';
    private \KeluneCRM\Repositories\EmailTemplateRepository $repository;

    public function __construct()
    {
        $this->repository = new EmailTemplateRepository();
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

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>[\d]+)', [
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
                'permission_callback' => [$this, 'checkDeletePermission'],
            ],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>[\d]+)/favorite', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'toggleFavorite'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>[\d]+)/duplicate', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'duplicate'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/predefined', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'getPredefinedTemplates'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        register_rest_route($namespace, '/' . $this->restBase . '/(?P<id>[\d]+)/preview', [
            'methods' => \WP_REST_Server::READABLE,
            'callback' => [$this, 'preview'],
            'permission_callback' => [$this, 'checkReadPermission'],
        ]);

        // Send a test email of ad-hoc builder HTML (template need not be saved).
        register_rest_route($namespace, '/' . $this->restBase . '/test-send', [
            'methods' => \WP_REST_Server::CREATABLE,
            'callback' => [$this, 'sendTestEmail'],
            'permission_callback' => [$this, 'checkWritePermission'],
        ]);
    }

    /**
     * Send a test copy of the given HTML to an email address.
     *
     * @return \WP_REST_Response|\WP_Error
     */
    public function sendTestEmail(\WP_REST_Request $request)
    {
        $to = sanitize_email((string) $request->get_param('to'));
        if (empty($to) || !is_email($to)) {
            return $this->errorResponse(
                __('A valid recipient email is required', 'kelune-crm'),
                'invalid_email',
                400
            );
        }

        $subject = sanitize_text_field((string) ($request->get_param('subject') ?? ''));
        if (empty($subject)) {
            $subject = __('Test Email', 'kelune-crm');
        }

        // Prefix like every other test send in the plugin (campaign + automation
        // step) so the recipient can tell a test copy apart from a real send.
        /* translators: %s: email subject line */
        $subject = sprintf(__('[TEST] %s', 'kelune-crm'), $subject);

        $html = EmailHtmlRenderer::stripStyleArtifact(wp_kses_post((string) ($request->get_param('html') ?? '')));
        if (empty($html)) {
            return $this->errorResponse(
                __('Template content is empty', 'kelune-crm'),
                'empty_content',
                400
            );
        }

        $emailService = new \KeluneCRM\Services\EmailService();

        // sendTransactional() is the ungated raw sender (double opt-in relies on
        // reaching a pending contact), and this address is typed by hand rather
        // than resolved from a contact — so the opt-out has to be honoured here.
        if ($emailService->isAddressSuppressed($to)) {
            return $this->errorResponse(
                __('That address belongs to a contact who is not accepting email.', 'kelune-crm'),
                'contact_not_sendable',
                400
            );
        }

        try {
            $result = $emailService->sendTransactional($to, $subject, $html);

            if (is_wp_error($result)) {
                return $this->errorResponse(
                    $result->get_error_message(),
                    'send_failed',
                    502
                );
            }

            return $this->successResponse([
                'sent' => true,
            ]);
        } catch (\Exception $e) {
            return $this->errorResponse(
                __('Failed to send test email', 'kelune-crm'),
                'send_error',
                500
            );
        }
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function getItems(\WP_REST_Request $request)
    {
        try {
            $params = [
                'page' => absint($request->get_param('page') ?? 1),
                'per_page' => absint($request->get_param('per_page') ?? 20),
                'search' => $request->get_param('search'),
                'template_type' => $request->get_param('template_type'),
                'is_favorite' => $request->get_param('is_favorite'),
                'orderby' => $request->get_param('orderby') ?? 'id',
                'order' => $request->get_param('order') ?? 'DESC',
            ];

            $templates = $this->repository->getAll($params);
            $total = $this->repository->getCount($params);

            $items = array_map(function ($template) {
                return $template->toArray();
            }, $templates);

            return $this->successResponse([
                'items' => $items,
                'total' => $total,
                'page' => $params['page'],
                'per_page' => $params['per_page'],
                'total_pages' => ceil($total / $params['per_page']),
            ]);
        } catch (\Exception $e) {
            return $this->errorResponse(
                __('Failed to fetch templates', 'kelune-crm'),
                'fetch_error',
                500
            );
        }
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function getItem(\WP_REST_Request $request)
    {
        try {
            $id = absint($request['id']);
            $template = $this->repository->find($id);

            if (!$template) {
                return $this->errorResponse(
                    __('Template not found', 'kelune-crm'),
                    'template_not_found',
                    404
                );
            }

            return $this->successResponse($template->toArray());
        } catch (\Exception $e) {
            return $this->errorResponse(
                __('Failed to fetch template', 'kelune-crm'),
                'fetch_error',
                500
            );
        }
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function createItem(\WP_REST_Request $request)
    {
        try {
            $name = sanitize_text_field($request->get_param('name'));
            if (empty($name)) {
                return $this->errorResponse(
                    __('Template name is required', 'kelune-crm'),
                    'missing_name',
                    400
                );
            }

            // Content is optional at create time: a template may be saved as an
            // empty draft from the list's info modal and designed later (parity
            // with automations, which persist before the workflow is built).
            $html_content = $request->get_param('html_content');
            $html_content = empty($html_content)
                ? ''
                : EmailHtmlRenderer::stripStyleArtifact(wp_kses_post($html_content));

            $data = [
                'name' => $name,
                'description' => sanitize_textarea_field($request->get_param('description') ?? ''),
                'thumbnail_url' => esc_url_raw($request->get_param('thumbnail_url') ?? ''),
                'template_type' => sanitize_text_field($request->get_param('template_type') ?? 'custom'),
                'html_content' => $html_content,
                'json_structure' => $this->sanitizeJsonStructure($request->get_param('json_structure')),
                'is_favorite' => (bool) $request->get_param('is_favorite'),
                'created_by' => get_current_user_id(),
            ];

            $id = $this->repository->create($data);

            if (!$id) {
                return $this->errorResponse(
                    __('Failed to create template', 'kelune-crm'),
                    'create_failed',
                    500
                );
            }

            $template = $this->repository->find($id);

            if (!$template) {
                return $this->errorResponse(
                    __('Template not found', 'kelune-crm'),
                    'template_not_found',
                    404
                );
            }

            return $this->successResponse(
                $template->toArray(),
                __('Template created successfully', 'kelune-crm')
            );
        } catch (\Exception $e) {
            return $this->errorResponse(
                __('Failed to create template', 'kelune-crm'),
                'create_error',
                500
            );
        }
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function updateItem(\WP_REST_Request $request)
    {
        try {
            $id = absint($request['id']);
            $template = $this->repository->find($id);

            if (!$template) {
                return $this->errorResponse(
                    __('Template not found', 'kelune-crm'),
                    'template_not_found',
                    404
                );
            }

            $data = [];

            if ($request->has_param('name')) {
                $data['name'] = sanitize_text_field($request->get_param('name'));
            }

            if ($request->has_param('description')) {
                $data['description'] = sanitize_textarea_field($request->get_param('description'));
            }

            if ($request->has_param('thumbnail_url')) {
                $data['thumbnail_url'] = esc_url_raw($request->get_param('thumbnail_url'));
            }

            if ($request->has_param('html_content')) {
                $data['html_content'] = EmailHtmlRenderer::stripStyleArtifact(
                    wp_kses_post($request->get_param('html_content'))
                );
            }

            if ($request->has_param('json_structure')) {
                $data['json_structure'] = $this->sanitizeJsonStructure($request->get_param('json_structure'));
            }

            if ($request->has_param('is_favorite')) {
                $data['is_favorite'] = (int) $request->get_param('is_favorite');
            }

            $result = $this->repository->update($id, $data);

            if (!$result) {
                return $this->errorResponse(
                    __('Failed to update template', 'kelune-crm'),
                    'update_failed',
                    500
                );
            }

            $template = $this->repository->find($id);

            if (!$template) {
                return $this->errorResponse(
                    __('Template not found', 'kelune-crm'),
                    'template_not_found',
                    404
                );
            }

            return $this->successResponse(
                $template->toArray(),
                __('Template updated successfully', 'kelune-crm')
            );
        } catch (\Exception $e) {
            return $this->errorResponse(
                __('Failed to update template', 'kelune-crm'),
                'update_error',
                500
            );
        }
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function deleteItem(\WP_REST_Request $request)
    {
        try {
            $id = absint($request['id']);
            $template = $this->repository->find($id);

            if (!$template) {
                return $this->errorResponse(
                    __('Template not found', 'kelune-crm'),
                    'template_not_found',
                    404
                );
            }

            if ($template->isPredefined()) {
                return $this->errorResponse(
                    __('Cannot delete predefined templates', 'kelune-crm'),
                    'cannot_delete_predefined',
                    403
                );
            }

            $result = $this->repository->delete($id);

            if (!$result) {
                return $this->errorResponse(
                    __('Failed to delete template', 'kelune-crm'),
                    'delete_failed',
                    500
                );
            }

            return $this->successResponse(
                ['id' => $id],
                __('Template deleted successfully', 'kelune-crm')
            );
        } catch (\Exception $e) {
            return $this->errorResponse(
                __('Failed to delete template', 'kelune-crm'),
                'delete_error',
                500
            );
        }
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function toggleFavorite(\WP_REST_Request $request)
    {
        try {
            $id = absint($request['id']);
            $template = $this->repository->find($id);

            if (!$template) {
                return $this->errorResponse(
                    __('Template not found', 'kelune-crm'),
                    'template_not_found',
                    404
                );
            }

            $result = $this->repository->toggleFavorite($id);

            if (!$result) {
                return $this->errorResponse(
                    __('Failed to toggle favorite', 'kelune-crm'),
                    'toggle_failed',
                    500
                );
            }

            $template = $this->repository->find($id);

            if (!$template) {
                return $this->errorResponse(
                    __('Template not found', 'kelune-crm'),
                    'template_not_found',
                    404
                );
            }

            return $this->successResponse(
                $template->toArray(),
                __('Favorite status updated', 'kelune-crm')
            );
        } catch (\Exception $e) {
            return $this->errorResponse(
                __('Failed to toggle favorite', 'kelune-crm'),
                'toggle_error',
                500
            );
        }
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function duplicate(\WP_REST_Request $request)
    {
        try {
            $id = absint($request['id']);
            $template = $this->repository->find($id);

            if (!$template) {
                return $this->errorResponse(
                    __('Template not found', 'kelune-crm'),
                    'template_not_found',
                    404
                );
            }

            $data = [
                /* translators: %s: original template name */
                'name' => sprintf(__('%s (Copy)', 'kelune-crm'), $template->name),
                'description' => $template->description,
                'thumbnail_url' => $template->thumbnail_url,
                'template_type' => 'custom',
                'html_content' => $template->html_content,
                'json_structure' => $template->json_structure,
                'is_favorite' => false,
                'created_by' => get_current_user_id(),
            ];

            $new_id = $this->repository->create($data);

            if (!$new_id) {
                return $this->errorResponse(
                    __('Failed to duplicate template', 'kelune-crm'),
                    'duplicate_failed',
                    500
                );
            }

            $new_template = $this->repository->find($new_id);

            if (!$new_template) {
                return $this->errorResponse(
                    __('Template not found', 'kelune-crm'),
                    'template_not_found',
                    404
                );
            }

            return $this->successResponse(
                $new_template->toArray(),
                __('Template duplicated successfully', 'kelune-crm')
            );
        } catch (\Exception $e) {
            return $this->errorResponse(
                __('Failed to duplicate template', 'kelune-crm'),
                'duplicate_error',
                500
            );
        }
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function getPredefinedTemplates(\WP_REST_Request $request)
    {
        try {
            // Built-in templates come from code (EmailTemplateService), never the
            // database. Shaped to the same object the dashboard consumes for a
            // custom template so the gallery renders both tabs identically.
            $service = new \KeluneCRM\Services\EmailTemplateService();

            $items = array_map(static function (array $template): array {
                return [
                    'id' => $template['id'],
                    'name' => $template['name'],
                    'description' => $template['description'] ?? '',
                    'thumbnail_url' => '',
                    'template_type' => 'predefined',
                    'editor' => $template['editor'] ?? 'builder',
                    'html_content' => $template['html'],
                    'json_structure' => $template['structure'],
                    'is_favorite' => false,
                    'usage_count' => 0,
                ];
            }, $service->getTemplates());

            return $this->successResponse(['items' => $items]);
        } catch (\Exception $e) {
            return $this->errorResponse(
                __('Failed to fetch predefined templates', 'kelune-crm'),
                'fetch_error',
                500
            );
        }
    }

    /**
     * @return \WP_REST_Response|\WP_Error
     */
    public function preview(\WP_REST_Request $request)
    {
        try {
            $id = absint($request['id']);
            $template = $this->repository->find($id);

            if (!$template) {
                return $this->errorResponse(
                    __('Template not found', 'kelune-crm'),
                    'template_not_found',
                    404
                );
            }

            return $this->successResponse([
                'html' => $template->html_content,
            ]);
        } catch (\Exception $e) {
            return $this->errorResponse(
                __('Failed to preview template', 'kelune-crm'),
                'preview_error',
                500
            );
        }
    }

    /**
     * Normalise the visual builder's block tree before storage. Accepts a JSON
     * string or a decoded array and returns a normalised JSON string (or null
     * when empty/invalid); every string leaf is reduced to post-safe markup so
     * nothing executable is stored (stored-XSS hardening).
     *
     * @param mixed $raw
     */
    private function sanitizeJsonStructure($raw): ?string
    {
        if (is_string($raw)) {
            if ($raw === '') {
                return null;
            }
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : null;
        }

        if (!is_array($raw)) {
            return null;
        }

        $json = wp_json_encode($this->sanitizeStructure($raw));

        return $json === false ? null : $json;
    }

    /**
     * Recursively sanitize a free-form builder block tree: keys reduced to plain
     * text, other scalars kept. The Text block's `content` is author-authored
     * rich text, so it is restricted to an inline-only allow-list (no block-level
     * tags, images or scripts); every other string leaf holds a plain style
     * value and passes through wp_kses_post.
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
                $clean[$safe_key] = $safe_key === 'content'
                    ? wp_kses($value, $this->allowedInlineHtml())
                    : wp_kses_post($value);
            } elseif (is_scalar($value) || $value === null) {
                $clean[$safe_key] = $value;
            }
        }

        return $clean;
    }

    /**
     * Allow-list for the Text block's rich content. Permits the block-level tags
     * the editor toolbar produces (paragraphs, lists, blockquotes) plus basic
     * inline formatting and links — all with a safe-css-filtered `style`
     * attribute — but no images, tables, scripts or arbitrary containers. Block
     * spacing is not authored here; it is inlined per element at render time
     * (see EmailHtmlRenderer::styleRichContent).
     *
     * @return array<string, array<string, bool>>
     */
    private function allowedInlineHtml(): array
    {
        $inline = ['style' => true];
        $block = ['style' => true, 'class' => true];

        return [
            'a' => ['href' => true, 'title' => true, 'target' => true, 'rel' => true, 'style' => true],
            'b' => [],
            'strong' => [],
            'i' => [],
            'em' => [],
            'u' => [],
            's' => [],
            'strike' => [],
            'span' => $inline,
            'br' => [],
            'small' => [],
            'sub' => [],
            'sup' => [],
            'mark' => [],
            'p' => $block,
            'blockquote' => $block,
            'ul' => $block,
            'ol' => $block,
            'li' => $block,
        ];
    }
}
