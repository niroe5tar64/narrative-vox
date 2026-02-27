import type { ProblemDetail } from "@narrative-vox/api-types";
import type { Context } from "hono";
import type { AppVariables } from "../types.ts";

/** HTTP 400 Bad Request */
export const STATUS_400 = 400 as const;
/** HTTP 403 Forbidden */
export const STATUS_403 = 403 as const;
/** HTTP 404 Not Found */
export const STATUS_404 = 404 as const;
/** HTTP 409 Conflict */
export const STATUS_409 = 409 as const;
/** HTTP 413 Payload Too Large */
export const STATUS_413 = 413 as const;
/** HTTP 415 Unsupported Media Type */
export const STATUS_415 = 415 as const;
/** HTTP 422 Unprocessable Entity */
export const STATUS_422 = 422 as const;
/** HTTP 429 Too Many Requests */
export const STATUS_429 = 429 as const;
/** HTTP 500 Internal Server Error */
export const STATUS_500 = 500 as const;
/** HTTP 503 Service Unavailable */
export const STATUS_503 = 503 as const;

/**
 * RFC7807形式のエラーレスポンスを返す。
 * Content-Type は application/problem+json に設定される。
 */
export function problem(
  c: Context<{ Variables: AppVariables }>,
  p: ProblemDetail,
): Response {
  const requestId = c.get("requestId") ?? "";
  const body = {
    type: p.type ?? "about:blank",
    title: p.title,
    status: p.status,
    ...(p.detail !== undefined && { detail: p.detail }),
    instance: p.instance ?? c.req.url,
    ...(p.errorCode !== undefined && { errorCode: p.errorCode }),
    ...(p.details !== undefined && { details: p.details }),
    requestId,
  };
  return new Response(JSON.stringify(body), {
    status: p.status,
    headers: { "Content-Type": "application/problem+json" },
  });
}
