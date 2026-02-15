import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "bun:test";
import {
  renderPrompt,
  resolvePromptTemplate,
  resolvePromptTemplatePath,
} from "../../src/cli/render_prompt.ts";

const sampleBookConfigPath = path.resolve("configs/books/introducing-rescript.example.json");

describe("resolvePromptTemplatePath", () => {
  test("returns correct path for genre+step", () => {
    const result = resolvePromptTemplatePath("study", "blueprint");
    assert.equal(result, path.resolve("prompts/study/blueprint.md"));
  });

  test("returns correct path for variables step", () => {
    const result = resolvePromptTemplatePath("study", "variables");
    assert.equal(result, path.resolve("prompts/study/episode_variables.md"));
  });

  test("throws on unknown step", () => {
    assert.throws(() => resolvePromptTemplatePath("study", "unknown"), /Unknown step/);
  });
});

describe("resolvePromptTemplate", () => {
  test("resolves {{BOOK_TITLE}} from config", () => {
    const template = [
      "# Preamble",
      "",
      "---",
      "",
      "## Prompt",
      "",
      "Book: {{BOOK_TITLE}}",
    ].join("\n");

    const config = { BOOK_TITLE: "My Book" };
    const result = resolvePromptTemplate(template, config);

    assert.ok(result.resolvedPrompt.includes("Book: My Book"));
    assert.deepEqual(result.unresolvedKeys, []);
  });

  test("resolves all placeholders for episode_variables", () => {
    const template = [
      "# Header",
      "",
      "## Prompt",
      "",
      "- Title: {{BOOK_TITLE}}",
      "- Episode: {{EPISODE_ID}}",
      "- Audience: {{AUDIENCE_BACKGROUND}}",
    ].join("\n");

    const config = {
      BOOK_TITLE: "Test Book",
      EPISODE_ID: "E03",
      AUDIENCE_BACKGROUND: "JS devs",
    };

    const result = resolvePromptTemplate(template, config);
    assert.ok(result.resolvedPrompt.includes("Title: Test Book"));
    assert.ok(result.resolvedPrompt.includes("Episode: E03"));
    assert.ok(result.resolvedPrompt.includes("Audience: JS devs"));
    assert.deepEqual(result.unresolvedKeys, []);
  });

  test("reports unresolved placeholders", () => {
    const template = [
      "## Prompt",
      "",
      "{{KNOWN}} and {{UNKNOWN_KEY}}",
    ].join("\n");

    const config = { KNOWN: "value" };
    const result = resolvePromptTemplate(template, config);

    assert.deepEqual(result.unresolvedKeys, ["UNKNOWN_KEY"]);
    assert.ok(result.resolvedPrompt.includes("value"));
    assert.ok(result.resolvedPrompt.includes("{{UNKNOWN_KEY}}"));
  });

  test("ignores placeholders inside JSON code blocks", () => {
    const template = [
      "## Prompt",
      "",
      "Resolve this: {{BOOK_TITLE}}",
      "",
      "```json",
      '{',
      '  "title": "{{BOOK_TITLE}}"',
      '}',
      "```",
      "",
      "Also resolve: {{EPISODE_ID}}",
    ].join("\n");

    const config = { BOOK_TITLE: "Resolved Title", EPISODE_ID: "E05" };
    const result = resolvePromptTemplate(template, config);

    // Outside code block: resolved
    assert.ok(result.resolvedPrompt.includes("Resolve this: Resolved Title"));
    assert.ok(result.resolvedPrompt.includes("Also resolve: E05"));

    // Inside code block: NOT resolved
    assert.ok(result.resolvedPrompt.includes('"title": "{{BOOK_TITLE}}"'));
    assert.deepEqual(result.unresolvedKeys, []);
  });

  test("does not resolve placeholders in preamble before ## Prompt", () => {
    const template = [
      "# Header {{BOOK_TITLE}}",
      "",
      "Preamble text {{EPISODE_ID}}",
      "",
      "---",
      "",
      "## Prompt",
      "",
      "Body: {{BOOK_TITLE}}",
    ].join("\n");

    const config = { BOOK_TITLE: "Resolved", EPISODE_ID: "E01" };
    const result = resolvePromptTemplate(template, config);

    // Preamble should be untouched
    assert.ok(result.resolvedPrompt.includes("# Header {{BOOK_TITLE}}"));
    assert.ok(result.resolvedPrompt.includes("Preamble text {{EPISODE_ID}}"));
    // Prompt section should be resolved
    assert.ok(result.resolvedPrompt.includes("Body: Resolved"));
  });
});

describe("renderPrompt", () => {
  test("resolves blueprint template with book config", async () => {
    const result = await renderPrompt({
      genre: "study",
      step: "blueprint",
      bookConfigPath: sampleBookConfigPath,
    });

    assert.ok(result.resolvedPrompt.includes("Introducing ReScript"));
    assert.ok(result.templatePath.endsWith("prompts/study/blueprint.md"));
    assert.deepEqual(result.unresolvedKeys, []);
  });

  test("resolves variables template with book config and episodeId override", async () => {
    const result = await renderPrompt({
      genre: "study",
      step: "variables",
      bookConfigPath: sampleBookConfigPath,
      episodeId: "E99",
    });

    assert.ok(result.resolvedPrompt.includes("E99"));
    assert.ok(!result.resolvedPrompt.includes("{{EPISODE_ID}}") ||
      // code blocks may still contain {{EPISODE_ID}}
      result.resolvedPrompt.includes("```"));
    assert.deepEqual(result.unresolvedKeys, []);
  });

  test("throws on unresolved placeholder", async () => {
    // Create a minimal config that is missing required keys
    const { writeFile, unlink } = await import("node:fs/promises");
    const tmpConfig = path.resolve("configs/books/_test_incomplete.json");
    await writeFile(tmpConfig, JSON.stringify({ GENRE: "study", BOOK_TITLE: "Test" }));
    try {
      await assert.rejects(
        () => renderPrompt({
          genre: "study",
          step: "blueprint",
          bookConfigPath: tmpConfig,
        }),
        /Unresolved placeholders/
      );
    } finally {
      await unlink(tmpConfig);
    }
  });
});
