import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MorphTokenizer } from "@narrative-vox/infrastructure/japanese-morph-tokenizer.ts";

export const sampleRunDir = path.resolve("tests/fixtures/sample-run");

interface MockMorphToken {
  surface_form: string;
  word_position: number;
}

export function buildMockMorphTokens(
  text: string,
  surfaces: string[],
): MockMorphToken[] {
  const tokens: MockMorphToken[] = [];
  let cursor = 0;
  for (const surface of surfaces) {
    const index = text.indexOf(surface, cursor);
    if (index < 0) {
      throw new Error(
        `Failed to build mock morph token. surface="${surface}" not found in "${text}" from ${cursor}`,
      );
    }
    tokens.push({
      surface_form: surface,
      word_position: index + 1,
    });
    cursor = index + surface.length;
  }
  return tokens;
}

export function createMockMorphTokenizer(
  tokensByText: Record<string, string[]>,
): MorphTokenizer {
  return {
    tokenize: (text: string) =>
      buildMockMorphTokens(text, tokensByText[text] ?? []),
  } as unknown as MorphTokenizer;
}

const sampleMaterial = {
  schema_version: "1.0",
  meta: {
    project_id: "introducing-rescript",
    episode_id: "E01",
    episode_title: "テスト",
    genre: "tech_explainer",
    audience: {
      background: "テスト",
      level: "テスト",
      interest: "テスト",
    },
  },
  sections: [
    {
      section_id: "S01",
      section: "テスト1",
      goal: "テスト",
      elements: [
        {
          element_id: "EL001",
          type: "theme_introduction",
          content: "テスト",
          importance: "must",
        },
      ],
    },
    {
      section_id: "S02",
      section: "テスト2",
      goal: "テスト",
      elements: [
        {
          element_id: "EL002",
          type: "concept",
          content: "テスト",
          importance: "must",
        },
      ],
    },
    {
      section_id: "S03",
      section: "テスト3",
      goal: "テスト",
      elements: [
        {
          element_id: "EL003",
          type: "takeaway",
          content: "テスト",
          importance: "must",
        },
      ],
    },
  ],
  quality_checks: {
    source_coverage: "OK",
    element_dependency_valid: "OK",
    importance_distribution: { must: 3, should: 0, optional: 0 },
  },
};

export async function prepareMinimalRun(
  materialEpisodeIds: string[],
  scriptScripts: Record<string, string>,
): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-run-"));
  const runDir = path.join(tempRoot, "projects", "book", "run-20260211-9999");

  const blueprintDir = path.join(runDir, "blueprint");
  const materialDir = path.join(runDir, "material");
  const scriptDir = path.join(runDir, "script");
  await mkdir(blueprintDir, { recursive: true });
  await mkdir(materialDir, { recursive: true });
  await mkdir(scriptDir, { recursive: true });

  const blueprintRaw = await readFile(
    path.join(sampleRunDir, "blueprint", "project_blueprint.json"),
    "utf-8",
  );
  await writeFile(
    path.join(blueprintDir, "project_blueprint.json"),
    blueprintRaw,
    "utf-8",
  );

  for (const episodeId of materialEpisodeIds) {
    const data = {
      ...sampleMaterial,
      meta: {
        ...sampleMaterial.meta,
        episode_id: episodeId,
      },
    };
    await writeFile(
      path.join(materialDir, `${episodeId}_material.json`),
      `${JSON.stringify(data, null, 2)}\n`,
      "utf-8",
    );
  }

  for (const [episodeId, scriptText] of Object.entries(scriptScripts)) {
    await writeFile(
      path.join(scriptDir, `${episodeId}_script.md`),
      scriptText,
      "utf-8",
    );
  }

  return runDir;
}

export async function updateMaterialFiles(
  runDir: string,
  updater: (
    data: Record<string, unknown>,
    context: { fileName: string; episodeId: string },
  ) => Record<string, unknown>,
): Promise<void> {
  const materialDir = path.join(runDir, "material");
  const materialFiles = (await readdir(materialDir))
    .filter((name) => name.endsWith("_material.json"))
    .sort();

  for (const fileName of materialFiles) {
    const episodeId = fileName.replace("_material.json", "");
    const filePath = path.join(materialDir, fileName);
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const updated = updater(parsed, { fileName, episodeId });
    await writeFile(filePath, `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
  }
}
