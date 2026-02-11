import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runStage4 } from "../../src/pipeline/stage4_voicevox_text.js";
import { runStage5 } from "../../src/pipeline/stage5_voicevox_import.js";

test("stage4 -> stage5 pipeline works with sample script", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const outDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(outDir, { recursive: true });

  const scriptPath = path.resolve(
    "projects/introducing-rescript/run-20260211-0000/stage3/E01_script.md"
  );

  const stage4 = await runStage4({
    scriptPath,
    outDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-test"
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
