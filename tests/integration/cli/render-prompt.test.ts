import assert from "node:assert/strict";
import path from "node:path";
import { describe, test } from "bun:test";
import {
  renderPrompt,
  resolvePromptTemplate,
  resolvePromptTemplatePath,
} from "@narrative-vox/cli/render-prompt.ts";

const sampleProjectConfigPath = path.resolve("configs/pipeline/projects/tech-explainer.example.json");

describe("resolvePromptTemplatePath", () => {
  test("returns correct path for genre+step", () => {
    const result = resolvePromptTemplatePath("tech_explainer", "blueprint");
    assert.equal(result, path.resolve("prompts/tech-explainer/blueprint.md"));
  });

  test("returns correct path for material step", () => {
    const result = resolvePromptTemplatePath("tech_explainer", "material");
    assert.equal(result, path.resolve("prompts/tech-explainer/episode-material.md"));
  });

  test("throws on unknown step", () => {
    assert.throws(() => resolvePromptTemplatePath("tech_explainer", "unknown"), /Unknown step/);
  });
});

describe("resolvePromptTemplate", () => {
  test("resolves {{PROJECT_TITLE}} from config", () => {
    const template = [
      "# Preamble",
      "",
      "---",
      "",
      "## Prompt",
      "",
      "Book: {{PROJECT_TITLE}}",
    ].join("\n");

    const config = { PROJECT_TITLE: "My Book" };
    const result = resolvePromptTemplate(template, config);

    assert.ok(result.resolvedPrompt.includes("Book: My Book"));
    assert.deepEqual(result.unresolvedKeys, []);
  });

  test("resolves all placeholders for episode-material", () => {
    const template = [
      "# Header",
      "",
      "## Prompt",
      "",
      "- Title: {{PROJECT_TITLE}}",
      "- Episode: {{EPISODE_ID}}",
      "- Audience: {{AUDIENCE_BACKGROUND}}",
    ].join("\n");

    const config = {
      PROJECT_TITLE: "Test Book",
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
      "Resolve this: {{PROJECT_TITLE}}",
      "",
      "```json",
      '{',
      '  "title": "{{PROJECT_TITLE}}"',
      '}',
      "```",
      "",
      "Also resolve: {{EPISODE_ID}}",
    ].join("\n");

    const config = { PROJECT_TITLE: "Resolved Title", EPISODE_ID: "E05" };
    const result = resolvePromptTemplate(template, config);

    // Outside code block: resolved
    assert.ok(result.resolvedPrompt.includes("Resolve this: Resolved Title"));
    assert.ok(result.resolvedPrompt.includes("Also resolve: E05"));

    // Inside code block: NOT resolved
    assert.ok(result.resolvedPrompt.includes('"title": "{{PROJECT_TITLE}}"'));
    assert.deepEqual(result.unresolvedKeys, []);
  });

  test("does not resolve placeholders in preamble before ## Prompt", () => {
    const template = [
      "# Header {{PROJECT_TITLE}}",
      "",
      "Preamble text {{EPISODE_ID}}",
      "",
      "---",
      "",
      "## Prompt",
      "",
      "Body: {{PROJECT_TITLE}}",
    ].join("\n");

    const config = { PROJECT_TITLE: "Resolved", EPISODE_ID: "E01" };
    const result = resolvePromptTemplate(template, config);

    // Preamble should be untouched
    assert.ok(result.resolvedPrompt.includes("# Header {{PROJECT_TITLE}}"));
    assert.ok(result.resolvedPrompt.includes("Preamble text {{EPISODE_ID}}"));
    // Prompt section should be resolved
    assert.ok(result.resolvedPrompt.includes("Body: Resolved"));
  });
});

describe("renderPrompt", () => {
  test("resolves blueprint template with project config", async () => {
    const result = await renderPrompt({
      genre: "tech_explainer",
      step: "blueprint",
      projectConfigPath: sampleProjectConfigPath,
    });

    assert.ok(result.resolvedPrompt.includes("Introducing ReScript"));
    assert.ok(result.templatePath.endsWith("prompts/tech-explainer/blueprint.md"));
    assert.deepEqual(result.unresolvedKeys, []);
  });

  test("resolves material template with project config and episodeId override", async () => {
    const result = await renderPrompt({
      genre: "tech_explainer",
      step: "material",
      projectConfigPath: sampleProjectConfigPath,
      episodeId: "E99",
    });

    assert.ok(result.resolvedPrompt.includes("- 対象エピソードID: `E99`"));
    assert.ok(!result.resolvedPrompt.includes("- 対象エピソードID: `{{EPISODE_ID}}`"));
    assert.ok(result.resolvedPrompt.includes('"episode_id": "{{EPISODE_ID}}"'));
    assert.deepEqual(result.unresolvedKeys, []);
  });

  test("throws on unresolved placeholder", async () => {
    // Create a minimal config that is missing required keys
    const { writeFile, unlink } = await import("node:fs/promises");
    const tmpConfig = path.resolve("configs/pipeline/projects/_test_incomplete.json");
    await writeFile(tmpConfig, JSON.stringify({ GENRE: "tech_explainer", PROJECT_TITLE: "Test" }));
    try {
      await assert.rejects(
        () => renderPrompt({
          genre: "tech_explainer",
          step: "blueprint",
          projectConfigPath: tmpConfig,
        }),
        /Unresolved placeholders/
      );
    } finally {
      await unlink(tmpConfig);
    }
  });
});
