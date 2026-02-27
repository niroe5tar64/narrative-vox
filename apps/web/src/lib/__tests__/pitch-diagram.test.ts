import { describe, expect, test } from "vitest";

import { buildPitchDiagram, splitMora } from "@/lib/pitch-diagram";

describe("splitMora", () => {
  test("handles digraph", () => {
    expect(splitMora("キョウ")).toEqual(["キョ", "ウ"]);
  });

  test("handles simple kana", () => {
    expect(splitMora("アイウ")).toEqual(["ア", "イ", "ウ"]);
  });

  test("handles empty string", () => {
    expect(splitMora("")).toEqual([]);
  });
});

describe("buildPitchDiagram", () => {
  test("atamadaka", () => {
    expect(buildPitchDiagram("アメ", 1)).toBe("ア↓メ");
  });

  test("heiban", () => {
    expect(buildPitchDiagram("アメ", 0)).toBe("ア↑メ");
  });

  test("nakadaka", () => {
    expect(buildPitchDiagram("アメガ", 2)).toBe("ア↑メ↓ガ");
  });
});
