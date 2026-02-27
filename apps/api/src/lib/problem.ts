import type { Context } from "hono";
import type { AppVariables } from "../types.ts";

/**
 * RFC7807 Problem Details (application/problem+json) のフィールド。
 * https://www.rfc-editor.org/rfc/rfc7807
 */
export interface ProblemDetail {
  /** 問題タイプを識別するURIリファレンス。省略時は "about:blank"。 */
  type?: string;
  /** 問題タイプの短い人間可読サマリー。 */
  title: string;
  /** HTTPステータスコード。 */
  status: number;
  /** この発生に固有の詳細説明。 */
  detail?: string;
  /** 問題の発生箇所を識別するURIリファレンス。省略時はリクエストURLを使用。 */
  instance?: string;
  /** アプリケーション固有のエラーコード。 */
  errorCode?: string;
  /** バリデーションエラーなどの追加詳細。 */
  details?: unknown;
}

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
