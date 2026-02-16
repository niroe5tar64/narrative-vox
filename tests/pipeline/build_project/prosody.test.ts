import { test } from "bun:test";
import assert from "node:assert/strict";

import {
  applyProsodyAdjustments,
  type ProsodyAdjustments
} from "../../../src/pipeline/build_project/prosody.ts";
import type { VoicevoxAudioQuery } from "../../../src/pipeline/voicevox_engine.ts";

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
  outputStereo: false
};

test("applyProsodyAdjustments returns original query when adjustment is undefined", () => {
  const actual = applyProsodyAdjustments(baseQuery, undefined);
  assert.equal(actual, baseQuery);
});

test("applyProsodyAdjustments returns original query when intonation delta is omitted", () => {
  const adjustments: ProsodyAdjustments = {};
  const actual = applyProsodyAdjustments(baseQuery, adjustments);
  assert.equal(actual, baseQuery);
});

test("applyProsodyAdjustments adds intonationScaleDelta to intonationScale", () => {
  const actual = applyProsodyAdjustments(baseQuery, { intonationScaleDelta: 0.05 });
  assert.equal(actual.intonationScale, 1.05);
  assert.equal(actual.speedScale, baseQuery.speedScale);
});

test("applyProsodyAdjustments clamps intonationScale to zero", () => {
  const query: VoicevoxAudioQuery = {
    ...baseQuery,
    intonationScale: 0.3
  };
  const actual = applyProsodyAdjustments(query, { intonationScaleDelta: -1 });
  assert.equal(actual.intonationScale, 0);
});
