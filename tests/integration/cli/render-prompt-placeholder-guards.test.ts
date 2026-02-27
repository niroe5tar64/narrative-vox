import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { renderPrompt } from "@narrative-vox/cli/render-prompt.ts";

test("renderPrompt rejects config values containing placeholder syntax", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "nv-render-prompt-"));
  const configPath = path.join(dir, "project.json");
  await writeFile(
    configPath,
    JSON.stringify({
      GENRE_ID: "tech-explainer",
      PROJECT_ID: "tmp-project",
      PROJECT_TITLE: "{{MALICIOUS}}",
      SOURCE_MARKDOWN_PATHS: "data/inputs/books/example/*.md",
      STYLE_ID: "radio-talk",
      CAST: {},
      AUDIENCE_BACKGROUND: "readers",
      AUDIENCE_LEVEL: "beginner",
      AUDIENCE_INTEREST: "typing",
      BASELINE_CONTEXT_OR_EMPTY: "",
      EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: "",
      PROJECT_BLUEPRINT_JSON_PATH: "",
      EPISODE_ID: "E01",
    }),
  );

  try {
    await assert.rejects(
      () =>
        renderPrompt({
          genre: "tech_explainer",
          step: "blueprint",
          projectConfigPath: configPath,
        }),
      /contains unsupported placeholder syntax/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
