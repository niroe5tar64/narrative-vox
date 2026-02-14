import { test } from "bun:test";
import assert from "node:assert/strict";

import {
  collectRubyCandidates,
  collectTermCandidates,
  decidePauseLengthMs,
  evaluateSpeakability,
  inferReadingFromSurface,
  replaceRubyWithReading,
  splitIntoSentences,
  toDictionaryCandidates
} from "../../src/pipeline/build_text.ts";

test("splitIntoSentences splits by Japanese and ASCII sentence endings", () => {
  const actual = splitIntoSentences("導入です。 次に進む？Yes! 改行\n最後。");
  assert.deepEqual(actual, ["導入です。", "次に進む？", "Yes!", "改行", "最後。"]);
});

test("splitIntoSentences splits long sentence by punctuation and conjunction boundaries", () => {
  const actual = splitIntoSentences(
    "前置きとして背景を共有し、そして実装方針を決めて、最後に手順を確認します。",
    { maxCharsPerSentence: 14 }
  );
  assert.deepEqual(actual, [
    "前置きとして背景を共有し、",
    "そして実装方針を決めて、",
    "最後に手順を確認します。"
  ]);
});

test("splitIntoSentences falls back to max-char split when no boundary exists", () => {
  const actual = splitIntoSentences("abcdefghijklmnop", { maxCharsPerSentence: 6 });
  assert.deepEqual(actual, ["abcdefghij", "klmnop"]);
});

test("splitIntoSentences avoids trailing tiny fragments when sentence barely exceeds limit", () => {
  const text =
    "PRレビューの最初に「型で防げる不具合を実装で受けていないか」「境界の責務が明確か」を確認します。";
  const actual = splitIntoSentences(text, { maxCharsPerSentence: 48 });

  assert.equal(actual.some((sentence) => sentence === "。" || sentence === "す。"), false);
  assert.equal(actual.join(""), text);
});

test("decidePauseLengthMs uses punctuation strength and continuation context", () => {
  assert.equal(decidePauseLengthMs("終わり。"), 320);
  assert.equal(decidePauseLengthMs("ok!"), 360);
  assert.equal(decidePauseLengthMs("そして進める、", { isTerminalInSourceLine: false }), 150);
  assert.equal(decidePauseLengthMs("abcdef", { isTerminalInSourceLine: false }), 140);
});

test("decidePauseLengthMs increases pause for longer utterances", () => {
  const shortSentence = `aaaaaaaaaa。`;
  const longSentence = `${"a".repeat(55)}。`;
  assert.equal(decidePauseLengthMs(shortSentence), 320);
  assert.equal(decidePauseLengthMs(longSentence), 380);
});

test("evaluateSpeakability gives higher score to easy-to-read utterances", () => {
  const easy = evaluateSpeakability([
    { text: "導入です。" },
    { text: "次に進みます。" },
    { text: "最後にまとめます。" }
  ]);
  const hard = evaluateSpeakability([{ text: "a".repeat(95) }]);

  assert.equal(easy.score > hard.score, true);
  assert.equal(easy.score >= 80, true);
  assert.equal(hard.score <= 40, true);
});

test("replaceRubyWithReading replaces ruby notation with reading", () => {
  const actual = replaceRubyWithReading("今日は{漢字|かんじ}と{ReScript|リスクリプト}を学ぶ。");
  assert.equal(actual, "今日はかんじとリスクリプトを学ぶ。");
});

test("dictionary candidate extraction keeps ruby readings and token frequencies", () => {
  const termCandidates = new Map();
  const lines = [
    "今日は{漢字|かんじ}と{API|エーピーアイ}を学ぶ。",
    "APIを使ったテストケース。テストケースを増やす。",
    "テストケースとAPIの確認。"
  ];

  for (const line of lines) {
    collectRubyCandidates(line, termCandidates);
    const plain = replaceRubyWithReading(line);
    for (const sentence of splitIntoSentences(plain)) {
      collectTermCandidates(sentence, termCandidates);
    }
  }

  const candidates = toDictionaryCandidates(termCandidates);

  const kanji = candidates.find((item) => item.surface === "漢字");
  assert.deepEqual(kanji, {
    surface: "漢字",
    reading_or_empty: "かんじ",
    priority: "HIGH",
    occurrences: 1,
    source: "ruby",
    note: "ruby_from_script"
  });

  const api = candidates.find((item) => item.surface === "API");
  assert.deepEqual(api, {
    surface: "API",
    reading_or_empty: "エーピーアイ",
    priority: "HIGH",
    occurrences: 3,
    source: "ruby",
    note: "ruby_from_script"
  });

  const testCase = candidates.find((item) => item.surface === "テストケース");
  assert.deepEqual(testCase, {
    surface: "テストケース",
    reading_or_empty: "テストケース",
    priority: "HIGH",
    occurrences: 3,
    source: "token",
    note: "reading_inferred"
  });
});

test("inferReadingFromSurface infers katakana and uppercase acronym readings", () => {
  assert.equal(inferReadingFromSurface("テストケース"), "テストケース");
  assert.equal(inferReadingFromSurface("API"), "エーピーアイ");
  assert.equal(inferReadingFromSurface("JS"), "ジェーエス");
  assert.equal(inferReadingFromSurface("TypeScript"), "");
});

test("dictionary candidate extraction infers readings and excludes low-signal tokens", () => {
  const termCandidates = new Map();
  const lines = ["APIとFFIで検証する。", "APIの確認。", "anyの多用は避ける。"];

  for (const line of lines) {
    collectTermCandidates(line, termCandidates);
  }

  const candidates = toDictionaryCandidates(termCandidates);

  const api = candidates.find((item) => item.surface === "API");
  assert.deepEqual(api, {
    surface: "API",
    reading_or_empty: "エーピーアイ",
    priority: "MEDIUM",
    occurrences: 2,
    source: "token",
    note: "reading_inferred"
  });

  const ffi = candidates.find((item) => item.surface === "FFI");
  assert.deepEqual(ffi, {
    surface: "FFI",
    reading_or_empty: "エフエフアイ",
    priority: "LOW",
    occurrences: 1,
    source: "token",
    note: "reading_inferred"
  });

  assert.equal(candidates.some((item) => item.surface === "any"), false);
});

test("priority balances source reliability and occurrences", () => {
  const termCandidates = new Map<
    string,
    {
      reading: string;
      occurrences: number;
      source: "ruby" | "token" | "morph";
      readingSource: "" | "ruby" | "morph" | "inferred";
    }
  >([
    [
      "FFI",
      {
        reading: "エフエフアイ",
        occurrences: 1,
        source: "token",
        readingSource: "inferred"
      }
    ],
    [
      "検証",
      {
        reading: "ケンショウ",
        occurrences: 1,
        source: "morph",
        readingSource: "morph"
      }
    ],
    [
      "ユースケース",
      {
        reading: "ユースケース",
        occurrences: 3,
        source: "token",
        readingSource: "inferred"
      }
    ]
  ]);

  const candidates = toDictionaryCandidates(termCandidates);

  assert.equal(candidates.find((item) => item.surface === "FFI")?.priority, "LOW");
  assert.equal(candidates.find((item) => item.surface === "検証")?.priority, "MEDIUM");
  assert.equal(candidates.find((item) => item.surface === "ユースケース")?.priority, "HIGH");
});
