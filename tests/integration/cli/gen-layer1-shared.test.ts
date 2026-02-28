import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  analyzeScriptStructure,
  buildStringConfigMap,
  composePrompt,
  loadPriorDigests,
  loadPromptSection,
  type ProjectConfig,
  validateJsonSchema,
} from "@narrative-vox/cli/gen-layer1/shared.ts";

const sampleProjectConfig: ProjectConfig = {
  GENRE_ID: "tech_explainer",
  PROJECT_ID: "tech-explainer.example",
  PROJECT_TITLE: "Example Tech Explainer",
  SOURCE_MARKDOWN_PATHS: "docs/**/*.md",
  STYLE_ID: "tech-explainer-dialogue",
  AUDIENCE_BACKGROUND: "Web developers",
  AUDIENCE_LEVEL: "beginner",
  AUDIENCE_INTEREST: "TypeScript",
  BASELINE_CONTEXT_OR_EMPTY: "",
  EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: "",
  CAST: {
    teacher: "teacher",
    student: "student",
  },
};

describe("buildStringConfigMap", () => {
  test("collects only string values and injects episode id when provided", () => {
    const config = buildStringConfigMap({
      ...sampleProjectConfig,
      COUNT: 3,
    });
    assert.equal(config.PROJECT_TITLE, "Example Tech Explainer");
    assert.equal("COUNT" in config, false);

    const withEpisodeId = buildStringConfigMap(sampleProjectConfig, "E03");
    assert.equal(withEpisodeId.EPISODE_ID, "E03");
  });
});

describe("loadPromptSection", () => {
  test("resolves placeholders for blueprint prompts", async () => {
    const promptSection = await loadPromptSection({
      projectConfig: sampleProjectConfig,
      step: "blueprint",
    });

    assert.ok(promptSection.startsWith("## Prompt"));
    assert.ok(promptSection.includes("Example Tech Explainer"));
  });

  test("injects episode id for material prompts", async () => {
    const promptSection = await loadPromptSection({
      projectConfig: sampleProjectConfig,
      step: "material",
      episodeId: "E09",
    });

    assert.ok(promptSection.includes("`E09`"));
  });

  test("keeps raw prompt section for script prompts", async () => {
    const promptSection = await loadPromptSection({
      projectConfig: sampleProjectConfig,
      step: "script",
    });

    assert.ok(promptSection.startsWith("## Prompt"));
    assert.ok(promptSection.includes("gen-script"));
  });
});

describe("composePrompt", () => {
  test("renders json, markdown, and source fragments with stable separators", () => {
    const prompt = composePrompt("## Prompt\n\nBase", [
      { title: "Blueprint JSON", kind: "json", value: { ok: true } },
      { title: "Script (Markdown)", kind: "markdown", value: "## 1. Intro" },
      {
        title: "Source Materials",
        kind: "fragments",
        value: ["=== a.md ===\nA", "=== b.md ===\nB"],
      },
    ]);

    assert.ok(prompt.includes("## Blueprint JSON"));
    assert.ok(prompt.includes('```json\n{\n  "ok": true\n}\n```'));
    assert.ok(prompt.includes("## Script (Markdown)\n\n## 1. Intro"));
    assert.ok(prompt.includes("=== a.md ===\nA\n\n---\n\n=== b.md ===\nB"));
  });
});

describe("loadPriorDigests", () => {
  test("loads only available previous episode digests", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nv-prior-digests-"));
    const contextDir = path.join(tempRoot, "context");
    await mkdir(contextDir, { recursive: true });
    await writeFile(
      path.join(contextDir, "E01_episode_digest.json"),
      JSON.stringify({ episode_id: "E01" }),
    );
    await writeFile(
      path.join(contextDir, "E03_episode_digest.json"),
      JSON.stringify({ episode_id: "E03" }),
    );

    const digests = await loadPriorDigests(tempRoot, "E04");
    assert.deepEqual(digests, [{ episode_id: "E01" }, { episode_id: "E03" }]);
  });
});

describe("validateJsonSchema", () => {
  test("returns ok for schema-valid blueprint json", async () => {
    const blueprint = JSON.parse(
      await Bun.file(
        "tests/fixtures/sample-run/blueprint/project_blueprint.json",
      ).text(),
    );
    const result = await validateJsonSchema(
      blueprint,
      "schemas/blueprint.schema.json",
    );
    assert.deepEqual(result, { ok: true });
  });

  test("returns failure result instead of throwing for invalid json", async () => {
    const result = await validateJsonSchema(
      { invalid: true },
      "schemas/blueprint.schema.json",
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.message.length > 0);
    }
  });
});

describe("analyzeScriptStructure", () => {
  test("detects empty content and structure markers", () => {
    assert.deepEqual(analyzeScriptStructure(""), {
      isEmpty: true,
      hasSectionHeaders: false,
      hasSpeakerTags: false,
    });

    assert.deepEqual(
      analyzeScriptStructure("## 1. Intro\n[speaker:teacher] Hello"),
      {
        isEmpty: false,
        hasSectionHeaders: true,
        hasSpeakerTags: true,
      },
    );

    assert.deepEqual(analyzeScriptStructure("## 1. Intro\nHello"), {
      isEmpty: false,
      hasSectionHeaders: true,
      hasSpeakerTags: false,
    });
  });
});
