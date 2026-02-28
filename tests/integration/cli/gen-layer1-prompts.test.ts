import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildBlueprintPrompt,
  buildDigestPrompt,
  buildMaterialPrompt,
  buildScriptPrompt,
} from "@narrative-vox/cli/gen-layer1/prompts.ts";

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

async function withTempProjectConfig<T>(
  config: Record<string, unknown>,
  run: (projectId: string) => Promise<T>,
): Promise<T> {
  const projectId = `_test_gen_layer1_${crypto.randomUUID().replaceAll("-", "")}`;
  const configPath = path.resolve(
    "configs/pipeline/projects",
    `${projectId}.json`,
  );
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  try {
    return await run(projectId);
  } finally {
    await rm(configPath, { force: true });
  }
}

async function createRepoSourceFixture(): Promise<{
  glob: string;
  cleanup: () => Promise<void>;
}> {
  const dirName = `tmp/gen-layer1-prompts-${crypto.randomUUID().slice(0, 8)}`;
  const sourceDir = path.resolve(dirName);
  await mkdir(sourceDir, { recursive: true });
  await writeFile(path.join(sourceDir, "a.md"), "# A\nalpha\n");
  await writeFile(path.join(sourceDir, "b.md"), "# B\nbeta\n");
  return {
    glob: `${dirName}/*.md`,
    cleanup: () => rm(sourceDir, { recursive: true, force: true }),
  };
}

function makeProjectConfig(sourceGlob: string): Record<string, unknown> {
  return {
    GENRE_ID: "tech-explainer",
    PROJECT_ID: "example-tech-explainer",
    PROJECT_TITLE: "Tech Explainer: Example Tech Explainer",
    SOURCE_MARKDOWN_PATHS: sourceGlob,
    AUDIENCE_BACKGROUND: "TypeScript/JavaScriptでWeb開発をしているエンジニア",
    AUDIENCE_LEVEL: "ReScript初学者〜中級手前",
    AUDIENCE_INTEREST: "型安全、設計の見通し、保守性、実務での採用判断",
    BASELINE_CONTEXT_OR_EMPTY: "TypeScriptでの実装・設計パターン",
    EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: "",
    PROJECT_BLUEPRINT_JSON_PATH:
      "data/projects/introducing-rescript/run-YYYYMMDD-HHMM/blueprint/project_blueprint.json",
    EPISODE_ID: "E01",
    STYLE_ID: "radio-talk",
    CAST: {
      lead: "teacher",
      questioner: "student",
    },
  };
}

describe("buildBlueprintPrompt", () => {
  test("loads project context and source materials, then returns a full prompt", async () => {
    const sourceFixture = await createRepoSourceFixture();
    try {
      await withTempProjectConfig(
        makeProjectConfig(sourceFixture.glob),
        async (projectId) => {
          const { result, logs } = await withCapturedLogs(() =>
            buildBlueprintPrompt({
              stepLabel: "gen-blueprint",
              projectId,
            }),
          );

          assert.ok(result.startsWith("## Prompt"));
          assert.ok(result.includes("## Source Materials"));
          assert.ok(result.includes("=== tmp/"));
          assert.ok(result.includes("alpha"));
          assert.ok(result.includes("beta"));
          assert.ok(
            logs.some((line) => line.includes("Loading project config: ")),
          );
          assert.ok(
            logs.some((line) => line.includes("Resolving prompt template: ")),
          );
          assert.ok(
            logs.some((line) => line.includes("Loading source files: ")),
          );
        },
      );
    } finally {
      await sourceFixture.cleanup();
    }
  });
});

describe("buildMaterialPrompt", () => {
  test("loads blueprint and source materials in the expected section order", async () => {
    const sourceFixture = await createRepoSourceFixture();
    const tempRunDir = await mkdtemp(
      path.join(os.tmpdir(), "nv-build-material-prompt-"),
    );
    await mkdir(path.join(tempRunDir, "blueprint"), { recursive: true });
    await cp(
      "tests/fixtures/sample-run/blueprint/project_blueprint.json",
      path.join(tempRunDir, "blueprint", "project_blueprint.json"),
    );

    try {
      await withTempProjectConfig(
        makeProjectConfig(sourceFixture.glob),
        async (projectId) => {
          const { result, logs } = await withCapturedLogs(() =>
            buildMaterialPrompt({
              stepLabel: "gen-material",
              projectId,
              episodeId: "E09",
              runDir: tempRunDir,
            }),
          );

          assert.ok(result.includes("## Blueprint JSON"));
          assert.ok(result.includes("## Source Materials"));
          assert.ok(
            result.indexOf("## Blueprint JSON") <
              result.indexOf("## Source Materials"),
          );
          assert.ok(logs.some((line) => line.includes("Loading blueprint: ")));
          assert.ok(
            logs.some((line) => line.includes("Loading source files: ")),
          );
        },
      );
    } finally {
      await sourceFixture.cleanup();
      await rm(tempRunDir, { recursive: true, force: true });
    }
  });
});

describe("buildScriptPrompt", () => {
  test("builds script prompt with prior digests when available", async () => {
    const tempRunDir = await mkdtemp(
      path.join(os.tmpdir(), "nv-build-script-prompt-"),
    );
    await mkdir(path.join(tempRunDir, "material"), { recursive: true });
    await mkdir(path.join(tempRunDir, "context"), { recursive: true });
    await cp(
      "tests/fixtures/sample-run/material/E01_material.json",
      path.join(tempRunDir, "material", "E03_material.json"),
    );
    await writeFile(
      path.join(tempRunDir, "context", "E01_episode_digest.json"),
      JSON.stringify({ episode_id: "E01" }),
    );
    await writeFile(
      path.join(tempRunDir, "context", "E02_episode_digest.json"),
      JSON.stringify({ episode_id: "E02" }),
    );

    await withTempProjectConfig(makeProjectConfig(""), async (projectId) => {
      const { result, logs } = await withCapturedLogs(() =>
        buildScriptPrompt({
          stepLabel: "gen-script",
          projectId,
          episodeId: "E03",
          runDir: tempRunDir,
        }),
      );

      assert.ok(result.includes("## Material JSON"));
      assert.ok(result.includes("## Style JSON"));
      assert.ok(result.includes("## Character Profiles"));
      assert.ok(result.includes("## Prior Episode Digests"));
      assert.ok(logs.some((line) => line.includes("Loading material: ")));
      assert.ok(logs.some((line) => line.includes("Loading style: ")));
      assert.ok(
        logs.some((line) => line.includes("Loading character [lead]: ")),
      );
    });

    await rm(tempRunDir, { recursive: true, force: true });
  });

  test("omits prior digest section when none exist", async () => {
    const tempRunDir = await mkdtemp(
      path.join(os.tmpdir(), "nv-build-script-prompt-empty-"),
    );
    await mkdir(path.join(tempRunDir, "material"), { recursive: true });
    await cp(
      "tests/fixtures/sample-run/material/E01_material.json",
      path.join(tempRunDir, "material", "E01_material.json"),
    );

    await withTempProjectConfig(makeProjectConfig(""), async (projectId) => {
      const prompt = await buildScriptPrompt({
        stepLabel: "gen-script",
        projectId,
        episodeId: "E01",
        runDir: tempRunDir,
      });

      assert.ok(!prompt.includes("## Prior Episode Digests"));
    });

    await rm(tempRunDir, { recursive: true, force: true });
  });
});

describe("buildDigestPrompt", () => {
  test("builds digest prompt with expected section order and no character detail logs", async () => {
    const tempRunDir = await mkdtemp(
      path.join(os.tmpdir(), "nv-build-digest-prompt-"),
    );
    await mkdir(path.join(tempRunDir, "script"), { recursive: true });
    await mkdir(path.join(tempRunDir, "material"), { recursive: true });
    await mkdir(path.join(tempRunDir, "blueprint"), { recursive: true });
    await writeFile(
      path.join(tempRunDir, "script", "E01_script.md"),
      "## 1. Intro\n[speaker:teacher] Hello\n",
    );
    await cp(
      "tests/fixtures/sample-run/material/E01_material.json",
      path.join(tempRunDir, "material", "E01_material.json"),
    );
    await cp(
      "tests/fixtures/sample-run/blueprint/project_blueprint.json",
      path.join(tempRunDir, "blueprint", "project_blueprint.json"),
    );

    await withTempProjectConfig(makeProjectConfig(""), async (projectId) => {
      const { result, logs } = await withCapturedLogs(() =>
        buildDigestPrompt({
          stepLabel: "gen-digest",
          projectId,
          episodeId: "E01",
          runDir: tempRunDir,
        }),
      );

      assert.ok(
        result.indexOf("## Script (Markdown)") <
          result.indexOf("## Material JSON"),
      );
      assert.ok(
        result.indexOf("## Material JSON") <
          result.indexOf("## Blueprint JSON"),
      );
      assert.ok(
        result.indexOf("## Blueprint JSON") <
          result.indexOf("## Character Profiles"),
      );
      assert.ok(logs.some((line) => line.includes("Loading script: ")));
      assert.ok(logs.some((line) => line.includes("Loading material: ")));
      assert.ok(logs.some((line) => line.includes("Loading blueprint: ")));
      assert.ok(logs.every((line) => !line.includes("Loading character [")));
    });

    await rm(tempRunDir, { recursive: true, force: true });
  });
});
