import { test } from "bun:test";
import assert from "node:assert/strict";
import { estimateTokens } from "@narrative-vox/authoring/shared/token-estimate.ts";

test("estimateTokens returns ceil(byteLength / 4) for ASCII", () => {
  // "hello" = 5 bytes → ceil(5/4) = 2
  assert.equal(estimateTokens("hello"), 2);
});

test("estimateTokens handles empty string", () => {
  assert.equal(estimateTokens(""), 0);
});

test("estimateTokens collapses whitespace before computing", () => {
  // "a  b\n\nc" → canonical "a b c" = 5 bytes → ceil(5/4) = 2
  assert.equal(estimateTokens("a  b\n\nc"), 2);
});

test("estimateTokens handles multibyte UTF-8 (Japanese)", () => {
  // "あ" = 3 bytes in UTF-8 → ceil(3/4) = 1
  assert.equal(estimateTokens("あ"), 1);
  // "ああ" = 6 bytes → ceil(6/4) = 2
  assert.equal(estimateTokens("ああ"), 2);
});

test("estimateTokens handles mixed ASCII and multibyte", () => {
  // "hello あ" = 5 + 1(space) + 3 = 9 bytes → ceil(9/4) = 3
  assert.equal(estimateTokens("hello あ"), 3);
});

test("estimateTokens collapses tabs and newlines to single space", () => {
  const input = "hello\t\t\tworld\n\n\nfoo";
  // canonical: "hello world foo" = 15 bytes → ceil(15/4) = 4
  assert.equal(estimateTokens(input), 4);
});
