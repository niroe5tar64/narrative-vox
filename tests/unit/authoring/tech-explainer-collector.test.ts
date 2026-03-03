import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  _collectSectionsFromFile,
  _isAuxiliaryByHeading,
  _makePreviewText,
} from "@narrative-vox/authoring/gen-source-index/tech-explainer-collector.ts";

test("section split at # boundary", () => {
  const content = [
    "# Chapter 1",
    "First chapter content.",
    "",
    "# Chapter 2",
    "Second chapter content.",
  ].join("\n");

  const sections = _collectSectionsFromFile("test.md", content);
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0].heading_path, ["Chapter 1"]);
  assert.ok(sections[0].body_markdown.includes("First chapter content."));
  assert.deepEqual(sections[1].heading_path, ["Chapter 2"]);
  assert.ok(sections[1].body_markdown.includes("Second chapter content."));
});

test("section split at ## boundary", () => {
  const content = [
    "# Title",
    "## Section A",
    "Content A.",
    "## Section B",
    "Content B.",
  ].join("\n");

  const sections = _collectSectionsFromFile("test.md", content);
  assert.equal(sections.length, 2);
  assert.deepEqual(sections[0].heading_path, ["Title", "Section A"]);
  assert.deepEqual(sections[1].heading_path, ["Title", "Section B"]);
});

test("### does not split sections", () => {
  const content = [
    "# Title",
    "## Section A",
    "Content A.",
    "### Subsection",
    "More content.",
  ].join("\n");

  const sections = _collectSectionsFromFile("test.md", content);
  assert.equal(sections.length, 1);
  assert.ok(sections[0].body_markdown.includes("Subsection"));
  assert.ok(sections[0].body_markdown.includes("More content."));
});

test("YAML front matter creates is_auxiliary section", () => {
  const content = [
    "---",
    "title: My Doc",
    "author: Test",
    "---",
    "# Chapter 1",
    "Real content.",
  ].join("\n");

  const sections = _collectSectionsFromFile("test.md", content);
  assert.equal(sections.length, 2);
  assert.equal(sections[0].is_auxiliary, true);
  assert.equal(sections[0].display_title, "(front matter)");
  assert.ok(sections[0].body_markdown.includes("title: My Doc"));
  assert.equal(sections[1].is_auxiliary, false);
});

test("heading_path keyword heuristic marks is_auxiliary", () => {
  assert.equal(_isAuxiliaryByHeading(["Appendix"]), true);
  assert.equal(_isAuxiliaryByHeading(["Title", "Appendix A"]), true);
  assert.equal(_isAuxiliaryByHeading(["Title", "Glossary"]), true);
  assert.equal(_isAuxiliaryByHeading(["Title", "Bibliography"]), true);
  assert.equal(_isAuxiliaryByHeading(["Title", "参考文献"]), true);
  assert.equal(_isAuxiliaryByHeading(["Title", "付録"]), true);
  assert.equal(_isAuxiliaryByHeading(["Title", "Introduction"]), false);
  assert.equal(_isAuxiliaryByHeading(["Title", "Chapter 1"]), false);
  assert.equal(_isAuxiliaryByHeading([]), false);
});

test("token_estimate computed from body_markdown only", () => {
  const content = [
    "# Title",
    "Hello world. This is content.",
  ].join("\n");

  const sections = _collectSectionsFromFile("test.md", content);
  assert.equal(sections.length, 1);
  assert.ok(sections[0].token_estimate > 0);
  assert.equal(sections[0].char_count, sections[0].body_markdown.length);
});

test("preview_text truncated at 200 unicode code points", () => {
  const longText = "あ".repeat(300);
  const preview = _makePreviewText(longText);
  assert.equal([...preview].length, 200);
});

test("preview_text collapses whitespace", () => {
  const text = "hello   world\n\nfoo";
  const preview = _makePreviewText(text);
  assert.equal(preview, "hello world foo");
});

test("empty file produces no sections", () => {
  const sections = _collectSectionsFromFile("empty.md", "");
  assert.equal(sections.length, 0);
});

test("content before any heading forms a section", () => {
  const content = [
    "Some preamble text.",
    "",
    "# Chapter 1",
    "Chapter content.",
  ].join("\n");

  const sections = _collectSectionsFromFile("test.md", content);
  assert.equal(sections.length, 2);
  assert.ok(sections[0].body_markdown.includes("Some preamble text."));
  assert.deepEqual(sections[1].heading_path, ["Chapter 1"]);
});
