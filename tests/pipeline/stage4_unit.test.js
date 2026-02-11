import { test } from "node:test";
import assert from "node:assert/strict";

import {
  collectRubyCandidates,
  collectTermCandidates,
  replaceRubyWithReading,
  splitIntoSentences,
  toDictionaryCandidates
} from "../../src/pipeline/stage4_voicevox_text.js";

test("splitIntoSentences splits by Japanese and ASCII sentence endings", () => {
  const actual = splitIntoSentences("導入です。 次に進む？Yes! 改行\n最後。");
  assert.deepEqual(actual, ["導入です。", "次に進む？", "Yes!", "改行", "最後。"]);
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
    reading_or_empty: "",
    priority: "HIGH",
    occurrences: 3,
    source: "token",
    note: "auto_detected"
  });
});
