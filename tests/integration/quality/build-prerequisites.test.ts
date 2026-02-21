import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { validateBuildPrerequisites } from "@narrative-vox/quality/build-prerequisites.ts";

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

test("validateBuildPrerequisites passes with explicit voice triple", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-prereq-"));
  const scriptPath = path.join(tempDir, "E01_script.md");
  await writeFile(scriptPath, "1. 導入\nこれはテストです。", "utf-8");

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
    const result = await validateBuildPrerequisites({
      scriptPaths: [scriptPath],
      synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
      engineId: ENGINE_ID,
      speakerId: SPEAKER_ID,
      styleId: STYLE_ID,
      voicevoxApiUrl
    });

    assert.equal(result.scriptCount, 1);
    assert.deepEqual(result.speakerKeys, []);
    assert.equal(result.resolvedVoicevoxApiUrl, voicevoxApiUrl);
  });
});

test("validateBuildPrerequisites reports aggregated errors", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-prereq-"));
  const scriptPath = path.join(tempDir, "E01_script.md");
  await writeFile(scriptPath, "1. 導入\nこれはテストです。", "utf-8");

  await assert.rejects(
    () =>
      validateBuildPrerequisites({
        scriptPaths: [scriptPath],
        synthesisDefaultsPath: path.join(tempDir, "missing-synthesis-defaults.json"),
        voicevoxApiUrl: "http://127.0.0.1:9"
      }),
    /Build prerequisites failed:[\s\S]*missing-synthesis-defaults\.json[\s\S]*Voice must be specified explicitly[\s\S]*VOICEVOX Engine is not reachable/
  );
});

test("validateBuildPrerequisites rejects unknown speaker_key in scripts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-prereq-"));
  const scriptPath = path.join(tempDir, "E01_script.md");
  await writeFile(scriptPath, "1. 導入\n[speaker:ghost] これは誰ですか？", "utf-8");

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
    await assert.rejects(
      () =>
        validateBuildPrerequisites({
          scriptPaths: [scriptPath],
          synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
          voicevoxApiUrl
        }),
      /Unknown character_key "ghost"/
    );
  });
});
