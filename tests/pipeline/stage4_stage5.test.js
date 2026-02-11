import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runStage4 } from "../../src/pipeline/stage4_voicevox_text.js";
import { runStage5 } from "../../src/pipeline/stage5_voicevox_import.js";

const sampleScriptPath = path.resolve(
  "projects/introducing-rescript/run-20260211-0000/stage3/E01_script.md"
);

test("stage4 -> stage5 pipeline works with sample script", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const outDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(outDir, { recursive: true });

  const stage4 = await runStage4({
    scriptPath: sampleScriptPath,
    outDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  const stage4Json = JSON.parse(await readFile(stage4.stage4JsonPath, "utf-8"));
  assert.equal(stage4Json.meta.episode_id, "E01");
  assert.ok(stage4Json.utterances.length > 0);

  const stage5 = await runStage5({
    stage4JsonPath: stage4.stage4JsonPath,
    outDir,
    profilePath: path.resolve("configs/voicevox/default_profile.example.json")
  });

  const stage5Json = JSON.parse(await readFile(stage5.importJsonPath, "utf-8"));
  assert.equal(stage5Json.talk.audioKeys.length, stage4Json.utterances.length);
  assert.ok(stage5Json.talk.audioItems[stage5Json.talk.audioKeys[0]]);
});

test("stage4 uses run_id from out-dir path when --run-id is omitted", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const outDir = path.join(tempRoot, "introducing-rescript", "run-20260211-2222", "artifacts");
  await mkdir(outDir, { recursive: true });

  const stage4 = await runStage4({
    scriptPath: sampleScriptPath,
    outDir,
    episodeId: "E01",
    projectId: "introducing-rescript"
  });

  const stage4Json = JSON.parse(await readFile(stage4.stage4JsonPath, "utf-8"));
  assert.equal(stage4Json.meta.run_id, "run-20260211-2222");
});

test("stage4 auto-generates run_id when not found in --out-dir", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const outDir = path.join(tempRoot, "introducing-rescript", "output");
  await mkdir(outDir, { recursive: true });

  const stage4 = await runStage4({
    scriptPath: sampleScriptPath,
    outDir,
    episodeId: "E01",
    projectId: "introducing-rescript"
  });

  const stage4Json = JSON.parse(await readFile(stage4.stage4JsonPath, "utf-8"));
  assert.match(stage4Json.meta.run_id, /^run-\d{8}-\d{4}$/);
});

test("stage4 rejects invalid --run-id format with expected pattern in message", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const outDir = path.join(tempRoot, "introducing-rescript", "run-20260211-0000");
  await mkdir(outDir, { recursive: true });

  await assert.rejects(
    () =>
      runStage4({
        scriptPath: sampleScriptPath,
        outDir,
        episodeId: "E01",
        projectId: "introducing-rescript",
        runId: "run-2026-02-11-1234"
      }),
    /run-YYYYMMDD-HHMM/
  );
});
