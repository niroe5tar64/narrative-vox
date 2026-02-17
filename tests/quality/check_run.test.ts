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

function buildScriptFromSectionOrder(sectionOrder: number[]): string {
  const sectionTitles: Record<number, string> = {
    1: "オープニング",
    2: "前提を呼び起こす",
    3: "結論を先に提示",
    4: "概念の最小モデル説明",
    5: "構造の捉え方",
    6: "思考を促す問いかけ",
    7: "実務への接続",
    8: "まとめ"
  };
  const lines: string[] = [];
  for (const sectionId of sectionOrder) {
    const title = sectionTitles[sectionId] ?? `セクション${sectionId}`;
    lines.push(`${sectionId}. ${title}`);
    lines.push(`${title}です。`);
  }
  return lines.join("\n");
}

function buildValidScript(): string {
  return buildScriptFromSectionOrder([1, 2, 3, 4, 5, 6, 7, 8]);
}

function buildValidScriptWithMarkdownHeadings(): string {
  return [
    "## 1. オープニング",
    "導入です。",
    "## 2. 前提を呼び起こす",
    "前提です。",
    "## 3. 結論を先に提示",
    "結論です。",
    "## 4. 概念の最小モデル説明",
    "説明です。",
    "## 5. 構造の捉え方",
    "整理します。",
    "## 6. 思考を促す問いかけ",
    "問いです。",
    "## 7. 実務への接続",
    "接続です。",
    "## 8. まとめ",
    "まとめです。"
  ].join("\n");
}

async function prepareMinimalRun(
  variablesEpisodeIds: string[],
  scriptScripts: Record<string, string>
): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-run-"));
  const runDir = path.join(tempRoot, "projects", "book", "run-20260211-9999");

  const blueprintDir = path.join(runDir, "blueprint");
  const variablesDir = path.join(runDir, "variables");
  const scriptDir = path.join(runDir, "script");
  await mkdir(blueprintDir, { recursive: true });
  await mkdir(variablesDir, { recursive: true });
  await mkdir(scriptDir, { recursive: true });

  const blueprintRaw = await readFile(path.join(sampleRunDir, "blueprint", "project_blueprint.json"), "utf-8");
  await writeFile(path.join(blueprintDir, "project_blueprint.json"), blueprintRaw, "utf-8");

  const variablesTemplate = JSON.parse(
    await readFile(path.join(sampleRunDir, "variables", "E01_variables.json"), "utf-8")
  ) as {
    meta: { episode_id: string };
  };
  for (const episodeId of variablesEpisodeIds) {
    const data = {
      ...variablesTemplate,
      meta: {
        ...variablesTemplate.meta,
        episode_id: episodeId
      }
    };
    await writeFile(
      path.join(variablesDir, `${episodeId}_variables.json`),
      `${JSON.stringify(data, null, 2)}\n`,
      "utf-8"
    );
  }

  for (const [episodeId, scriptText] of Object.entries(scriptScripts)) {
    await writeFile(path.join(scriptDir, `${episodeId}_script.md`), scriptText, "utf-8");
  }

  return runDir;
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

    assert.equal(result.variablesEpisodeCount > 0, true);
    assert.equal(result.variablesEpisodeCount, result.scriptEpisodeCount);
    assert.equal(result.validatedEpisodeIds[0], "E01");
  });
});

test("checkRun accepts script without total-time line", async () => {
  const runDir = await prepareMinimalRun(["E01"], { E01: buildValidScript() });
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

test("checkRun rejects episode mismatch between variables and script", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScript(),
    E02: buildValidScript()
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /script has episodes not in variables: E02/
  );
});

test("checkRun rejects script with section order violation", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildScriptFromSectionOrder([1, 2, 4, 3, 5, 6, 7, 8])
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /episode: E01[\s\S]*section order violation[\s\S]*1, 2, 4, 3, 5, 6, 7, 8/
  );
});

test("checkRun rejects script with duplicate section ID", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildScriptFromSectionOrder([1, 2, 2, 3, 4, 5, 6, 7, 8])
  });

  await assert.rejects(
    () => checkRun({ runDir }),
    /episode: E01[\s\S]*duplicate section IDs: 2/
  );
});

test("checkRun accepts markdown heading style section lines", async () => {
  const runDir = await prepareMinimalRun(["E01"], {
    E01: buildValidScriptWithMarkdownHeadings()
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
