import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { patchVoicevoxText } from "@narrative-vox/application/patch-voicevox-text.ts";
import { validateAgainstSchema } from "@narrative-vox/quality/schema-validator.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import type { VoicevoxTextData } from "@narrative-vox/domain/types.ts";

const EPISODE_ID = "E01";

function makeMinimalVoicevoxTextData(): VoicevoxTextData {
  return {
    schema_version: "1.0",
    meta: {
      project_id: "test-project",
      run_id: "run-20260223-1200",
      episode_id: EPISODE_ID,
      source_script_path: "script/E01_script.md",
      generated_at: new Date().toISOString(),
    },
    utterances: [
      {
        utterance_id: "U001",
        section_id: 1,
        section_title: "導入",
        text: "詳しくは https://example.com をご覧ください。",
        pause_length_ms: 300,
      },
      {
        utterance_id: "U002",
        section_id: 1,
        section_title: "導入",
        text: "`useState` を使います。",
        pause_length_ms: 300,
      },
      {
        utterance_id: "U003",
        section_id: 1,
        section_title: "導入",
        text: "処理時間は500msです。",
        pause_length_ms: 300,
      },
    ],
    dictionary_candidates: [
      {
        surface: "useState",
        reading_or_empty: "",
        priority: "LOW",
        occurrences: 1,
        source: "token",
        note: "",
      },
    ],
    quality_checks: {
      utterance_count: 3,
      max_chars_per_utterance: 30,
      has_ruby_notation: false,
      speakability: {
        score: 80,
        average_chars_per_utterance: 20,
        long_utterance_ratio: 0,
        terminal_punctuation_ratio: 1,
      },
      warnings: [],
    },
  };
}

async function createTestRun(tempRoot: string): Promise<{
  runDir: string;
  voicevoxTextJsonPath: string;
  dictCsvPath: string;
}> {
  const runDir = path.join(tempRoot, "test-project", "run-20260223-1200");
  const voicevoxTextDir = path.join(runDir, "voicevox_text");
  const dictDir = path.join(runDir, "dict_candidates");
  await mkdir(voicevoxTextDir, { recursive: true });
  await mkdir(dictDir, { recursive: true });

  const voicevoxTextJsonPath = path.join(
    voicevoxTextDir,
    `${EPISODE_ID}_voicevox_text.json`,
  );
  const dictCsvPath = path.join(dictDir, `${EPISODE_ID}_dict_candidates.csv`);

  await writeFile(
    voicevoxTextJsonPath,
    `${JSON.stringify(makeMinimalVoicevoxTextData(), null, 2)}\n`,
    "utf-8",
  );
  await writeFile(
    dictCsvPath,
    `"surface","reading","priority","occurrences","source","note"\n"useState","","LOW","1","token",""\n`,
    "utf-8",
  );

  return { runDir, voicevoxTextJsonPath, dictCsvPath };
}

test("patchVoicevoxText: schema valid output", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-patch-test-"));
  const { voicevoxTextJsonPath } = await createTestRun(tempRoot);

  const patchConfigPath = path.join(tempRoot, "patch-config.json");
  await writeFile(
    patchConfigPath,
    JSON.stringify(
      {
        version: 1,
        text_normalization: {
          enabled: true,
          rules: [
            {
              id: "url",
              pattern: "https?://\\S+",
              replacement: "ユーアールエル",
              enabled: true,
            },
            {
              id: "inline_code_strip",
              pattern: "`([^`]+)`",
              replacement: "$1",
              enabled: true,
            },
            {
              id: "number_ms",
              pattern: "(\\d+)ms",
              replacement: "$1ミリ秒",
              enabled: true,
            },
          ],
        },
        dict_patch: {
          enabled: true,
          force_readings: [
            { surface: "API", reading: "エーピーアイ", priority: "HIGH", note: "force_patch" },
          ],
          suppress_surfaces: [],
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  const result = await patchVoicevoxText({
    voicevoxTextJsonPath,
    patchConfigPath,
  });

  const patchedData = JSON.parse(await readFile(result.patchedJsonPath, "utf-8"));
  await assert.doesNotReject(() =>
    validateAgainstSchema(patchedData, SchemaPaths.voicevoxText),
  );
});

test("patchVoicevoxText: no original overwrite", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-patch-test-"));
  const { voicevoxTextJsonPath } = await createTestRun(tempRoot);

  const originalStat = await stat(voicevoxTextJsonPath);

  const patchConfigPath = path.join(tempRoot, "patch-config.json");
  await writeFile(
    patchConfigPath,
    JSON.stringify({
      version: 1,
      text_normalization: { enabled: false, rules: [] },
      dict_patch: { enabled: false, force_readings: [], suppress_surfaces: [] },
    }),
    "utf-8",
  );

  await patchVoicevoxText({ voicevoxTextJsonPath, patchConfigPath });

  const afterStat = await stat(voicevoxTextJsonPath);
  assert.equal(
    originalStat.mtimeMs,
    afterStat.mtimeMs,
    "Original voicevox_text.json must not be modified",
  );
});

test("patchVoicevoxText: patched filename convention", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-patch-test-"));
  const { voicevoxTextJsonPath, runDir } = await createTestRun(tempRoot);

  const patchConfigPath = path.join(tempRoot, "patch-config.json");
  await writeFile(
    patchConfigPath,
    JSON.stringify({
      version: 1,
      text_normalization: { enabled: false, rules: [] },
      dict_patch: { enabled: false, force_readings: [], suppress_surfaces: [] },
    }),
    "utf-8",
  );

  const result = await patchVoicevoxText({ voicevoxTextJsonPath, patchConfigPath });

  assert.equal(
    path.basename(result.patchedJsonPath),
    `${EPISODE_ID}_voicevox_text.patched.json`,
  );
  assert.equal(
    path.basename(result.patchedCsvPath),
    `${EPISODE_ID}_dict_candidates.patched.csv`,
  );

  const expectedJsonDir = path.join(runDir, "voicevox_text");
  assert.equal(path.dirname(result.patchedJsonPath), expectedJsonDir);
  const expectedCsvDir = path.join(runDir, "dict_candidates");
  assert.equal(path.dirname(result.patchedCsvPath), expectedCsvDir);
});

test("patchVoicevoxText: URL and inline code normalization applied", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-patch-test-"));
  const { voicevoxTextJsonPath } = await createTestRun(tempRoot);

  const patchConfigPath = path.join(tempRoot, "patch-config.json");
  await writeFile(
    patchConfigPath,
    JSON.stringify({
      version: 1,
      text_normalization: {
        enabled: true,
        rules: [
          {
            id: "url",
            pattern: "https?://\\S+",
            replacement: "ユーアールエル",
            enabled: true,
          },
          {
            id: "inline_code_strip",
            pattern: "`([^`]+)`",
            replacement: "$1",
            enabled: true,
          },
          {
            id: "number_ms",
            pattern: "(\\d+)ms",
            replacement: "$1ミリ秒",
            enabled: true,
          },
        ],
      },
      dict_patch: { enabled: false, force_readings: [], suppress_surfaces: [] },
    }),
    "utf-8",
  );

  const result = await patchVoicevoxText({ voicevoxTextJsonPath, patchConfigPath });

  const patchedData = JSON.parse(
    await readFile(result.patchedJsonPath, "utf-8"),
  ) as VoicevoxTextData;
  const texts = patchedData.utterances.map((u) => u.text);

  assert.ok(texts.some((t) => t.includes("ユーアールエル")));
  assert.ok(!texts.some((t) => t.includes("https://")));
  assert.ok(!texts.some((t) => t.includes("`")));
  assert.ok(texts.some((t) => t.includes("ミリ秒")));
});

test("patchVoicevoxText: force_readings added to patched dictionary_candidates", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-patch-test-"));
  const { voicevoxTextJsonPath } = await createTestRun(tempRoot);

  const patchConfigPath = path.join(tempRoot, "patch-config.json");
  await writeFile(
    patchConfigPath,
    JSON.stringify({
      version: 1,
      text_normalization: { enabled: false, rules: [] },
      dict_patch: {
        enabled: true,
        force_readings: [
          { surface: "API", reading: "エーピーアイ", priority: "HIGH", note: "force_patch" },
        ],
        suppress_surfaces: [],
      },
    }),
    "utf-8",
  );

  const result = await patchVoicevoxText({ voicevoxTextJsonPath, patchConfigPath });

  const patchedData = JSON.parse(
    await readFile(result.patchedJsonPath, "utf-8"),
  ) as VoicevoxTextData;
  const api = patchedData.dictionary_candidates.find((c) => c.surface === "API");
  assert.ok(api);
  assert.equal(api.reading_or_empty, "エーピーアイ");

  const useState = patchedData.dictionary_candidates.find((c) => c.surface === "useState");
  assert.ok(useState, "Original candidate should be preserved");
});
