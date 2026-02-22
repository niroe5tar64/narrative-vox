import { readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import { config } from "../config.ts";
import {
  problem,
  STATUS_400,
  STATUS_403,
  STATUS_404,
  STATUS_409,
  STATUS_422,
  STATUS_500,
} from "../lib/problem.ts";
import { SafePathError, safeResolve } from "../lib/safe-path.ts";
import { validateConfig } from "../lib/validate.ts";
import type { AppVariables } from "../types.ts";

export const configsRouter = new Hono<{ Variables: AppVariables }>();

// ===== ユーティリティ =====

/** ファイル名キーのバリデーションパターン（パストラバーサル対策） */
const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function isValidKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

async function listJsonFiles(
  dirRelPath: string,
  exclude?: (f: string) => boolean,
): Promise<unknown[]> {
  const dirPath = join(config.repoRoot, dirRelPath);
  const files = await readdir(dirPath);
  const items = await Promise.all(
    files
      .filter((f) => f.endsWith(".json") && !f.startsWith(".") && !exclude?.(f))
      .sort()
      .map(async (f) => Bun.file(join(dirPath, f)).json()),
  );
  return items;
}

async function readJsonFile(
  relPath: string,
): Promise<{ data: unknown; absPath: string } | null> {
  const absPath = await safeResolve(relPath);
  const file = Bun.file(absPath);
  if (!(await file.exists())) return null;
  return { data: await file.json(), absPath };
}

async function writeJsonFile(relPath: string, data: unknown): Promise<void> {
  const absPath = await safeResolve(relPath);
  await Bun.write(absPath, `${JSON.stringify(data, null, 2)}\n`);
}

async function parseBody(
  c: Parameters<typeof problem>[0],
): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  try {
    return { ok: true, body: await c.req.json() };
  } catch {
    return {
      ok: false,
      res: problem(c, { title: "Invalid JSON body", status: STATUS_400 }),
    };
  }
}

async function runValidation(
  c: Parameters<typeof problem>[0],
  data: unknown,
  schemaName: string,
): Promise<{ ok: true } | { ok: false; res: Response }> {
  let errors: string[] | null;
  try {
    errors = await validateConfig(data, schemaName);
  } catch {
    return {
      ok: false,
      res: problem(c, {
        title: "Internal validation error",
        status: STATUS_500,
      }),
    };
  }
  if (errors) {
    return {
      ok: false,
      res: problem(c, {
        title: "Validation failed",
        status: STATUS_422,
        details: errors,
      }),
    };
  }
  return { ok: true };
}

// ===== Characters API =====

configsRouter.get("/characters", async (c) => {
  try {
    const items = await listJsonFiles("configs/content/characters");
    return c.json({ items });
  } catch {
    return problem(c, {
      title: "Failed to list characters",
      status: STATUS_500,
    });
  }
});

configsRouter.get("/characters/:key", async (c) => {
  const key = c.req.param("key");
  if (!isValidKey(key)) {
    return problem(c, {
      title: "Invalid key",
      status: STATUS_400,
      detail: "Key must match [a-z0-9][a-z0-9_-]*",
    });
  }
  try {
    const result = await readJsonFile(`configs/content/characters/${key}.json`);
    if (!result)
      return problem(c, { title: "Character not found", status: STATUS_404 });
    return c.json(result.data);
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, {
      title: "Failed to read character",
      status: STATUS_500,
    });
  }
});

configsRouter.post("/characters", async (c) => {
  const parsed = await parseBody(c);
  if (!parsed.ok) return parsed.res;

  const validation = await runValidation(c, parsed.body, "character");
  if (!validation.ok) return validation.res;

  const key = (parsed.body as { key: string }).key;
  try {
    const relPath = `configs/content/characters/${key}.json`;
    const existing = await readJsonFile(relPath);
    if (existing) {
      return problem(c, {
        title: "Character already exists",
        status: STATUS_409,
        detail: `Character "${key}" already exists. Use PUT to update.`,
      });
    }
    await writeJsonFile(relPath, parsed.body);
    return c.json(parsed.body, 201);
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, {
      title: "Failed to create character",
      status: STATUS_500,
    });
  }
});

configsRouter.put("/characters/:key", async (c) => {
  const key = c.req.param("key");
  if (!isValidKey(key)) {
    return problem(c, {
      title: "Invalid key",
      status: STATUS_400,
      detail: "Key must match [a-z0-9][a-z0-9_-]*",
    });
  }

  const parsed = await parseBody(c);
  if (!parsed.ok) return parsed.res;

  const bodyKey = (parsed.body as { key?: string }).key;
  if (bodyKey && bodyKey !== key) {
    return problem(c, {
      title: "Key mismatch",
      status: STATUS_400,
      detail: "Body 'key' must match URL parameter",
    });
  }

  const validation = await runValidation(c, parsed.body, "character");
  if (!validation.ok) return validation.res;

  try {
    const relPath = `configs/content/characters/${key}.json`;
    const existing = await readJsonFile(relPath);
    if (!existing)
      return problem(c, { title: "Character not found", status: STATUS_404 });
    await writeJsonFile(relPath, parsed.body);
    return c.json(parsed.body);
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, {
      title: "Failed to update character",
      status: STATUS_500,
    });
  }
});

configsRouter.delete("/characters/:key", async (c) => {
  const key = c.req.param("key");
  if (!isValidKey(key)) {
    return problem(c, { title: "Invalid key", status: STATUS_400 });
  }
  try {
    const relPath = `configs/content/characters/${key}.json`;
    const result = await readJsonFile(relPath);
    if (!result)
      return problem(c, { title: "Character not found", status: STATUS_404 });
    await unlink(result.absPath);
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, {
      title: "Failed to delete character",
      status: STATUS_500,
    });
  }
});

// ===== Projects API =====

configsRouter.get("/projects", async (c) => {
  try {
    const items = await listJsonFiles("configs/pipeline/projects", (f) =>
      f.endsWith(".example.json"),
    );
    return c.json({ items });
  } catch {
    return problem(c, { title: "Failed to list projects", status: STATUS_500 });
  }
});

configsRouter.get("/projects/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidKey(id)) {
    return problem(c, {
      title: "Invalid project id",
      status: STATUS_400,
      detail: "ID must match [a-z0-9][a-z0-9_-]*",
    });
  }
  try {
    const result = await readJsonFile(`configs/pipeline/projects/${id}.json`);
    if (!result)
      return problem(c, { title: "Project not found", status: STATUS_404 });
    return c.json(result.data);
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, { title: "Failed to read project", status: STATUS_500 });
  }
});

configsRouter.post("/projects", async (c) => {
  const parsed = await parseBody(c);
  if (!parsed.ok) return parsed.res;

  const validation = await runValidation(c, parsed.body, "project-config");
  if (!validation.ok) return validation.res;

  const id = (parsed.body as { PROJECT_ID: string }).PROJECT_ID;
  if (!isValidKey(id)) {
    return problem(c, {
      title: "Invalid PROJECT_ID",
      status: STATUS_422,
      detail: "PROJECT_ID must match [a-z0-9][a-z0-9_-]*",
    });
  }

  try {
    const relPath = `configs/pipeline/projects/${id}.json`;
    const existing = await readJsonFile(relPath);
    if (existing) {
      return problem(c, {
        title: "Project already exists",
        status: STATUS_409,
        detail: `Project "${id}" already exists. Use PUT to update.`,
      });
    }
    await writeJsonFile(relPath, parsed.body);
    return c.json(parsed.body, 201);
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, {
      title: "Failed to create project",
      status: STATUS_500,
    });
  }
});

configsRouter.put("/projects/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidKey(id)) {
    return problem(c, { title: "Invalid project id", status: STATUS_400 });
  }

  const parsed = await parseBody(c);
  if (!parsed.ok) return parsed.res;

  const bodyId = (parsed.body as { PROJECT_ID?: string }).PROJECT_ID;
  if (bodyId && bodyId !== id) {
    return problem(c, {
      title: "ID mismatch",
      status: STATUS_400,
      detail: "Body 'PROJECT_ID' must match URL parameter",
    });
  }

  const validation = await runValidation(c, parsed.body, "project-config");
  if (!validation.ok) return validation.res;

  try {
    const relPath = `configs/pipeline/projects/${id}.json`;
    const existing = await readJsonFile(relPath);
    if (!existing)
      return problem(c, { title: "Project not found", status: STATUS_404 });
    await writeJsonFile(relPath, parsed.body);
    return c.json(parsed.body);
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, {
      title: "Failed to update project",
      status: STATUS_500,
    });
  }
});

configsRouter.delete("/projects/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidKey(id)) {
    return problem(c, { title: "Invalid project id", status: STATUS_400 });
  }
  try {
    const relPath = `configs/pipeline/projects/${id}.json`;
    const result = await readJsonFile(relPath);
    if (!result)
      return problem(c, { title: "Project not found", status: STATUS_404 });
    await unlink(result.absPath);
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, {
      title: "Failed to delete project",
      status: STATUS_500,
    });
  }
});

// ===== Styles API (read-only) =====

configsRouter.get("/styles", async (c) => {
  try {
    const items = await listJsonFiles("configs/content/styles");
    return c.json({ items });
  } catch {
    return problem(c, { title: "Failed to list styles", status: STATUS_500 });
  }
});

configsRouter.get("/styles/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidKey(id)) {
    return problem(c, { title: "Invalid style id", status: STATUS_400 });
  }
  try {
    const result = await readJsonFile(`configs/content/styles/${id}.json`);
    if (!result)
      return problem(c, { title: "Style not found", status: STATUS_404 });
    return c.json(result.data);
  } catch (e) {
    if (e instanceof SafePathError)
      return problem(c, { title: "Forbidden", status: STATUS_403 });
    return problem(c, { title: "Failed to read style", status: STATUS_500 });
  }
});

// ===== Genres API (read-only) =====

configsRouter.get("/genres", async (c) => {
  try {
    const items = await listJsonFiles("configs/content/genres");
    return c.json({ items });
  } catch {
    return problem(c, { title: "Failed to list genres", status: STATUS_500 });
  }
});

// ===== VOICEVOX Config API =====

type VoicevoxConfigEntry = {
  relPath: string;
  schemaName: string | null; // nullはスキーマ検証なし（valid JSONのみ）
};

const VOICEVOX_CONFIGS: Record<string, VoicevoxConfigEntry> = {
  "synthesis-defaults": {
    relPath: "configs/voice/voicevox/synthesis-defaults.json",
    schemaName: null,
  },
  "build-text-config": {
    relPath: "configs/voice/voicevox/build-text-config.json",
    schemaName: "build-text-config",
  },
  "speed-profiles": {
    relPath: "configs/voice/voicevox/speed-profiles.json",
    schemaName: "speed-profiles",
  },
  "reading-dictionary": {
    relPath: "configs/voice/voicevox/reading-dictionary.json",
    schemaName: "reading-dictionary",
  },
  "user-dict": {
    relPath: "configs/voice/voicevox/user-dict.json",
    schemaName: null,
  },
};

for (const [name, entry] of Object.entries(VOICEVOX_CONFIGS)) {
  configsRouter.get(`/voice/voicevox/${name}`, async (c) => {
    try {
      const result = await readJsonFile(entry.relPath);
      if (!result)
        return problem(c, { title: `${name} not found`, status: STATUS_404 });
      return c.json(result.data);
    } catch (e) {
      if (e instanceof SafePathError)
        return problem(c, { title: "Forbidden", status: STATUS_403 });
      return problem(c, {
        title: `Failed to read ${name}`,
        status: STATUS_500,
      });
    }
  });

  configsRouter.put(`/voice/voicevox/${name}`, async (c) => {
    const parsed = await parseBody(c);
    if (!parsed.ok) return parsed.res;

    if (entry.schemaName) {
      const validation = await runValidation(c, parsed.body, entry.schemaName);
      if (!validation.ok) return validation.res;
    }

    try {
      await writeJsonFile(entry.relPath, parsed.body);
      return c.json(parsed.body);
    } catch (e) {
      if (e instanceof SafePathError)
        return problem(c, { title: "Forbidden", status: STATUS_403 });
      return problem(c, {
        title: `Failed to update ${name}`,
        status: STATUS_500,
      });
    }
  });
}
