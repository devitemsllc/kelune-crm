import axios from 'axios';
import { __ } from '@wordpress/i18n';

/**
 * Extract a human-readable message from a caught value of type `unknown`
 * (the type of `catch` bindings under `strict`/`useUnknownInCatchVariables`).
 *
 * Order: REST error body (`{ message }`) → Axios message → Error.message →
 * stringified fallback.
 */
export function getErrorMessage(
  error: unknown,
  fallback = __('Something went wrong', 'kelune-crm')
): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    return data?.message || error.message || fallback;
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === 'string') {
    return error;
  }
  return fallback;
}

/**
 * The WP REST error body shape: `errorResponse()` / WP_Error serialize to
 * `{ code, message, data: { status, ...extra } }`. A few endpoints attach extra
 * keys to `data` beyond `status`:
 *  - POST /automations/{id}/activate  → data.errors: string[]
 *  - POST /settings/test-email-connection (429) → data.retry_after: number
 *  - POST /webhook/{key} (429) → data.retry_after: number
 */
export interface ApiErrorBody {
  code: string;
  message: string;
  data?: { status?: number; retry_after?: number; errors?: string[] } & Record<
    string,
    unknown
  >;
}

/** Extract the structured WP REST error body from a caught value, if present. */
export function getApiError(error: unknown): ApiErrorBody | null {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as Partial<ApiErrorBody> | undefined;
    if (body && typeof body.code === 'string') {
      return {
        code: body.code,
        message: body.message ?? '',
        data: body.data,
      };
    }
  }
  return null;
}
