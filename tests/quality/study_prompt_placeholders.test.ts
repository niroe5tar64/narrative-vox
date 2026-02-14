import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "bun:test";

const stage1PromptPath = path.resolve("prompts/study/stage1_blueprint.md");
const stage2PromptPath = path.resolve("prompts/study/stage2_episode_variables.md");
const stage3PromptPath = path.resolve("prompts/study/stage3_script_common_frame.md");
const studyReadmePath = path.resolve("prompts/study/README.md");
const sampleBookConfigPath = path.resolve("configs/books/introducing-rescript.example.json");

const retiredStage2Aliases = [
  "SOURCE_MARKDOWN_PATHS_OR_EMPTY",
  "AUDIENCE_BACKGROUND_OR_EMPTY",
  "AUDIENCE_LEVEL_OR_EMPTY",
  "AUDIENCE_INTEREST_OR_EMPTY"
] as const;

function extractPlaceholders(markdown: string): string[] {
  const keys = new Set<string>();
  const matcher = /\{\{([A-Z0-9_]+)\}\}/g;
  let match = matcher.exec(markdown);
  while (match) {
    keys.add(match[1]);
    match = matcher.exec(markdown);
  }
  return [...keys].sort();
}

test("stage2 prompt uses config-aligned placeholder names for source and audience", async () => {
  const stage2Raw = await readFile(stage2PromptPath, "utf-8");

  for (const retiredAlias of retiredStage2Aliases) {
    assert.equal(stage2Raw.includes(retiredAlias), false, `found retired alias: ${retiredAlias}`);
  }

  const expectedKeys = ["SOURCE_MARKDOWN_PATHS", "AUDIENCE_BACKGROUND", "AUDIENCE_LEVEL", "AUDIENCE_INTEREST"];
  for (const key of expectedKeys) {
    assert.equal(stage2Raw.includes(`{{${key}}}`), true, `missing placeholder: ${key}`);
  }
});

test("study README key definitions are consistent with stage2 prompt naming", async () => {
  const [readmeRaw, stage2Raw] = await Promise.all([
    readFile(studyReadmePath, "utf-8"),
    readFile(stage2PromptPath, "utf-8")
  ]);

  const expectedReadmeKeys = [
    "SOURCE_MARKDOWN_PATHS",
    "AUDIENCE_BACKGROUND",
    "AUDIENCE_LEVEL",
    "AUDIENCE_INTEREST",
    "BASELINE_CONTEXT_OR_EMPTY",
    "EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY"
  ];
  for (const key of expectedReadmeKeys) {
    assert.equal(readmeRaw.includes(`\`${key}\``), true, `README missing key: ${key}`);
  }

  for (const retiredAlias of retiredStage2Aliases) {
    assert.equal(readmeRaw.includes(retiredAlias), false, `README still references retired alias: ${retiredAlias}`);
    assert.equal(stage2Raw.includes(retiredAlias), false, `stage2 still references retired alias: ${retiredAlias}`);
  }
});

test("stage1-3 prompt placeholders can be resolved with sample book config", async () => {
  const [stage1Raw, stage2Raw, stage3Raw, configRaw] = await Promise.all([
    readFile(stage1PromptPath, "utf-8"),
    readFile(stage2PromptPath, "utf-8"),
    readFile(stage3PromptPath, "utf-8"),
    readFile(sampleBookConfigPath, "utf-8")
  ]);

  const config = JSON.parse(configRaw) as Record<string, unknown>;
  const placeholders = new Set<string>([
    ...extractPlaceholders(stage1Raw),
    ...extractPlaceholders(stage2Raw),
    ...extractPlaceholders(stage3Raw)
  ]);
  const unresolved = [...placeholders].filter((key) => !(key in config)).sort();

  assert.deepEqual(unresolved, []);
});
