import type { PerEpisodeStageInfo, RunStatus } from "@narrative-vox/api-types";

type EpisodeSelectionInput = {
  runKey: string;
  currentEpisodeId: string;
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
  runStatus,
}: EpisodeSelectionInput): string {
  const plannedEpisodeIds = runStatus?.plannedEpisodeIds ?? [];

  if (runKey && plannedEpisodeIds.length > 0) {
    if (plannedEpisodeIds.includes(currentEpisodeId)) {
      return currentEpisodeId;
    }
    return plannedEpisodeIds[0];
  }

  return currentEpisodeId || "";
}

export function buildEpisodeOptions(input: EpisodeSelectionInput): string[] {
  const plannedEpisodeIds = input.runStatus?.plannedEpisodeIds ?? [];

  if (input.runKey && plannedEpisodeIds.length > 0) {
    return plannedEpisodeIds;
  }

  return [];
}
