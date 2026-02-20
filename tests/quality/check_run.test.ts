import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { test } from "bun:test";
import { checkRun } from "../../src/quality/check_run.ts";

const sampleRunDir = path.resolve("tests/fixtures/sample-run");
const ENGINE_ID = "074fc39e-678b-4c13-8916-ffca8d505d1d";
const SPEAKER_ID = "04dbd989-32d0-40b4-9e71-17c920f2a8a9";
const STYLE_ID = 67;

async function withMockVoicevoxServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve mock VOICEVOX server address");
    }
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function buildValidScript(): string {
  return [
    "## 1. オープニング",
    "導入です。",
    "## 2. 前提を呼び起こす",
    "前提です。",
    "## 3. 結論を先に提示",
    "結論です。"
  ].join("\n");
}

function buildScriptWithManySections(): string {
  const lines: string[] = [];
  for (let i = 1; i <= 12; i++) {
    lines.push(`## ${i}. セクション${i}`);
    lines.push(`セクション${i}の内容です。`);
  }
  return lines.join("\n");
}

const sampleMaterial = {
  schema_version: "1.0",
  meta: {
    project_id: "test",
    episode_id: "E01",
    episode_title: "テスト",
    genre: "study",
    audience: {
      background: "テスト",
      level: "テスト",
      interest: "テスト"
    }
  },
  sections: [
    {
      section_id: "S01",
      section: "テスト1",
      goal: "テスト",
      elements: [
        { element_id: "EL001", type: "theme_introduction", content: "テスト", importance: "must" }
      ]
    },
    {
      section_id: "S02",
      section: "テスト2",
      goal: "テスト",
      elements: [
        { element_id: "EL002", type: "concept", content: "テスト", importance: "must" }
      ]
    },
    {
      section_id: "S03",
      section: "テスト3",
      goal: "テスト",
      elements: [
        { element_id: "EL003", type: "takeaway", content: "テスト", importance: "must" }
      ]
    }
  ],
  quality_checks: {
    source_coverage: "OK",
    element_dependency_valid: "OK",
    importance_distribution: { must: 3, should: 0, optional: 0 }
  }
};

async function prepareMinimalRun(
  materialEpisodeIds: string[],
  scriptScripts: Record<string, string>
): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-run-"));
  const runDir = path.join(tempRoot, "projects", "book", "run-20260211-9999");

  const blueprintDir = path.join(runDir, "blueprint");
  const materialDir = path.join(runDir, "material");
  const scriptDir = path.join(runDir, "script");
  await mkdir(blueprintDir, { recursive: true });
  await mkdir(materialDir, { recursive: true });
  await mkdir(scriptDir, { recursive: true });

  const blueprintRaw = await readFile(path.join(sampleRunDir, "blueprint", "project_blueprint.json"), "utf-8");
  await writeFile(path.join(blueprintDir, "project_blueprint.json"), blueprintRaw, "utf-8");

  for (const episodeId of materialEpisodeIds) {
    const data = {
      ...sampleMaterial,
      meta: {
        ...sampleMaterial.meta,
        episode_id: episodeId
      }
    };
    await writeFile(
      path.join(materialDir, `${episodeId}_material.json`),
      `${JSON.stringify(data, null, 2)}\n`,
      "utf-8"
    );
  }

  for (const [episodeId, scriptText] of Object.entries(scriptScripts)) {
    await writeFile(path.join(scriptDir, `${episodeId}_script.md`), scriptText, "utf-8");
  }

  return runDir;
}

async function updateBlueprintEpisodePlan(
  runDir: string,
  updater: (
    episodePlan: Array<Record<string, unknown>>
  ) => Array<Record<string, unknown>>
): Promise<void> {
  const blueprintPath = path.join(runDir, "blueprint", "project_blueprint.json");
  const raw = await readFile(blueprintPath, "utf-8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const episodePlan = parsed.episode_plan;
  if (!Array.isArray(episodePlan)) {
    throw new Error("blueprint.episode_plan must be an array");
  }
  parsed.episode_plan = updater(episodePlan as Array<Record<string, unknown>>);
  await writeFile(blueprintPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
}

test("checkRun accepts current sample run", async () => {
  await withMockVoicevoxServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && requestUrl.pathname === "/version") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('"0.25.1"');
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  }, async (voicevoxApiUrl) => {
    const result = await checkRun({
      runDir: sampleRunDir,
      engineId: ENGINE_ID,
      speakerId: SPEAKER_ID,
      styleId: STYLE_ID,
      profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
      voicevoxApiUrl
    });

    assert.equal(result.materialEpisodeCount > 0, true);
    assert.equal(result.materialEpisodeCount, result.scriptEpisodeCount);
    assert.equal(result.validatedEpisodeIds[0], "E01");
  });
});

test("checkRun accepts script with any number of sections", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildScriptWithManySections() });
  await withMockVoicevoxServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && requestUrl.pathname === "/version") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('"0.25.1"');
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  }, async (voicevoxApiUrl) => {
    const result = await checkRun({
      runDir,
      engineId: ENGINE_ID,
      speakerId: SPEAKER_ID,
      styleId: STYLE_ID,
      profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
      voicevoxApiUrl
    });
    assert.deepEqual(result.validatedEpisodeIds, ["E01"]);
  });
});

test("checkRun rejects episode mismatch between material and script", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript(),
    E02: buildValidScript()
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /script has episodes not in material: E02/
  );
});

test("checkRun rejects empty script", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: ""
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /is empty/
  );
});

test("checkRun rejects script without section headings", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: "導入です。\n結論です。"
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /has no section headings/
  );
});

test("checkRun accepts script with markdown heading style section lines", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript()
  });

  await withMockVoicevoxServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && requestUrl.pathname === "/version") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('"0.25.1"');
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  }, async (voicevoxApiUrl) => {
    const result = await checkRun({
      runDir,
      engineId: ENGINE_ID,
      speakerId: SPEAKER_ID,
      styleId: STYLE_ID,
      profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
      voicevoxApiUrl
    });
    assert.deepEqual(result.validatedEpisodeIds, ["E01"]);
  });
});

test("checkRun rejects self-referenced prerequisite_episodes", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript()
  });

  await updateBlueprintEpisodePlan(runDir, (episodePlan) =>
    episodePlan.map((episode) => {
      if (episode.episode_id === "E01") {
        return {
          ...episode,
          prerequisite_episodes: ["E01"]
        };
      }
      return episode;
    })
  );

  await assert.rejects(
    () => checkRun({ runDir }),
    /cannot list itself in prerequisite_episodes/
  );
});

test("checkRun rejects duplicate prerequisite_episodes", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript()
  });

  await updateBlueprintEpisodePlan(runDir, (episodePlan) =>
    episodePlan.map((episode) => {
      if (episode.episode_id === "E02") {
        return {
          ...episode,
          prerequisite_episodes: ["E01", "E01"]
        };
      }
      return episode;
    })
  );

  await assert.rejects(
    () => checkRun({ runDir }),
    /has duplicate prerequisite_episodes: E01/
  );
});

test("checkRun rejects prerequisite_episodes that reference missing episodes", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript()
  });

  await updateBlueprintEpisodePlan(runDir, (episodePlan) =>
    episodePlan.map((episode) => {
      if (episode.episode_id === "E01") {
        return {
          ...episode,
          prerequisite_episodes: ["E99"]
        };
      }
      return episode;
    })
  );

  await assert.rejects(
    () => checkRun({ runDir }),
    /references missing prerequisite_episodes: E99/
  );
});

test("checkRun rejects cyclic prerequisite_episodes", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript()
  });

  await updateBlueprintEpisodePlan(runDir, (episodePlan) =>
    episodePlan.map((episode) => {
      if (episode.episode_id === "E01") {
        return {
          ...episode,
          prerequisite_episodes: ["E02"]
        };
      }
      if (episode.episode_id === "E02") {
        return {
          ...episode,
          prerequisite_episodes: ["E01"]
        };
      }
      return episode;
    })
  );

  await assert.rejects(
    () => checkRun({ runDir }),
    /prerequisite_episodes has a cycle: E01 -> E02 -> E01|prerequisite_episodes has a cycle: E02 -> E01 -> E02/
  );
});
