import { readdir, readFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { config } from "../config.ts";
import { isTextExtension } from "../lib/content-type.ts";
import {
  problem,
  STATUS_400,
  STATUS_403,
  STATUS_404,
  STATUS_409,
  STATUS_415,
  STATUS_500,
} from "../lib/problem.ts";
import { SafePathError, safeResolve } from "../lib/safe-path.ts";
import type { AppVariables } from "../types.ts";

export const runsRouter = new Hono<{ Variables: AppVariables }>();

// ===== バリデーション =====

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const RUN_ID_PATTERN = /^run-\d{8}-\d{4}$/;

function isValidProjectId(id: string): boolean {
  return PROJECT_ID_PATTERN.test(id);
}

function isValidRunId(id: string): boolean {
  return RUN_ID_PATTERN.test(id);
}

/** voicevox_text.json ファイルかどうか判定 */
function isVoicevoxTextFile(filename: string): boolean {
  return /^E\d{2}_voicevox_text\.json$/.test(filename);
}

// ===== ユーティリティ =====

async function computeETag(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `"${hex}"`;
}

type TreeNode =
  | { name: string; type: "file"; path: string }
  | { name: string; type: "dir"; children: TreeNode[] };

const MAX_TREE_DEPTH = 10;

async function buildTree(
  absDir: string,
  relBase: string,
  depth: number,
): Promise<TreeNode[]> {
  if (depth >= MAX_TREE_DEPTH) {
    return [];
  }
  const entries = await readdir(absDir, { withFileTypes: true });
  entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const children = await buildTree(join(absDir, entry.name), relPath, depth + 1);
      nodes.push({ name: entry.name, type: "dir", children });
    } else {
      nodes.push({ name: entry.name, type: "file", path: relPath });
    }
  }
  return nodes;
}

// ===== Run Status =====

const EPISODE_ID_RE = /^(E\d{2})_/;

/** ディレクトリ内のファイル名からエピソードIDを抽出（存在しない場合は空配列） */
async function globEpisodeIds(dir: string, suffix: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const name of entries) {
    if (!name.endsWith(suffix)) continue;
    const m = EPISODE_ID_RE.exec(name);
    if (m) ids.push(m[1]);
  }
  return ids.sort();
}

type StageStatus = "completed" | "partial" | "idle";

type StageInfo =
  | { status: "completed" }
  | { status: "partial" | "idle"; episodeIds: string[] };

type RunStatus = {
  projectId: string;
  runId: string;
  stages: {
    blueprint: { status: StageStatus };
    material: StageInfo;
    script: StageInfo;
    context: StageInfo;
    voicevox_text: StageInfo;
    voicevox_project: StageInfo;
    audio: StageInfo;
  };
  plannedEpisodeIds: string[];
};

function toStageInfo(episodeIds: string[], planned: string[]): StageInfo {
  if (
    planned.length > 0 &&
    planned.every((plannedId) => episodeIds.includes(plannedId))
  ) {
    return { status: "completed" };
  }
  if (episodeIds.length > 0) {
    return { status: "partial", episodeIds };
  }
  return { status: "idle", episodeIds: [] };
}

async function deriveRunStatus(
  runDir: string,
  projectId: string,
  runId: string,
): Promise<RunStatus> {
  // blueprint
  const blueprintFile = join(runDir, "blueprint", "project_blueprint.json");
  let blueprintExists = false;
  const plannedEpisodeIds: string[] = [];
  try {
    await stat(blueprintFile);
    blueprintExists = true;
    const raw = await readFile(blueprintFile, "utf-8");
    const data = JSON.parse(raw) as {
      episode_plan?: { episode_id?: string }[];
    };
    if (Array.isArray(data.episode_plan)) {
      for (const ep of data.episode_plan) {
        if (typeof ep.episode_id === "string") {
          plannedEpisodeIds.push(ep.episode_id);
        }
      }
    }
  } catch {
    // blueprint not yet created
  }

  const [
    materialIds,
    scriptIds,
    contextIds,
    voicevoxTextIds,
    vvprojIds,
    audioIds,
  ] = await Promise.all([
    globEpisodeIds(join(runDir, "material"), "_material.json"),
    globEpisodeIds(join(runDir, "script"), "_script.md"),
    globEpisodeIds(join(runDir, "context"), "_episode_digest.json"),
    globEpisodeIds(join(runDir, "voicevox_text"), "_voicevox_text.json"),
    globEpisodeIds(join(runDir, "voicevox_project"), ".vvproj"),
    globEpisodeIds(join(runDir, "audio"), ".wav"),
  ]);

  // voicevox_text: patched ファイルは除外（_voicevox_text.patched.json は suffix が違うので自然に除外）

  return {
    projectId,
    runId,
    stages: {
      blueprint: { status: blueprintExists ? "completed" : "idle" },
      material: toStageInfo(materialIds, plannedEpisodeIds),
      script: toStageInfo(scriptIds, plannedEpisodeIds),
      context: toStageInfo(contextIds, plannedEpisodeIds),
      voicevox_text: toStageInfo(voicevoxTextIds, plannedEpisodeIds),
      voicevox_project: toStageInfo(vvprojIds, plannedEpisodeIds),
      audio: toStageInfo(audioIds, plannedEpisodeIds),
    },
    plannedEpisodeIds,
  };
}

// ===== GET /api/runs =====

runsRouter.get("/", async (c) => {
  const projectIdFilter = c.req.query("projectId");
  const page = Math.max(
    1,
    Number.parseInt(c.req.query("page") ?? "1", 10) || 1,
  );
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(c.req.query("pageSize") ?? "20", 10) || 20),
  );

  if (projectIdFilter && !isValidProjectId(projectIdFilter)) {
    return problem(c, { title: "Invalid projectId", status: STATUS_400 });
  }

  try {
    const projectsDir = join(config.repoRoot, "data/projects");

    let projectIds: string[];
    try {
      const all = await readdir(projectsDir);
      projectIds = all.filter(
        (p) => !p.startsWith(".") && PROJECT_ID_PATTERN.test(p),
      );
      if (projectIdFilter) {
        projectIds = projectIds.filter((p) => p === projectIdFilter);
      }
    } catch {
      return c.json({ items: [], total: 0, page, pageSize });
    }

    type RunItem = {
      projectId: string;
      runId: string;
      createdAt: string;
      sortKey: string;
    };
    const allRuns: RunItem[] = [];

    for (const projectId of projectIds) {
      const projectDir = join(projectsDir, projectId);
      let runDirs: string[];
      try {
        const entries = await readdir(projectDir);
        runDirs = entries.filter((d) => RUN_ID_PATTERN.test(d));
      } catch {
        continue;
      }

      for (const runId of runDirs) {
        // run-YYYYMMDD-HHMM からソートキーと日時を生成
        const match = runId.match(/^run-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/);
        let createdAt: string;
        let sortKey: string;

        if (match) {
          const [, year, month, day, hour, min] = match;
          createdAt = `${year}-${month}-${day}T${hour}:${min}:00Z`;
          sortKey = `${year}${month}${day}${hour}${min}`;
        } else {
          // フォールバック: mtime 降順
          try {
            const s = await stat(join(projectDir, runId));
            createdAt = s.mtime.toISOString();
            sortKey = s.mtime.getTime().toString().padStart(20, "0");
          } catch {
            createdAt = new Date(0).toISOString();
            sortKey = "0".padStart(20, "0");
          }
        }

        allRuns.push({ projectId, runId, createdAt, sortKey });
      }
    }

    allRuns.sort((a, b) => b.sortKey.localeCompare(a.sortKey));

    const total = allRuns.length;
    const start = (page - 1) * pageSize;
    const items = allRuns
      .slice(start, start + pageSize)
      .map(({ projectId, runId, createdAt }) => ({
        projectId,
        runId,
        createdAt,
      }));

    return c.json({ items, total, page, pageSize });
  } catch {
    return problem(c, { title: "Failed to list runs", status: STATUS_500 });
  }
});

// ===== GET /api/runs/:projectId/:runId/tree =====

runsRouter.get("/:projectId/:runId/tree", async (c) => {
  const projectId = c.req.param("projectId");
  const runId = c.req.param("runId");

  if (!isValidProjectId(projectId)) {
    return problem(c, { title: "Invalid projectId", status: STATUS_400 });
  }
  if (!isValidRunId(runId)) {
    return problem(c, { title: "Invalid runId", status: STATUS_400 });
  }

  try {
    const runAbsPath = await safeResolve(`data/projects/${projectId}/${runId}`);
    const s = await stat(runAbsPath).catch(() => null);
    if (!s || !s.isDirectory()) {
      return problem(c, { title: "Run not found", status: STATUS_404 });
    }

    const children = await buildTree(runAbsPath, "", 0);
    return c.json({ tree: { name: runId, type: "dir", children } });
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, { title: "Failed to get run tree", status: STATUS_500 });
  }
});

// ===== GET /api/runs/:projectId/:runId/status =====

runsRouter.get("/:projectId/:runId/status", async (c) => {
  const projectId = c.req.param("projectId");
  const runId = c.req.param("runId");

  if (!isValidProjectId(projectId)) {
    return problem(c, { title: "Invalid projectId", status: STATUS_400 });
  }
  if (!isValidRunId(runId)) {
    return problem(c, { title: "Invalid runId", status: STATUS_400 });
  }

  try {
    const runAbsPath = await safeResolve(`data/projects/${projectId}/${runId}`);
    const s = await stat(runAbsPath).catch(() => null);
    if (!s || !s.isDirectory()) {
      return problem(c, { title: "Run not found", status: STATUS_404 });
    }

    const runStatus = await deriveRunStatus(runAbsPath, projectId, runId);
    return c.json(runStatus);
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, {
      title: "Failed to get run status",
      status: STATUS_500,
    });
  }
});

// ===== GET /api/runs/:projectId/:runId/file?path=... =====

runsRouter.get("/:projectId/:runId/file", async (c) => {
  const projectId = c.req.param("projectId");
  const runId = c.req.param("runId");
  const filePath = c.req.query("path");

  if (!isValidProjectId(projectId)) {
    return problem(c, { title: "Invalid projectId", status: STATUS_400 });
  }
  if (!isValidRunId(runId)) {
    return problem(c, { title: "Invalid runId", status: STATUS_400 });
  }
  if (!filePath) {
    return problem(c, {
      title: "Missing path query parameter",
      status: STATUS_400,
    });
  }

  try {
    const runAbsPath = await safeResolve(`data/projects/${projectId}/${runId}`);
    const absPath = await safeResolve(
      `data/projects/${projectId}/${runId}/${filePath}`,
    );

    // run ディレクトリ内に収まっているか確認
    const runPrefix = runAbsPath.endsWith("/") ? runAbsPath : `${runAbsPath}/`;
    if (!absPath.startsWith(runPrefix)) {
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    }

    const file = Bun.file(absPath);
    if (!(await file.exists())) {
      return problem(c, { title: "File not found", status: STATUS_404 });
    }

    const fileName = absPath.split("/").pop() ?? "";
    if (!isTextExtension(fileName)) {
      return problem(c, {
        title: "Only text files are supported",
        status: STATUS_415,
      });
    }

    const content = await file.text();
    const contentType = fileName.endsWith(".json")
      ? "application/json"
      : "text/plain; charset=utf-8";

    const headers: Record<string, string> = { "Content-Type": contentType };
    if (isVoicevoxTextFile(fileName)) {
      headers.ETag = await computeETag(content);
    }

    return new Response(content, { headers });
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, { title: "Failed to read file", status: STATUS_500 });
  }
});

// ===== PUT /api/runs/:projectId/:runId/file?path=... =====

runsRouter.put("/:projectId/:runId/file", async (c) => {
  const projectId = c.req.param("projectId");
  const runId = c.req.param("runId");
  const filePath = c.req.query("path");

  if (!isValidProjectId(projectId)) {
    return problem(c, { title: "Invalid projectId", status: STATUS_400 });
  }
  if (!isValidRunId(runId)) {
    return problem(c, { title: "Invalid runId", status: STATUS_400 });
  }
  if (!filePath) {
    return problem(c, {
      title: "Missing path query parameter",
      status: STATUS_400,
    });
  }

  const fileName = filePath.split("/").pop() ?? "";
  if (!isVoicevoxTextFile(fileName)) {
    return problem(c, {
      title: "Forbidden",
      status: STATUS_403,
      detail: "Only voicevox_text.json files can be edited",
      errorCode: "EDIT_NOT_ALLOWED",
    });
  }

  const ifMatch = c.req.header("If-Match");
  if (!ifMatch) {
    return problem(c, {
      title: "If-Match header is required",
      status: STATUS_400,
      errorCode: "IF_MATCH_REQUIRED",
    });
  }

  try {
    const absPath = await safeResolve(
      `data/projects/${projectId}/${runId}/${filePath}`,
    );

    const file = Bun.file(absPath);
    if (!(await file.exists())) {
      return problem(c, { title: "File not found", status: STATUS_404 });
    }

    const currentContent = await file.text();
    const currentETag = await computeETag(currentContent);

    if (ifMatch !== currentETag) {
      return problem(c, {
        title: "ETag mismatch",
        status: STATUS_409,
        detail: "The file has been modified since you last read it",
        errorCode: "ETAG_MISMATCH",
      });
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return problem(c, { title: "Invalid JSON body", status: STATUS_400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return problem(c, { title: "Expected object body", status: STATUS_400 });
    }

    const updates = (body as Record<string, unknown>).utterances;
    if (!Array.isArray(updates)) {
      return problem(c, {
        title: "Expected utterances array in body",
        status: STATUS_400,
      });
    }

    // 更新マップを構築（utterance_id → {text?, pause_length_ms?}）
    type UtteranceUpdate = { text?: string; pause_length_ms?: number };
    const updateMap = new Map<string, UtteranceUpdate>();
    for (const u of updates) {
      if (
        !u ||
        typeof u !== "object" ||
        typeof (u as Record<string, unknown>).utterance_id !== "string"
      ) {
        return problem(c, {
          title: "Invalid utterance entry",
          status: STATUS_400,
          detail: "Each utterance must have utterance_id string",
        });
      }
      const rec = u as Record<string, unknown>;
      const upd: UtteranceUpdate = {};
      if ("text" in rec) {
        if (
          typeof rec.text !== "string" ||
          rec.text.length === 0 ||
          rec.text.length > 200
        ) {
          return problem(c, {
            title: "Invalid text value",
            status: STATUS_400,
            detail: "text must be a non-empty string up to 200 chars",
          });
        }
        upd.text = rec.text;
      }
      if ("pause_length_ms" in rec) {
        if (
          typeof rec.pause_length_ms !== "number" ||
          !Number.isInteger(rec.pause_length_ms) ||
          rec.pause_length_ms < 0 ||
          rec.pause_length_ms > 2000
        ) {
          return problem(c, {
            title: "Invalid pause_length_ms value",
            status: STATUS_400,
            detail: "pause_length_ms must be an integer between 0 and 2000",
          });
        }
        upd.pause_length_ms = rec.pause_length_ms;
      }
      updateMap.set(rec.utterance_id as string, upd);
    }

    // 既存データに text / pause_length_ms のみ適用
    type Utterance = {
      utterance_id: string;
      text: string;
      pause_length_ms: number;
    } & Record<string, unknown>;
    const current = JSON.parse(currentContent) as {
      utterances: Utterance[];
    } & Record<string, unknown>;
    const updatedUtterances = current.utterances.map((u) => {
      const upd = updateMap.get(u.utterance_id);
      if (!upd) return u;
      return {
        ...u,
        ...(upd.text !== undefined && { text: upd.text }),
        ...(upd.pause_length_ms !== undefined && {
          pause_length_ms: upd.pause_length_ms,
        }),
      };
    });

    const updatedData = { ...current, utterances: updatedUtterances };
    const updatedContent = `${JSON.stringify(updatedData, null, 2)}\n`;

    // tmp ファイルへ書き込んで rename（原子的更新）
    const tmpPath = `${absPath}.tmp`;
    await Bun.write(tmpPath, updatedContent);
    await rename(tmpPath, absPath);

    const newETag = await computeETag(updatedContent);
    return new Response(updatedContent, {
      headers: { "Content-Type": "application/json", ETag: newETag },
    });
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, { title: "Failed to update file", status: STATUS_500 });
  }
});
