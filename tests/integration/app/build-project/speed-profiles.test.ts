import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  applySpeedPreset,
  loadSpeedProfiles,
} from "@narrative-vox/application/build-project/speed-profiles.ts";
import type { VoicevoxAudioQuery } from "@narrative-vox/infrastructure/voicevox-engine.ts";

const baseQuery: VoicevoxAudioQuery = {
  accentPhrases: [],
  speedScale: 1,
  pitchScale: 0,
  intonationScale: 1,
  volumeScale: 1,
  pauseLengthScale: 1,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
  outputSamplingRate: "engineDefault",
  outputStereo: false,
};

test("applySpeedPreset returns original query when preset is undefined", () => {
  const actual = applySpeedPreset(baseQuery, undefined);
  assert.equal(actual, baseQuery);
});

test("applySpeedPreset overrides speed-related fields", () => {
  const actual = applySpeedPreset(baseQuery, {
    speedScale: 0.9,
    pauseLengthScale: 1.2,
    postPhonemeLength: 0.14,
  });

  assert.equal(actual.speedScale, 0.9);
  assert.equal(actual.pauseLengthScale, 1.2);
  assert.equal(actual.postPhonemeLength, 0.14);
  assert.equal(actual.pitchScale, baseQuery.pitchScale);
  assert.equal(actual.intonationScale, baseQuery.intonationScale);
});

test("loadSpeedProfiles loads schema-valid speed preset file", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const speedProfilesPath = path.join(tempRoot, "speed-profiles.json");
  await writeFile(
    speedProfilesPath,
    JSON.stringify(
      {
        version: 1,
        presets: {
          slow: {
            speedScale: 0.9,
            pauseLengthScale: 1.2,
            postPhonemeLength: 0.14,
          },
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  const profiles = await loadSpeedProfiles(speedProfilesPath);
  assert.equal(profiles.version, 1);
  assert.deepEqual(profiles.presets.slow, {
    speedScale: 0.9,
    pauseLengthScale: 1.2,
    postPhonemeLength: 0.14,
  });
});

test("loadSpeedProfiles rejects invalid schema", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const speedProfilesPath = path.join(tempRoot, "speed-profiles.json");
  await writeFile(
    speedProfilesPath,
    JSON.stringify(
      {
        version: 2,
        presets: {},
      },
      null,
      2,
    ),
    "utf-8",
  );

  await assert.rejects(
    () => loadSpeedProfiles(speedProfilesPath),
    /Failed to load speed profiles/,
  );
});
