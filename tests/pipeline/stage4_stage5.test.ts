import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runStage4 } from "../../src/pipeline/stage4_voicevox_text.ts";
import { runStage5 } from "../../src/pipeline/stage5_voicevox_import.ts";

interface Stage4JsonTest {
  meta: {
    episode_id: string;
    run_id: string;
  };
  utterances: Array<{ utterance_id: string; text: string }>;
  dictionary_candidates: Array<{ surface: string; reading_or_empty: string }>;
  quality_checks: {
    speakability: {
      score: number;
      average_chars_per_utterance: number;
      long_utterance_ratio: number;
      terminal_punctuation_ratio: number;
    };
    warnings: string[];
  };
}

interface Stage5JsonTest {
  talk: {
    audioKeys: string[];
    audioItems: Record<
      string,
      {
        text: string;
        voice: {
          engineId: string;
          speakerId: string;
          styleId: number;
        };
        query?: {
          accentPhrases: unknown[];
          speedScale: number;
          pitchScale: number;
          intonationScale: number;
          volumeScale: number;
          pauseLengthScale: number;
          prePhonemeLength: number;
          postPhonemeLength: number;
          outputSamplingRate: number | "engineDefault";
          outputStereo: boolean;
          kana?: string;
        };
      }
    >;
  };
}

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

  const stage4Json = JSON.parse(await readFile(stage4.stage4JsonPath, "utf-8")) as Stage4JsonTest;
  assert.equal(stage4Json.meta.episode_id, "E01");
  assert.ok(stage4Json.utterances.length > 0);
  assert.equal(stage4Json.quality_checks.speakability.score >= 0, true);
  assert.equal(stage4Json.quality_checks.speakability.score <= 100, true);

  const stage5 = await runStage5({
    stage4JsonPath: stage4.stage4JsonPath,
    outDir,
    profilePath: path.resolve("configs/voicevox/default_profile.example.json")
  });

  const stage5Json = JSON.parse(await readFile(stage5.importJsonPath, "utf-8")) as Stage5JsonTest;
  assert.equal(stage5Json.talk.audioKeys.length, stage4Json.utterances.length);
  assert.ok(stage5Json.talk.audioItems[stage5Json.talk.audioKeys[0]]);
});

test("stage5 prefill-query=minimal adds query defaults to every audio item", async () => {
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

  const stage5 = await runStage5({
    stage4JsonPath: stage4.stage4JsonPath,
    outDir,
    profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
    prefillQuery: "minimal"
  });

  const stage5Json = JSON.parse(await readFile(stage5.importJsonPath, "utf-8")) as Stage5JsonTest;
  assert.equal(stage5Json.talk.audioKeys.length > 0, true);

  for (const audioKey of stage5Json.talk.audioKeys) {
    const audioItem = stage5Json.talk.audioItems[audioKey];
    assert.ok(audioItem);
    assert.ok(audioItem.query);
    assert.deepEqual(audioItem.query?.accentPhrases, []);
    assert.equal(audioItem.query?.speedScale, 1);
    assert.equal(audioItem.query?.pitchScale, 0);
    assert.equal(audioItem.query?.intonationScale, 1);
    assert.equal(audioItem.query?.volumeScale, 1);
    assert.equal(audioItem.query?.pauseLengthScale, 1);
    assert.equal(audioItem.query?.prePhonemeLength, 0.1);
    assert.equal(audioItem.query?.postPhonemeLength, 0.1);
    assert.equal(audioItem.query?.outputSamplingRate, "engineDefault");
    assert.equal(audioItem.query?.outputStereo, false);
  }
});

test("stage5 rejects unsupported prefill-query mode", async () => {
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

  await assert.rejects(
    () =>
      runStage5({
        stage4JsonPath: stage4.stage4JsonPath,
        outDir,
        profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
        prefillQuery: "invalid" as "minimal"
      }),
    /Expected one of: none, minimal/
  );
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

  const stage4Json = JSON.parse(await readFile(stage4.stage4JsonPath, "utf-8")) as Stage4JsonTest;
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

  const stage4Json = JSON.parse(await readFile(stage4.stage4JsonPath, "utf-8")) as Stage4JsonTest;
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

test("stage4 extracts dictionary candidates with readings from morphological analysis", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const outDir = path.join(tempRoot, "introducing-rescript", "run-20260211-3333");
  await mkdir(outDir, { recursive: true });

  const scriptPath = path.join(tempRoot, "E99_script.md");
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      "検証の流れを整理する。",
      "APIの挙動も検証する。",
      "合計想定時間: 1分"
    ].join("\n"),
    "utf-8"
  );

  const stage4 = await runStage4({
    scriptPath,
    outDir,
    episodeId: "E99",
    projectId: "introducing-rescript",
    runId: "run-20260211-3333"
  });

  const stage4Json = JSON.parse(await readFile(stage4.stage4JsonPath, "utf-8")) as Stage4JsonTest;
  const dictionary = stage4Json.dictionary_candidates;

  const kensho = dictionary.find((item: { surface: string; reading_or_empty: string }) => item.surface === "検証");
  assert.ok(kensho);
  assert.equal(kensho.reading_or_empty.length > 0, true);

  const api = dictionary.find((item: { surface: string; reading_or_empty: string }) => item.surface === "API");
  assert.ok(api);
  assert.equal(api.reading_or_empty, "エーピーアイ");
});

test("stage4 adds warning when speakability score is low", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const outDir = path.join(tempRoot, "introducing-rescript", "run-20260211-4444");
  await mkdir(outDir, { recursive: true });

  const scriptPath = path.join(tempRoot, "E98_script.md");
  const lowSpeakabilityLine = `${"a".repeat(53)}、${"a".repeat(60)}`;
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      lowSpeakabilityLine,
      "合計想定時間: 1分"
    ].join("\n"),
    "utf-8"
  );

  const stage4 = await runStage4({
    scriptPath,
    outDir,
    episodeId: "E98",
    projectId: "introducing-rescript",
    runId: "run-20260211-4444"
  });

  const stage4Json = JSON.parse(await readFile(stage4.stage4JsonPath, "utf-8")) as Stage4JsonTest;
  assert.equal(stage4Json.quality_checks.speakability.score < 70, true);
  assert.equal(
    stage4Json.quality_checks.warnings.some((message) => message.includes("Speakability score is low")),
    true
  );
});
