import { test } from "bun:test";
import assert from "node:assert/strict";
import { applyNormalizationRules } from "@narrative-vox/application/patch-voicevox-text/normalizer.ts";
import type {
  NormalizationRule,
  VoicevoxTextUtterance,
} from "@narrative-vox/domain/types.ts";

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
  pattern: "https?://[\\w./?#&=%~:@!$'()*+,;\\-]+",
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

const NUMBER_MB_RULE: NormalizationRule = {
  id: "number_mb",
  pattern: "(\\d+)MB",
  replacement: "$1メガバイト",
  enabled: true,
};

const NUMBER_GB_RULE: NormalizationRule = {
  id: "number_gb",
  pattern: "(\\d+)GB",
  replacement: "$1ギガバイト",
  enabled: true,
};

const NUMBER_HZ_RULE: NormalizationRule = {
  id: "number_hz",
  pattern: "(\\d+(?:\\.\\d+)?)Hz",
  replacement: "$1ヘルツ",
  enabled: true,
};

const NUMBER_KHZ_RULE: NormalizationRule = {
  id: "number_khz",
  pattern: "(\\d+(?:\\.\\d+)?)kHz",
  replacement: "$1キロヘルツ",
  enabled: true,
};

const NUMBER_FPS_RULE: NormalizationRule = {
  id: "number_fps",
  pattern: "(\\d+)fps",
  replacement: "$1エフピーエス",
  enabled: true,
};

test("normalizer: URL replacement", () => {
  const utterances = [
    makeUtterance("詳しくは https://example.com/foo をご覧ください。"),
  ];
  const { utterances: result } = applyNormalizationRules(utterances, [
    URL_RULE,
  ]);
  assert.equal(result[0]?.text, "詳しくは ユーアールエル をご覧ください。");
});

test("normalizer: URL pattern does not consume trailing Japanese punctuation", () => {
  const utterances = [makeUtterance("参照はhttps://example.com。次に進みます。")];
  const { utterances: result } = applyNormalizationRules(utterances, [URL_RULE]);
  assert.equal(result[0]?.text, "参照はユーアールエル。次に進みます。");
});

test("normalizer: inline code strip", () => {
  const utterances = [makeUtterance("`useState` を使います。")];
  const { utterances: result } = applyNormalizationRules(utterances, [
    INLINE_CODE_RULE,
  ]);
  assert.equal(result[0]?.text, "useState を使います。");
});

test("normalizer: number+ms", () => {
  const utterances = [makeUtterance("処理時間は500msです。")];
  const { utterances: result } = applyNormalizationRules(utterances, [
    NUMBER_MS_RULE,
  ]);
  assert.equal(result[0]?.text, "処理時間は500ミリ秒です。");
});

test("normalizer: MB unit replacement", () => {
  const utterances = [makeUtterance("転送速度は100MBです。")];
  const { utterances: result } = applyNormalizationRules(utterances, [
    NUMBER_MB_RULE,
  ]);
  assert.equal(result[0]?.text, "転送速度は100メガバイトです。");
});

test("normalizer: GB unit replacement", () => {
  const utterances = [makeUtterance("メモリは4GBです。")];
  const { utterances: result } = applyNormalizationRules(utterances, [
    NUMBER_GB_RULE,
  ]);
  assert.equal(result[0]?.text, "メモリは4ギガバイトです。");
});

test("normalizer: Hz unit replacement", () => {
  const utterances = [makeUtterance("サンプル周波数は440Hzです。")];
  const { utterances: result } = applyNormalizationRules(utterances, [
    NUMBER_HZ_RULE,
  ]);
  assert.equal(result[0]?.text, "サンプル周波数は440ヘルツです。");
});

test("normalizer: kHz unit replacement", () => {
  const utterances = [makeUtterance("帯域は44.1kHzです。")];
  const { utterances: result } = applyNormalizationRules(utterances, [
    NUMBER_KHZ_RULE,
  ]);
  assert.equal(result[0]?.text, "帯域は44.1キロヘルツです。");
});

test("normalizer: fps unit replacement", () => {
  const utterances = [makeUtterance("描画は60fpsです。")];
  const { utterances: result } = applyNormalizationRules(utterances, [
    NUMBER_FPS_RULE,
  ]);
  assert.equal(result[0]?.text, "描画は60エフピーエスです。");
});

test("normalizer: disabled rule is skipped", () => {
  const disabledRule: NormalizationRule = {
    ...URL_RULE,
    enabled: false,
  };
  const utterances = [
    makeUtterance("詳しくは https://example.com をご覧ください。"),
  ];
  const { utterances: result } = applyNormalizationRules(utterances, [
    disabledRule,
  ]);
  assert.equal(
    result[0]?.text,
    "詳しくは https://example.com をご覧ください。",
  );
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
  const { utterances: result } = applyNormalizationRules(utterances, [
    stripAllRule,
  ]);
  assert.equal(result[0]?.text, original);
});
