import type { PerEpisodeStageInfo, RunStatus } from "@narrative-vox/api-types";

const FALLBACK_EPISODE_ID = "E01";

type EpisodeSelectionInput = {
  runKey: string;
  currentEpisodeId: string;
  projectEpisodeId?: string;
  runStatus?: RunStatus;
};

const STAGE_KEYS = [
  "episode_pack",
  "script",
  "series_context",
  "voicevox_text",
  "voicevox_project",
  "audio",
] as const;

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function stageEpisodeIds(stage: PerEpisodeStageInfo): string[] {
  return "episodeIds" in stage ? stage.episodeIds : [];
}

export function collectRunEpisodeIds(runStatus?: RunStatus): string[] {
  if (!runStatus) return [];

  if (runStatus.plannedEpisodeIds.length > 0) {
    return unique(runStatus.plannedEpisodeIds);
  }

  const collected: string[] = [];
  for (const stageKey of STAGE_KEYS) {
    collected.push(...stageEpisodeIds(runStatus.stages[stageKey]));
  }
  return unique(collected);
}

export function resolveEpisodeSelection({
  runKey,
  currentEpisodeId,
  projectEpisodeId,
  runStatus,
}: EpisodeSelectionInput): string {
  const runEpisodeIds = collectRunEpisodeIds(runStatus);

  if (runKey && runEpisodeIds.length > 0) {
    if (runEpisodeIds.includes(currentEpisodeId)) {
      return currentEpisodeId;
    }
    if (projectEpisodeId && runEpisodeIds.includes(projectEpisodeId)) {
      return projectEpisodeId;
    }
    return runEpisodeIds[0];
  }

  return currentEpisodeId || projectEpisodeId || FALLBACK_EPISODE_ID;
}

export function buildEpisodeOptions(input: EpisodeSelectionInput): string[] {
  const runEpisodeIds = collectRunEpisodeIds(input.runStatus);

  if (input.runKey && runEpisodeIds.length > 0) {
    if (
      input.currentEpisodeId &&
      !runEpisodeIds.includes(input.currentEpisodeId)
    ) {
      return [input.currentEpisodeId, ...runEpisodeIds];
    }
    return runEpisodeIds;
  }

  return [resolveEpisodeSelection(input)];
}
