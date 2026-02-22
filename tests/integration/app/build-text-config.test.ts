import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_BUILD_TEXT_CONFIG,
  loadBuildTextConfig,
  normalizeBuildTextConfig,
} from "@narrative-vox/application/build-text/build-text-config.ts";

const VALID_CONFIG = {
  version: 1,
  speakability: {
    warningThresholds: {
      scoreThreshold: 70,
      minTerminalPunctuationRatio: 0.65,
      maxLongUtteranceRatio: 0.25,
    },
    scoring: {
      targetAverageChars: 32,
      averagePenaltyFactor: 1.2,
      averagePenaltyMax: 35,
      longRatioWeight: 45,
      punctuationWeight: 20,
    },
  },
  pause: {
    minMs: 120,
    maxMs: 520,
    bases: { default: 190, strongEnding: 360, fullStop: 320, clauseEnd: 240 },
    lengthBonus: { step: 10, increment: 20, max: 120 },
    penalties: { conjunction: 40, continuation: 50 },
  },
};

async function writeConfig(dir: string, data: unknown): Promise<string> {
  const filePath = path.join(dir, "build-text-config.json");
  await writeFile(filePath, JSON.stringify(data), "utf-8");
  return filePath;
}

test("loadBuildTextConfig loads valid config file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-btc-"));
  const configPath = await writeConfig(tempDir, VALID_CONFIG);

  const config = await loadBuildTextConfig(configPath);

  assert.equal(config.speakability.warningThresholds.scoreThreshold, 70);
  assert.equal(
    config.speakability.warningThresholds.minTerminalPunctuationRatio,
    0.65,
  );
  assert.equal(config.pause.minMs, 120);
  assert.equal(config.pause.maxMs, 520);
  assert.equal(config.pause.bases.fullStop, 320);
});

test("loadBuildTextConfig rejects config missing version field", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-btc-"));
  const { version: _omitted, ...noVersion } = VALID_CONFIG;
  const configPath = await writeConfig(tempDir, noVersion);

  await assert.rejects(
    () => loadBuildTextConfig(configPath),
    /Schema validation failed \(build-text-config\.schema\.json\)/,
  );
});

test("loadBuildTextConfig rejects config with ratio > 1", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-btc-"));
  const invalid = {
    ...VALID_CONFIG,
    speakability: {
      ...VALID_CONFIG.speakability,
      warningThresholds: {
        ...VALID_CONFIG.speakability.warningThresholds,
        minTerminalPunctuationRatio: 1.5,
      },
    },
  };
  const configPath = await writeConfig(tempDir, invalid);

  await assert.rejects(
    () => loadBuildTextConfig(configPath),
    /Schema validation failed \(build-text-config\.schema\.json\)/,
  );
});

test("loadBuildTextConfig rejects config where minMs > maxMs", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-btc-"));
  const invalid = {
    ...VALID_CONFIG,
    pause: { ...VALID_CONFIG.pause, minMs: 600, maxMs: 400 },
  };
  const configPath = await writeConfig(tempDir, invalid);

  await assert.rejects(
    () => loadBuildTextConfig(configPath),
    /pause\.minMs.*must be <= pause\.maxMs/,
  );
});

test("normalizeBuildTextConfig returns defaults when called with no argument", () => {
  const config = normalizeBuildTextConfig();

  assert.deepEqual(config, DEFAULT_BUILD_TEXT_CONFIG);
});
