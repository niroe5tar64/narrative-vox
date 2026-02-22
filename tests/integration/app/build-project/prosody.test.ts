import { test } from "bun:test";
import assert from "node:assert/strict";

import {
	applyProsodyAdjustments,
	type ProsodyAdjustments,
} from "@narrative-vox/application/build-project/prosody.ts";
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

test("applyProsodyAdjustments returns original query when adjustment is undefined", () => {
	const actual = applyProsodyAdjustments(baseQuery, undefined);
	assert.equal(actual, baseQuery);
});

test("applyProsodyAdjustments returns original query when intonationScale is omitted", () => {
	const adjustments: ProsodyAdjustments = {};
	const actual = applyProsodyAdjustments(baseQuery, adjustments);
	assert.equal(actual, baseQuery);
});

test("applyProsodyAdjustments sets intonationScale when specified", () => {
	const actual = applyProsodyAdjustments(baseQuery, { intonationScale: 0.05 });
	assert.equal(actual.intonationScale, 0.05);
	assert.equal(actual.speedScale, baseQuery.speedScale);
});

test("applyProsodyAdjustments clamps intonationScale to zero", () => {
	const query: VoicevoxAudioQuery = {
		...baseQuery,
		intonationScale: 0.3,
	};
	const actual = applyProsodyAdjustments(query, { intonationScale: -1 });
	assert.equal(actual.intonationScale, 0);
});
