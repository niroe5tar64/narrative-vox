import { test } from "bun:test";
import assert from "node:assert/strict";
import { patchDictionaryCandidates } from "@narrative-vox/application/patch-voicevox-text/dict-patcher.ts";
import type {
  DictionaryCandidate,
  ForceReading,
} from "@narrative-vox/domain/types.ts";

function makeCandidate(
  surface: string,
  reading_or_empty = "",
  priority: DictionaryCandidate["priority"] = "MEDIUM",
): DictionaryCandidate {
  return {
    surface,
    reading_or_empty,
    priority,
    occurrences: 1,
    source: "token",
    note: "",
  };
}

test("dict-patcher: force_reading adds new surface", () => {
  const candidates: DictionaryCandidate[] = [makeCandidate("CLI", "")];
  const forceReadings: ForceReading[] = [
    {
      surface: "API",
      reading: "エーピーアイ",
      priority: "HIGH",
      note: "force_patch",
    },
  ];
  const { candidates: result, addedCount } = patchDictionaryCandidates(
    candidates,
    forceReadings,
    [],
  );
  assert.equal(addedCount, 1);
  const api = result.find((c) => c.surface === "API");
  assert.ok(api);
  assert.equal(api.reading_or_empty, "エーピーアイ");
  assert.equal(api.priority, "HIGH");
  assert.equal(api.source, "force_patch");
});

test("dict-patcher: force_reading overrides existing surface reading", () => {
  const candidates: DictionaryCandidate[] = [
    makeCandidate("API", "えーぴーあい", "LOW"),
  ];
  const forceReadings: ForceReading[] = [
    {
      surface: "API",
      reading: "エーピーアイ",
      priority: "HIGH",
      note: "force_patch",
    },
  ];
  const { candidates: result, addedCount } = patchDictionaryCandidates(
    candidates,
    forceReadings,
    [],
  );
  assert.equal(addedCount, 0);
  assert.equal(result.length, 1);
  const api = result.find((c) => c.surface === "API");
  assert.ok(api);
  assert.equal(api.reading_or_empty, "エーピーアイ");
  assert.equal(api.priority, "HIGH");
});

test("dict-patcher: suppress_surfaces removes candidates", () => {
  const candidates: DictionaryCandidate[] = [
    makeCandidate("API"),
    makeCandidate("CLI"),
    makeCandidate("TypeScript"),
  ];
  const { candidates: result, removedCount } = patchDictionaryCandidates(
    candidates,
    [],
    ["CLI"],
  );
  assert.equal(removedCount, 1);
  assert.equal(result.length, 2);
  assert.equal(
    result.some((c) => c.surface === "CLI"),
    false,
  );
});

test("dict-patcher: existing candidates are preserved when not in force_readings or suppress_surfaces", () => {
  const candidates: DictionaryCandidate[] = [
    makeCandidate("TypeScript", "タイプスクリプト", "HIGH"),
    makeCandidate("API", ""),
  ];
  const { candidates: result } = patchDictionaryCandidates(candidates, [], []);
  assert.equal(result.length, 2);
  const ts = result.find((c) => c.surface === "TypeScript");
  assert.ok(ts);
  assert.equal(ts.reading_or_empty, "タイプスクリプト");
});
