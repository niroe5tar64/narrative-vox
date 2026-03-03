import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSectionHeader } from "@narrative-vox/domain/script-structure.ts";
import { parseSpeakerTag } from "@narrative-vox/domain/speaker-tag.ts";
import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import { validateAgainstSchema } from "@narrative-vox/infrastructure/schema-validator.ts";
import { assertArtifactAbsent } from "./shared/immutable-run.ts";
import {
  type AuthoringMetrics,
  writeAuthoringMetrics,
} from "./shared/metrics.ts";

export interface UpdateSeriesContextOptions {
  projectId: string;
  episodeId: string;
  runDir: string;
}

interface EpisodePack {
  meta: {
    project_id: string;
    run_id: string;
    episode_id: string;
    episode_title: string;
    genre_id: string;
    [key: string]: unknown;
  };
  target_theme_ids: string[];
  source_section_ids: string[];
  technical_terms: Array<{ term: string; [key: string]: unknown }>;
  continuity_hooks: {
    listener_state_additions: string[];
    open_loops_opened: Array<{
      loop_id: string;
      label: string;
      target_episode_id?: string;
    }>;
    open_loops_resolved: string[];
    next_episode_handoff: string[];
  };
  [key: string]: unknown;
}

interface SeriesContext {
  schema_version: string;
  meta: {
    project_id: string;
    run_id: string;
    through_episode_id: string;
    generated_at: string;
    source_episode_pack_path: string;
    source_script_path: string;
    previous_series_context_path?: string;
  };
  completed_episode_ids: string[];
  covered_theme_ids: string[];
  covered_source_section_ids: string[];
  introduced_technical_terms: string[];
  listener_state: string[];
  open_loops: Array<{
    loop_id: string;
    label: string;
    opened_in_episode_id: string;
    target_episode_id?: string;
  }>;
  resolved_loop_ids: string[];
  latest_episode: {
    episode_id: string;
    episode_title: string;
    handoff_to_next_episode: string[];
    section_count: number;
    utterance_count: number;
    speaker_turns: Array<{
      speaker_key: string;
      utterance_count: number;
    }>;
  };
}

function appendUnique<T>(base: T[], additions: T[]): T[] {
  const set = new Set(base);
  for (const item of additions) {
    set.add(item);
  }
  return [...set];
}

function analyzeScript(scriptText: string): {
  sectionCount: number;
  utteranceCount: number;
  speakerTurns: Array<{ speaker_key: string; utterance_count: number }>;
} {
  const lines = scriptText.split(/\r?\n/);
  let sectionCount = 0;
  let utteranceCount = 0;
  const speakerCounts = new Map<string, number>();

  for (const line of lines) {
    if (parseSectionHeader(line)) {
      sectionCount++;
    }
    const tag = parseSpeakerTag(line);
    if (tag) {
      utteranceCount++;
      speakerCounts.set(
        tag.speakerKey,
        (speakerCounts.get(tag.speakerKey) ?? 0) + 1,
      );
    }
  }

  const speakerTurns = [...speakerCounts.entries()].map(
    ([speaker_key, count]) => ({
      speaker_key,
      utterance_count: count,
    }),
  );

  return { sectionCount, utteranceCount, speakerTurns };
}

function episodeNumber(episodeId: string): number {
  return Number.parseInt(episodeId.replace("E", ""), 10);
}

export async function updateSeriesContext(
  options: UpdateSeriesContextOptions,
): Promise<void> {
  const stepLabel = "update-series-context";
  const startedAt = new Date();
  const { projectId, episodeId, runDir } = options;

  console.log(`[${stepLabel}] Updating series context for ${episodeId}`);

  // Paths
  const episodePackPath = path.join(
    runDir,
    "episode_pack",
    `${episodeId}_episode_pack.json`,
  );
  const scriptPath = path.join(runDir, "script", `${episodeId}_script.md`);
  const contextDir = path.join(runDir, "series_context");
  const outputPath = path.join(
    contextDir,
    `${episodeId}_series_context.json`,
  );

  await assertArtifactAbsent(outputPath, "UPDATE_SERIES_CONTEXT");

  // Load inputs
  const episodePack = await loadJson<EpisodePack>(
    episodePackPath,
    SchemaPaths.episodePack,
  );
  const scriptText = await readFile(scriptPath, "utf-8");

  // Load previous series context if E02+
  let prevContext: SeriesContext | null = null;
  let previousContextPath: string | undefined;
  const epNum = episodeNumber(episodeId);
  if (epNum > 1) {
    const prevEpId = `E${String(epNum - 1).padStart(2, "0")}`;
    previousContextPath = path.join(
      contextDir,
      `${prevEpId}_series_context.json`,
    );
    prevContext = await loadJson<SeriesContext>(
      previousContextPath,
      SchemaPaths.seriesContext,
    );
    console.log(`[${stepLabel}] Loaded previous context: ${prevEpId}`);
  }

  // Load blueprint for run_id
  const blueprintPath = path.join(
    runDir,
    "blueprint",
    "project_blueprint.json",
  );
  const blueprint = await loadJson<{ meta: Record<string, unknown> }>(
    blueprintPath,
    SchemaPaths.blueprint,
  );

  // Analyze script
  const scriptAnalysis = analyzeScript(scriptText);

  // Build series context
  const baseCompletedEpisodes = prevContext?.completed_episode_ids ?? [];
  const baseCoveredThemes = prevContext?.covered_theme_ids ?? [];
  const baseCoveredSections = prevContext?.covered_source_section_ids ?? [];
  const baseTerms = prevContext?.introduced_technical_terms ?? [];
  const baseListenerState = prevContext?.listener_state ?? [];
  const baseOpenLoops = prevContext?.open_loops ?? [];
  const baseResolvedLoopIds = prevContext?.resolved_loop_ids ?? [];

  // Resolve loops: remove those resolved in this episode
  const newResolvedIds = episodePack.continuity_hooks.open_loops_resolved;
  const resolvedLoopIds = appendUnique(baseResolvedLoopIds, newResolvedIds);
  const resolvedSet = new Set(resolvedLoopIds);

  // Filter open loops: keep unresolved, add newly opened
  const remainingLoops = baseOpenLoops.filter(
    (l) => !resolvedSet.has(l.loop_id),
  );
  const newLoops = episodePack.continuity_hooks.open_loops_opened.map(
    (loop) => ({
      loop_id: loop.loop_id,
      label: loop.label,
      opened_in_episode_id: episodeId,
      target_episode_id: loop.target_episode_id,
    }),
  );
  const openLoops = [...remainingLoops, ...newLoops];

  const findRunIdFromBlueprint = (): string => {
    const contract = path.basename(path.dirname(runDir));
    // Fallback: use run-id from runDir path
    const segments = path.resolve(runDir).split(path.sep);
    for (let i = segments.length - 1; i >= 0; i--) {
      if (/^run-\d{8}-\d{4}$/.test(segments[i])) return segments[i];
    }
    return "unknown";
  };

  const seriesContext: SeriesContext = {
    schema_version: "1.0",
    meta: {
      project_id: projectId,
      run_id: findRunIdFromBlueprint(),
      through_episode_id: episodeId,
      generated_at: new Date().toISOString(),
      source_episode_pack_path: path.relative(runDir, episodePackPath),
      source_script_path: path.relative(runDir, scriptPath),
      ...(previousContextPath
        ? {
            previous_series_context_path: path.relative(
              runDir,
              previousContextPath,
            ),
          }
        : {}),
    },
    completed_episode_ids: appendUnique(baseCompletedEpisodes, [episodeId]),
    covered_theme_ids: appendUnique(
      baseCoveredThemes,
      episodePack.target_theme_ids,
    ),
    covered_source_section_ids: appendUnique(
      baseCoveredSections,
      episodePack.source_section_ids,
    ),
    introduced_technical_terms: appendUnique(
      baseTerms,
      episodePack.technical_terms.map((t) => t.term),
    ),
    listener_state: appendUnique(
      baseListenerState,
      episodePack.continuity_hooks.listener_state_additions,
    ),
    open_loops: openLoops,
    resolved_loop_ids: resolvedLoopIds,
    latest_episode: {
      episode_id: episodeId,
      episode_title: episodePack.meta.episode_title,
      handoff_to_next_episode:
        episodePack.continuity_hooks.next_episode_handoff,
      section_count: scriptAnalysis.sectionCount,
      utterance_count: scriptAnalysis.utteranceCount,
      speaker_turns: scriptAnalysis.speakerTurns,
    },
  };

  // Validate
  try {
    await validateAgainstSchema(seriesContext, SchemaPaths.seriesContext);
    console.log(`[${stepLabel}] Schema validation: OK`);
  } catch (error) {
    console.log(
      `[${stepLabel}] Schema validation: WARN - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Write
  await mkdir(contextDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(seriesContext, null, 2)}\n`);
  console.log(
    `[${stepLabel}] Saved: ${path.relative(process.cwd(), outputPath)}`,
  );

  // Metrics
  const finishedAt = new Date();
  const metrics: AuthoringMetrics = {
    step: stepLabel,
    projectId,
    episodeId,
    runDir,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    sectionCount: scriptAnalysis.sectionCount,
    utteranceCount: scriptAnalysis.utteranceCount,
    speakerCount: scriptAnalysis.speakerTurns.length,
  };
  await writeAuthoringMetrics({
    runDir,
    step: stepLabel,
    episodeId,
    metrics,
  });
}

// Exported for testing
export { appendUnique as _appendUnique, analyzeScript as _analyzeScript };
