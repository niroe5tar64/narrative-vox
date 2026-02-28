import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadCharactersForStep,
  loadDigestStepResources,
  loadMaterialStepResources,
  loadScriptStepResources,
  loadStyleForScript,
} from "@narrative-vox/cli/gen-layer1/loaders.ts";
import type { ProjectConfig } from "@narrative-vox/cli/gen-layer1/shared.ts";

const sampleProjectConfig: ProjectConfig = {
  GENRE_ID: "tech_explainer",
  PROJECT_ID: "example-tech-explainer",
  PROJECT_TITLE: "Tech Explainer: Example Tech Explainer",
  SOURCE_MARKDOWN_PATHS: "data/inputs/books/introducing-rescript/source/*.md",
  STYLE_ID: "radio-talk",
  AUDIENCE_BACKGROUND: "TypeScript/JavaScriptでWeb開発をしているエンジニア",
  AUDIENCE_LEVEL: "ReScript初学者〜中級手前",
  AUDIENCE_INTEREST: "型安全、設計の見通し、保守性、実務での採用判断",
  BASELINE_CONTEXT_OR_EMPTY: "TypeScriptでの実装・設計パターン",
  EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: "",
  PROJECT_BLUEPRINT_JSON_PATH:
    "data/projects/introducing-rescript/run-YYYYMMDD-HHMM/blueprint/project_blueprint.json",
  EPISODE_ID: "E01",
  CAST: {
    lead: "teacher",
    questioner: "student",
  },
};

function withCapturedLogs<T>(
  run: () => Promise<T>,
): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  return run()
    .then((result) => ({ result, logs }))
    .finally(() => {
      console.log = original;
    });
}

describe("loadStyleForScript", () => {
  test("loads style json and logs the resolved path", async () => {
    const { result, logs } = await withCapturedLogs(() =>
      loadStyleForScript({
        stepLabel: "gen-script",
        styleId: sampleProjectConfig.STYLE_ID,
      }),
    );

    assert.equal(typeof result, "object");
    assert.ok(
      logs.some((line) => line.includes("[gen-script] Loading style: ")),
    );
    assert.ok(logs.some((line) => line.includes("configs/content/styles")));
  });
});

describe("loadCharactersForStep", () => {
  test("loads characters and logs per role when enabled", async () => {
    const { result, logs } = await withCapturedLogs(() =>
      loadCharactersForStep({
        stepLabel: "gen-script",
        cast: sampleProjectConfig.CAST,
        logPerRole: true,
      }),
    );

    assert.equal(typeof result.lead, "object");
    assert.equal(typeof result.questioner, "object");
    assert.ok(logs.some((line) => line.includes("Loading character [lead]: ")));
    assert.ok(
      logs.some((line) => line.includes("Loading character [questioner]: ")),
    );
  });

  test("suppresses per-role logs when disabled", async () => {
    const { result, logs } = await withCapturedLogs(() =>
      loadCharactersForStep({
        stepLabel: "gen-digest",
        cast: sampleProjectConfig.CAST,
        logPerRole: false,
      }),
    );

    assert.equal(typeof result.lead, "object");
    assert.equal(logs.length, 0);
  });
});

describe("loadScriptStepResources", () => {
  test("loads material, style, characters, and prior digests", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nv-script-loader-"));
    await mkdir(path.join(tempRoot, "material"), { recursive: true });
    await mkdir(path.join(tempRoot, "context"), { recursive: true });
    await cp(
      "tests/fixtures/sample-run/material/E01_material.json",
      path.join(tempRoot, "material", "E03_material.json"),
    );
    await writeFile(
      path.join(tempRoot, "context", "E01_episode_digest.json"),
      JSON.stringify({ episode_id: "E01" }),
    );
    await writeFile(
      path.join(tempRoot, "context", "E02_episode_digest.json"),
      JSON.stringify({ episode_id: "E02" }),
    );

    const { result, logs } = await withCapturedLogs(() =>
      loadScriptStepResources({
        stepLabel: "gen-script",
        projectConfig: sampleProjectConfig,
        runDir: tempRoot,
        episodeId: "E03",
      }),
    );

    assert.equal(typeof result.material, "object");
    assert.equal(typeof result.style, "object");
    assert.equal(typeof result.characters.lead, "object");
    assert.deepEqual(result.priorDigests, [
      { episode_id: "E01" },
      { episode_id: "E02" },
    ]);
    assert.ok(logs.some((line) => line.includes("Loading material: ")));
    assert.ok(logs.some((line) => line.includes("Loading style: ")));
    assert.ok(logs.some((line) => line.includes("Loading character [lead]: ")));
    assert.ok(logs.every((line) => !line.includes("prior digest")));
  });
});

describe("loadMaterialStepResources", () => {
  test("loads blueprint json and logs the resolved path", async () => {
    const tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "nv-material-loader-"),
    );
    await mkdir(path.join(tempRoot, "blueprint"), { recursive: true });
    await cp(
      "tests/fixtures/sample-run/blueprint/project_blueprint.json",
      path.join(tempRoot, "blueprint", "project_blueprint.json"),
    );

    const { result, logs } = await withCapturedLogs(() =>
      loadMaterialStepResources({
        stepLabel: "gen-material",
        runDir: tempRoot,
      }),
    );

    assert.equal(typeof result.blueprint, "object");
    assert.ok(logs.some((line) => line.includes("Loading blueprint: ")));
  });
});

describe("loadDigestStepResources", () => {
  test("loads script/material/blueprint and suppresses character detail logs", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nv-digest-loader-"));
    await mkdir(path.join(tempRoot, "script"), { recursive: true });
    await mkdir(path.join(tempRoot, "material"), { recursive: true });
    await mkdir(path.join(tempRoot, "blueprint"), { recursive: true });
    await writeFile(
      path.join(tempRoot, "script", "E01_script.md"),
      "## 1. Intro\n[speaker:teacher] Hello\n",
    );
    await cp(
      "tests/fixtures/sample-run/material/E01_material.json",
      path.join(tempRoot, "material", "E01_material.json"),
    );
    await cp(
      "tests/fixtures/sample-run/blueprint/project_blueprint.json",
      path.join(tempRoot, "blueprint", "project_blueprint.json"),
    );

    const { result, logs } = await withCapturedLogs(() =>
      loadDigestStepResources({
        stepLabel: "gen-digest",
        projectConfig: sampleProjectConfig,
        runDir: tempRoot,
        episodeId: "E01",
      }),
    );

    assert.ok(result.scriptContent.includes("[speaker:teacher] Hello"));
    assert.equal(typeof result.material, "object");
    assert.equal(typeof result.blueprint, "object");
    assert.equal(typeof result.characters.lead, "object");
    assert.ok(logs.some((line) => line.includes("Loading script: ")));
    assert.ok(logs.some((line) => line.includes("Loading material: ")));
    assert.ok(logs.some((line) => line.includes("Loading blueprint: ")));
    assert.ok(logs.every((line) => !line.includes("Loading character [")));
  });
});
