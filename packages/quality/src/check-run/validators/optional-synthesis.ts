import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import type { CollectedArtifacts } from "../artifact-collection.ts";
import type { CheckRunIssue } from "../issues.ts";
import { type VoicevoxTextForCheckRun, diffEpisodes } from "../shared.ts";

export interface OptionalSynthesisResult {
  dictionarySurfacesByEpisodeId: Map<string, string[]>;
  highPriorityDictionarySurfacesByEpisodeId: Map<string, string[]>;
  candidatesWithoutReadingByEpisodeId: Map<string, string[]>;
  validVoicevoxTextByEpisodeId: Set<string>;
}

export async function validateOptionalSynthesis(
  artifacts: CollectedArtifacts,
  plannedEpisodeIds: string[],
): Promise<{ result: OptionalSynthesisResult; issues: CheckRunIssue[] }> {
  const issues: CheckRunIssue[] = [];
  const stage = "optional-synthesis" as const;

  const dictionarySurfacesByEpisodeId = new Map<string, string[]>();
  const highPriorityDictionarySurfacesByEpisodeId = new Map<
    string,
    string[]
  >();
  const candidatesWithoutReadingByEpisodeId = new Map<string, string[]>();
  const validVoicevoxTextByEpisodeId = new Set<string>();

  // Stage order: voicevox_text episodes ⊆ planned episodes
  const voicevoxTextEpisodeIds = [...artifacts.voicevoxTextPaths.keys()].sort();
  const extraVoicevoxText = diffEpisodes(
    voicevoxTextEpisodeIds,
    plannedEpisodeIds,
  );
  if (extraVoicevoxText.length > 0) {
    issues.push({
      stage,
      message: `voicevox_text has episodes not in planned: ${extraVoicevoxText.join(", ")}`,
    });
  }

  for (const [episodeId, filePath] of artifacts.voicevoxTextPaths) {
    try {
      const voicevoxText = await loadJson<VoicevoxTextForCheckRun>(
        filePath,
        SchemaPaths.voicevoxText,
      );
      const surfaces = Array.isArray(voicevoxText.dictionary_candidates)
        ? voicevoxText.dictionary_candidates
            .map((candidate) => candidate.surface)
            .filter(
              (surface): surface is string => typeof surface === "string",
            )
        : [];
      const highPrioritySurfaces = Array.isArray(
        voicevoxText.dictionary_candidates,
      )
        ? voicevoxText.dictionary_candidates
            .filter((candidate) => candidate.priority === "HIGH")
            .map((candidate) => candidate.surface)
            .filter(
              (surface): surface is string => typeof surface === "string",
            )
        : [];
      const highOrMediumWithoutReadingSurfaces = Array.isArray(
        voicevoxText.dictionary_candidates,
      )
        ? voicevoxText.dictionary_candidates
            .filter(
              (candidate) =>
                (candidate.priority === "HIGH" ||
                  candidate.priority === "MEDIUM") &&
                typeof candidate.surface === "string" &&
                String(candidate.reading_or_empty ?? "").trim().length === 0,
            )
            .map((candidate) => candidate.surface)
            .filter(
              (surface): surface is string => typeof surface === "string",
            )
        : [];
      dictionarySurfacesByEpisodeId.set(episodeId, surfaces);
      highPriorityDictionarySurfacesByEpisodeId.set(
        episodeId,
        highPrioritySurfaces,
      );
      candidatesWithoutReadingByEpisodeId.set(
        episodeId,
        highOrMediumWithoutReadingSurfaces,
      );
      validVoicevoxTextByEpisodeId.add(episodeId);
    } catch (error) {
      issues.push({
        stage,
        episodeId,
        message: `voicevox_text schema validation failed: ${(error as Error).message}`,
      });
    }
  }

  // voicevox_project_meta episodes ⊆ voicevox_text episodes
  const metaEpisodeIds = [...artifacts.voicevoxProjectMetaPaths.keys()].sort();
  const extraMeta = diffEpisodes(metaEpisodeIds, voicevoxTextEpisodeIds);
  if (extraMeta.length > 0) {
    issues.push({
      stage,
      message: `voicevox_project_meta has episodes without voicevox_text: ${extraMeta.join(", ")}`,
    });
  }

  for (const [episodeId, filePath] of artifacts.voicevoxProjectMetaPaths) {
    try {
      await loadJson(filePath, SchemaPaths.voicevoxProjectMeta);
    } catch (error) {
      issues.push({
        stage,
        episodeId,
        message: `voicevox_project_meta schema validation failed: ${(error as Error).message}`,
      });
    }
  }

  return {
    result: {
      dictionarySurfacesByEpisodeId,
      highPriorityDictionarySurfacesByEpisodeId,
      candidatesWithoutReadingByEpisodeId,
      validVoicevoxTextByEpisodeId,
    },
    issues,
  };
}
