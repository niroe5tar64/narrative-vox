import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "../types.ts";

/**
 * リクエストID付与ミドルウェア。
 *
 * - `X-Request-Id` ヘッダーが存在する場合はその値を使用する
 * - 存在しない場合は UUID v4 を生成する
 * - 生成・引き継いだIDをコンテキスト変数 `requestId` に設定し、
 *   レスポンスの `X-Request-Id` ヘッダーにも付与する
 */
export const requestIdMiddleware: MiddlewareHandler<{
  Variables: AppVariables;
}> = async (c, next) => {
  const headerId = c.req.header("x-request-id");
  const id =
    headerId && /^[A-Za-z0-9._:-]{1,128}$/.test(headerId)
      ? headerId
      : crypto.randomUUID();
  c.set("requestId", id);
  await next();
  c.res.headers.set("x-request-id", id);
};
