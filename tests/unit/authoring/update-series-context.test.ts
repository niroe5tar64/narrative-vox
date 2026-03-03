import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  _analyzeScript,
  _appendUnique,
} from "@narrative-vox/authoring/update-series-context.ts";

test("appendUnique merges without duplicates", () => {
  assert.deepEqual(_appendUnique(["a", "b"], ["b", "c"]), ["a", "b", "c"]);
});

test("appendUnique preserves order, base first", () => {
  assert.deepEqual(_appendUnique(["c", "a"], ["b", "a"]), ["c", "a", "b"]);
});

test("appendUnique with empty base", () => {
  assert.deepEqual(_appendUnique([], ["x", "y"]), ["x", "y"]);
});

test("appendUnique with empty additions", () => {
  assert.deepEqual(_appendUnique(["a"], []), ["a"]);
});

test("analyzeScript counts sections from ## N. headings", () => {
  const script = [
    "## 1. Introduction",
    "[speaker:teacher] Hello!",
    "[speaker:student] Hi!",
    "## 2. Main Topic",
    "[speaker:teacher] Let's begin.",
  ].join("\n");

  const analysis = _analyzeScript(script);
  assert.equal(analysis.sectionCount, 2);
});

test("analyzeScript counts utterances from speaker tags", () => {
  const script = [
    "## 1. Intro",
    "[speaker:teacher] Hello!",
    "[speaker:student] Hi!",
    "[speaker:teacher] Let's go.",
  ].join("\n");

  const analysis = _analyzeScript(script);
  assert.equal(analysis.utteranceCount, 3);
});

test("analyzeScript computes speaker_turns", () => {
  const script = [
    "## 1. Intro",
    "[speaker:teacher] Hello!",
    "[speaker:student] Hi!",
    "[speaker:teacher] Let's go.",
    "[speaker:teacher] Continue.",
  ].join("\n");

  const analysis = _analyzeScript(script);
  assert.equal(analysis.speakerTurns.length, 2);

  const teacherTurns = analysis.speakerTurns.find(
    (t) => t.speaker_key === "teacher",
  );
  assert.ok(teacherTurns);
  assert.equal(teacherTurns.utterance_count, 3);

  const studentTurns = analysis.speakerTurns.find(
    (t) => t.speaker_key === "student",
  );
  assert.ok(studentTurns);
  assert.equal(studentTurns.utterance_count, 1);
});

test("analyzeScript with empty script", () => {
  const analysis = _analyzeScript("");
  assert.equal(analysis.sectionCount, 0);
  assert.equal(analysis.utteranceCount, 0);
  assert.equal(analysis.speakerTurns.length, 0);
});

test("analyzeScript ignores non-matching lines", () => {
  const script = [
    "# Title (not a section)",
    "Some paragraph text.",
    "### Subsection (not counted)",
    "More text.",
  ].join("\n");

  const analysis = _analyzeScript(script);
  assert.equal(analysis.sectionCount, 0);
  assert.equal(analysis.utteranceCount, 0);
});
