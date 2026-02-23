import { test } from "bun:test";
import assert from "node:assert/strict";
import { applyNormalizationRules } from "@narrative-vox/application/patch-voicevox-text/normalizer.ts";
import type { NormalizationRule, VoicevoxTextUtterance } from "@narrative-vox/domain/types.ts";

function makeUtterance(text: string, id = "U001"): VoicevoxTextUtterance {
  return {
    utterance_id: id,
    section_id: 1,
    section_title: "テスト",
    text,
    pause_length_ms: 300,
  };
}

const URL_RULE: NormalizationRule = {
  id: "url",
  pattern: "https?://\\S+",
  replacement: "ユーアールエル",
  enabled: true,
};

const INLINE_CODE_RULE: NormalizationRule = {
  id: "inline_code_strip",
  pattern: "`([^`]+)`",
  replacement: "$1",
  enabled: true,
};

const NUMBER_MS_RULE: NormalizationRule = {
  id: "number_ms",
  pattern: "(\\d+)ms",
  replacement: "$1ミリ秒",
  enabled: true,
};

test("normalizer: URL replacement", () => {
  const utterances = [makeUtterance("詳しくは https://example.com/foo をご覧ください。")];
  const { utterances: result } = applyNormalizationRules(utterances, [URL_RULE]);
  assert.equal(result[0]?.text, "詳しくは ユーアールエル をご覧ください。");
});

test("normalizer: inline code strip", () => {
  const utterances = [makeUtterance("`useState` を使います。")];
  const { utterances: result } = applyNormalizationRules(utterances, [INLINE_CODE_RULE]);
  assert.equal(result[0]?.text, "useState を使います。");
});

test("normalizer: number+ms", () => {
  const utterances = [makeUtterance("処理時間は500msです。")];
  const { utterances: result } = applyNormalizationRules(utterances, [NUMBER_MS_RULE]);
  assert.equal(result[0]?.text, "処理時間は500ミリ秒です。");
});

test("normalizer: disabled rule is skipped", () => {
  const disabledRule: NormalizationRule = {
    ...URL_RULE,
    enabled: false,
  };
  const utterances = [makeUtterance("詳しくは https://example.com をご覧ください。")];
  const { utterances: result } = applyNormalizationRules(utterances, [disabledRule]);
  assert.equal(result[0]?.text, "詳しくは https://example.com をご覧ください。");
});

test("normalizer: appliedCount counts utterances with changes", () => {
  const utterances = [
    makeUtterance("https://example.com/a を参照。", "U001"),
    makeUtterance("こちらは変化なし。", "U002"),
    makeUtterance("https://example.com/b も参照。", "U003"),
  ];
  const { appliedCount } = applyNormalizationRules(utterances, [URL_RULE]);
  assert.equal(appliedCount, 2);
});

test("normalizer: empty text after normalization keeps original text", () => {
  const stripAllRule: NormalizationRule = {
    id: "strip_all",
    pattern: ".*",
    replacement: "",
    enabled: true,
  };
  const original = "テストテキスト。";
  const utterances = [makeUtterance(original)];
  const { utterances: result } = applyNormalizationRules(utterances, [stripAllRule]);
  assert.equal(result[0]?.text, original);
});
