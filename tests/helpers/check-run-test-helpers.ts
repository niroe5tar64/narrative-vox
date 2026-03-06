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

const sampleBlueprint = {
  meta: {
    project_title: "Test Project",
    audience_background: "テスト",
    audience_level: "テスト",
    audience_interest: "テスト",
    baseline_context_or_empty: "テスト",
    existing_audio_script_dir_or_empty: "",
    episode_duration_target: "10-12min",
  },
  project_intent: {
    primary_message: "テスト",
    learning_outcomes: ["テスト"],
  },
  theme_catalog: [
    {
      theme_id: "T01",
      theme_title: "テストテーマ",
      theme_summary: "テスト",
      chapter_refs: ["01_Chapter-1/Test"],
      prerequisite_theme_ids: [],
      importance: "HIGH",
    },
  ],
  coverage_matrix: { chapters: [], themes: [] },
  continuity_plan: {
    existing_episode_ids_if_any: [],
    overlap_risk_summary: "N/A",
    reuse_or_rewrite_recommendations: [],
  },
  quality_checks: {
    chapter_coverage_complete: "OK",
    theme_coverage_complete: "OK",
    dependency_order_valid: "OK",
    episode_granularity_valid: "OK",
    known_gaps: [],
  },
};

const sampleSourceIndex = {
  schema_version: "1.0",
  meta: {
    project_id: "introducing-rescript",
    genre_id: "tech-explainer",
    generated_at: "2026-01-01T00:00:00.000Z",
    section_count: 1,
    token_estimate_total: 100,
  },
  sections: [
    {
      section_id: "SRC0001",
      ordinal: 1,
      source_type: "markdown_section",
      display_title: "Test Section",
      preview_text: "test",
      char_count: 100,
      token_estimate: 100,
      is_auxiliary: false,
      path: "01_Chapter-1.md",
      heading_path: ["Chapter 1"],
      body_markdown: "# Test\n\nTest content.",
    },
  ],
};

function buildSampleEpisodePack(episodeId: string) {
  return {
    schema_version: "1.0",
    meta: {
      project_id: "introducing-rescript",
      run_id: "run-20260211-9999",
      episode_id: episodeId,
      episode_title: "テスト",
      genre_id: "tech-explainer",
      generated_at: "2026-01-01T00:00:00.000Z",
      source_blueprint_path: "blueprint/project_blueprint.json",
      source_index_path: "source_index/source_index.json",
    },
    learning_goal: "テスト",
    scope_guardrails: [],
    comparison_mode: "with_baseline",
    target_theme_ids: ["T01"],
    source_section_ids: ["SRC0001"],
    source_sections: [
      {
        section_id: "SRC0001",
        display_title: "Test",
        token_estimate: 100,
        body: "test",
      },
    ],
    narrative_outline: [
      {
        outline_id: "S01",
        title: "テスト1",
        goal: "テスト",
        required_fact_ids: ["F001"],
      },
      {
        outline_id: "S02",
        title: "テスト2",
        goal: "テスト",
        required_fact_ids: ["F002"],
      },
      {
        outline_id: "S03",
        title: "テスト3",
        goal: "テスト",
        required_fact_ids: ["F003"],
      },
    ],
    facts: [
      {
        fact_id: "F001",
        kind: "theme_intro",
        statement: "テスト",
        source_section_ids: ["SRC0001"],
        target_theme_ids: ["T01"],
        depends_on: [],
        importance: "must",
      },
      {
        fact_id: "F002",
        kind: "definition",
        statement: "テスト",
        source_section_ids: ["SRC0001"],
        target_theme_ids: ["T01"],
        depends_on: ["F001"],
        importance: "must",
      },
      {
        fact_id: "F003",
        kind: "takeaway",
        statement: "テスト",
        source_section_ids: ["SRC0001"],
        target_theme_ids: ["T01"],
        depends_on: [],
        importance: "must",
      },
    ],
    technical_terms: [],
    continuity_hooks: {
      listener_state_additions: [],
      open_loops_opened: [],
      open_loops_resolved: [],
      next_episode_handoff: [],
    },
  };
}

function buildSampleSeriesContext(episodeId: string) {
  return {
    schema_version: "1.0",
    meta: {
      project_id: "introducing-rescript",
      run_id: "run-20260211-9999",
      through_episode_id: episodeId,
      generated_at: "2026-01-01T00:00:00.000Z",
      source_episode_pack_path: `episode_pack/${episodeId}_episode_pack.json`,
      source_script_path: `script/${episodeId}_script.md`,
    },
    completed_episode_ids: [episodeId],
    covered_theme_ids: ["T01"],
    covered_source_section_ids: ["SRC0001"],
    introduced_technical_terms: [],
    listener_state: [],
    open_loops: [],
    resolved_loop_ids: [],
    latest_episode: {
      episode_id: episodeId,
      episode_title: "テスト",
      handoff_to_next_episode: [],
      section_count: 3,
      utterance_count: 3,
      speaker_turns: [
        { speaker_key: "teacher", utterance_count: 2 },
        { speaker_key: "student", utterance_count: 1 },
      ],
    },
  };
}

export async function prepareMinimalRun(
  episodeIds: string[],
  scriptScripts: Record<string, string>,
): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-run-"));
  const runDir = path.join(
    tempRoot,
    "projects",
    "introducing-rescript",
    "run-20260211-9999",
  );

  const blueprintDir = path.join(runDir, "blueprint");
  const sourceIndexDir = path.join(runDir, "source_index");
  const episodePackDir = path.join(runDir, "episode_pack");
  const scriptDir = path.join(runDir, "script");
  const seriesContextDir = path.join(runDir, "series_context");
  await mkdir(blueprintDir, { recursive: true });
  await mkdir(sourceIndexDir, { recursive: true });
  await mkdir(episodePackDir, { recursive: true });
  await mkdir(scriptDir, { recursive: true });
  await mkdir(seriesContextDir, { recursive: true });

  // run-contract
  const runContract = {
    version: 1,
    projectId: "introducing-rescript",
    runId: "run-20260211-9999",
    runDir: runDir,
    createdAt: "2026-02-11T99:99:00.000Z",
  };
  await writeFile(
    path.join(runDir, "run-contract.json"),
    `${JSON.stringify(runContract, null, 2)}\n`,
    "utf-8",
  );

  // blueprint with episode_plan for all episodeIds
  const blueprint = {
    ...sampleBlueprint,
    episode_plan: episodeIds.map((id) => ({
      episode_id: id,
      episode_title: "テスト",
      target_theme_ids: ["T01"],
      learning_goal: "テスト",
      source_refs: ["01_Chapter-1/Test"],
      scope_guardrails: [],
      comparison_mode_default: "with_baseline",
    })),
  };
  await writeFile(
    path.join(blueprintDir, "project_blueprint.json"),
    `${JSON.stringify(blueprint, null, 2)}\n`,
    "utf-8",
  );

  // source_index
  await writeFile(
    path.join(sourceIndexDir, "source_index.json"),
    `${JSON.stringify(sampleSourceIndex, null, 2)}\n`,
    "utf-8",
  );

  // episode_packs
  for (const episodeId of episodeIds) {
    await writeFile(
      path.join(episodePackDir, `${episodeId}_episode_pack.json`),
      `${JSON.stringify(buildSampleEpisodePack(episodeId), null, 2)}\n`,
      "utf-8",
    );
  }

  // scripts
  for (const [episodeId, scriptText] of Object.entries(scriptScripts)) {
    await writeFile(
      path.join(scriptDir, `${episodeId}_script.md`),
      scriptText,
      "utf-8",
    );
  }

  // series_contexts
  for (const episodeId of episodeIds) {
    await writeFile(
      path.join(seriesContextDir, `${episodeId}_series_context.json`),
      `${JSON.stringify(buildSampleSeriesContext(episodeId), null, 2)}\n`,
      "utf-8",
    );
  }

  return runDir;
}

export async function updateSeriesContextFiles(
  runDir: string,
  updater: (
    data: Record<string, unknown>,
    context: { fileName: string; episodeId: string },
  ) => Record<string, unknown>,
): Promise<void> {
  const seriesContextDir = path.join(runDir, "series_context");
  const ctxFiles = (await readdir(seriesContextDir))
    .filter((name) => name.endsWith("_series_context.json"))
    .sort();

  for (const fileName of ctxFiles) {
    const episodeId = fileName.replace("_series_context.json", "");
    const filePath = path.join(seriesContextDir, fileName);
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const updated = updater(parsed, { fileName, episodeId });
    await writeFile(filePath, `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
  }
}

export async function updateEpisodePackFiles(
  runDir: string,
  updater: (
    data: Record<string, unknown>,
    context: { fileName: string; episodeId: string },
  ) => Record<string, unknown>,
): Promise<void> {
  const episodePackDir = path.join(runDir, "episode_pack");
  const packFiles = (await readdir(episodePackDir))
    .filter((name) => name.endsWith("_episode_pack.json"))
    .sort();

  for (const fileName of packFiles) {
    const episodeId = fileName.replace("_episode_pack.json", "");
    const filePath = path.join(episodePackDir, fileName);
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const updated = updater(parsed, { fileName, episodeId });
    await writeFile(filePath, `${JSON.stringify(updated, null, 2)}\n`, "utf-8");
  }
}
