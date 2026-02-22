import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const blueprintPromptPath = path.resolve("prompts/tech-explainer/blueprint.md");
const materialPromptPath = path.resolve(
  "prompts/tech-explainer/episode-material.md",
);
const scriptPromptPath = path.resolve(
  "prompts/tech-explainer/script-common-frame.md",
);
const techExplainerReadmePath = path.resolve(
  "prompts/tech-explainer/README.md",
);
const sampleProjectConfigPath = path.resolve(
  "configs/pipeline/projects/tech-explainer.example.json",
);

const retiredStage2Aliases = [
  "SOURCE_MARKDOWN_PATHS_OR_EMPTY",
  "AUDIENCE_BACKGROUND_OR_EMPTY",
  "AUDIENCE_LEVEL_OR_EMPTY",
  "AUDIENCE_INTEREST_OR_EMPTY",
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

test("material prompt uses config-aligned placeholder names for source and audience", async () => {
  const materialRaw = await readFile(materialPromptPath, "utf-8");

  for (const retiredAlias of retiredStage2Aliases) {
    assert.equal(
      materialRaw.includes(retiredAlias),
      false,
      `found retired alias: ${retiredAlias}`,
    );
  }

  const expectedKeys = [
    "SOURCE_MARKDOWN_PATHS",
    "AUDIENCE_BACKGROUND",
    "AUDIENCE_LEVEL",
    "AUDIENCE_INTEREST",
  ];
  for (const key of expectedKeys) {
    assert.equal(
      materialRaw.includes(`{{${key}}}`),
      true,
      `missing placeholder: ${key}`,
    );
  }
});

test("tech_explainer README key definitions are consistent with material prompt naming", async () => {
  const [readmeRaw, materialRaw] = await Promise.all([
    readFile(techExplainerReadmePath, "utf-8"),
    readFile(materialPromptPath, "utf-8"),
  ]);

  const expectedReadmeKeys = [
    "SOURCE_MARKDOWN_PATHS",
    "AUDIENCE_BACKGROUND",
    "AUDIENCE_LEVEL",
    "AUDIENCE_INTEREST",
    "BASELINE_CONTEXT_OR_EMPTY",
  ];
  for (const key of expectedReadmeKeys) {
    assert.equal(
      readmeRaw.includes(`\`${key}\``),
      true,
      `README missing key: ${key}`,
    );
  }

  for (const retiredAlias of retiredStage2Aliases) {
    assert.equal(
      readmeRaw.includes(retiredAlias),
      false,
      `README still references retired alias: ${retiredAlias}`,
    );
    assert.equal(
      materialRaw.includes(retiredAlias),
      false,
      `material prompt still references retired alias: ${retiredAlias}`,
    );
  }
});

test("project config has GENRE_ID field", async () => {
  const configRaw = await readFile(sampleProjectConfigPath, "utf-8");
  const config = JSON.parse(configRaw) as Record<string, unknown>;
  assert.equal(
    typeof config.GENRE_ID,
    "string",
    "GENRE_ID field must be a string",
  );
  assert.ok(
    (config.GENRE_ID as string).length > 0,
    "GENRE_ID field must not be empty",
  );
});

test("blueprint/material/script prompt placeholders can be resolved with sample project config", async () => {
  const [stage1Raw, materialRaw, stage3Raw, configRaw] = await Promise.all([
    readFile(blueprintPromptPath, "utf-8"),
    readFile(materialPromptPath, "utf-8"),
    readFile(scriptPromptPath, "utf-8"),
    readFile(sampleProjectConfigPath, "utf-8"),
  ]);

  const config = JSON.parse(configRaw) as Record<string, unknown>;
  const placeholders = new Set<string>([
    ...extractPlaceholders(stage1Raw),
    ...extractPlaceholders(materialRaw),
    ...extractPlaceholders(stage3Raw),
  ]);
  const unresolved = [...placeholders].filter((key) => !(key in config)).sort();

  assert.deepEqual(unresolved, []);
});
