import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  ensureMinimalScriptStructure,
  validateScriptSpeakerStructure,
} from "../../../packages/quality/src/check-run/validators/script-structure.ts";

test("ensureMinimalScriptStructure rejects empty script", () => {
  assert.throws(
    () => ensureMinimalScriptStructure("", "/tmp/test.md", "E01"),
    /is empty/,
  );
});

test("ensureMinimalScriptStructure rejects script without section headings", () => {
  assert.throws(
    () =>
      ensureMinimalScriptStructure(
        "[speaker:teacher] テストです。",
        "/tmp/test.md",
        "E01",
      ),
    /no section headings/,
  );
});

test("ensureMinimalScriptStructure accepts script with section heading", () => {
  assert.doesNotThrow(() =>
    ensureMinimalScriptStructure(
      "## 1. テスト\n[speaker:teacher] テストです。",
      "/tmp/test.md",
      "E01",
    ),
  );
});

test("validateScriptSpeakerStructure rejects line without speaker tag", () => {
  const contentStyle = {
    style_id: "test",
    format: { speaker_mode: "dialogue" as const, speaker_count: 2 },
  };
  assert.throws(
    () =>
      validateScriptSpeakerStructure(
        "## 1. テスト\nタグなしです。",
        "/tmp/test.md",
        "E01",
        contentStyle,
      ),
    /requires \[speaker:<key>\]/,
  );
});

test("validateScriptSpeakerStructure rejects wrong speaker count for dialogue", () => {
  const contentStyle = {
    style_id: "test",
    format: { speaker_mode: "dialogue" as const, speaker_count: 2 },
  };
  assert.throws(
    () =>
      validateScriptSpeakerStructure(
        "## 1. テスト\n[speaker:solo] テストです。",
        "/tmp/test.md",
        "E01",
        contentStyle,
      ),
    /speaker_count=2/,
  );
});
