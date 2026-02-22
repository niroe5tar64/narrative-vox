import { Hono } from "hono";
import {
  problem,
  STATUS_400,
  STATUS_403,
  STATUS_404,
  STATUS_500,
} from "../lib/problem.ts";
import { SafePathError, safeResolve } from "../lib/safe-path.ts";
import type { AppVariables } from "../types.ts";

export const editorRouter = new Hono<{ Variables: AppVariables }>();

/** run ディレクトリ内ファイルパターン: data/projects/<projectId>/run-YYYYMMDD-HHMM/... */
const RUN_FILE_PATTERN =
  /^data\/projects\/[a-z0-9][a-z0-9_-]*\/run-\d{8}-\d{4}\//;

// ===== POST /api/editor/open =====

editorRouter.post("/open", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return problem(c, { title: "Invalid JSON body", status: STATUS_400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return problem(c, { title: "Expected object body", status: STATUS_400 });
  }

  const { path: filePath } = body as Record<string, unknown>;
  if (typeof filePath !== "string" || !filePath) {
    return problem(c, { title: "Missing or invalid path", status: STATUS_400 });
  }

  // run ディレクトリ内のファイルのみ許可
  const normalizedPath = filePath.replace(/\\/g, "/");
  if (!RUN_FILE_PATTERN.test(normalizedPath)) {
    return problem(c, {
      title: "Forbidden",
      status: STATUS_403,
      detail: "Only files within run directories can be opened",
      errorCode: "EDITOR_OPEN_NOT_ALLOWED",
    });
  }

  try {
    const absPath = await safeResolve(normalizedPath);

    const file = Bun.file(absPath);
    if (!(await file.exists())) {
      return problem(c, { title: "File not found", status: STATUS_404 });
    }

    // VS Code で開く（利用不可の場合は無視して成功を返す）
    try {
      const proc = Bun.spawn(["code", absPath], {
        stdout: "ignore",
        stderr: "ignore",
      });
      // fire-and-forget: 終了を待たない
      proc.exited.catch(() => {});
    } catch {
      // code コマンドが存在しない場合など — エラーを上位に伝播しない
    }

    return c.json({ opened: true, path: normalizedPath });
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, { title: "Failed to open file", status: STATUS_500 });
  }
});
