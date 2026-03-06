import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import type { CollectedArtifacts } from "../artifact-collection.ts";
import type { CheckRunIssue } from "../issues.ts";
import { diffEpisodes } from "../shared.ts";

export interface OptionalSynthesisResult {
  validVoicevoxTextEpisodeIds: Set<string>;
}

export async function validateOptionalSynthesis(
  artifacts: CollectedArtifacts,
  plannedEpisodeIds: string[],
): Promise<{ result: OptionalSynthesisResult; issues: CheckRunIssue[] }> {
  const issues: CheckRunIssue[] = [];
  const stage = "optional-synthesis" as const;

  const validVoicevoxTextEpisodeIds = new Set<string>();

  // voicevox_text episodes ⊆ planned episodes
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

  // Validate voicevox_text schema
  for (const [episodeId, filePath] of artifacts.voicevoxTextPaths) {
    try {
      await loadJson(filePath, SchemaPaths.voicevoxText);
      validVoicevoxTextEpisodeIds.add(episodeId);
    } catch (error) {
      issues.push({
        stage,
        episodeId,
        message: `voicevox_text schema validation failed: ${(error as Error).message}`,
      });
    }
  }

  // Validate voicevox_import schema
  for (const [episodeId, filePath] of artifacts.voicevoxImportPaths) {
    try {
      await loadJson(filePath, SchemaPaths.voicevoxProjectImport);
    } catch (error) {
      issues.push({
        stage,
        episodeId,
        message: `voicevox_import schema validation failed: ${(error as Error).message}`,
      });
    }
  }

  // voicevox_project presence rule: .vvproj and project_meta must both exist
  const vvprojEpisodeIds = new Set(artifacts.voicevoxProjectPaths.keys());
  const metaEpisodeIds = new Set(artifacts.voicevoxProjectMetaPaths.keys());
  const allProjectEpisodes = new Set([...vvprojEpisodeIds, ...metaEpisodeIds]);
  for (const episodeId of allProjectEpisodes) {
    const hasVvproj = vvprojEpisodeIds.has(episodeId);
    const hasMeta = metaEpisodeIds.has(episodeId);
    if (hasVvproj && !hasMeta) {
      issues.push({
        stage,
        episodeId,
        message: "voicevox_project has .vvproj but missing project_meta",
      });
    }
    if (!hasVvproj && hasMeta) {
      issues.push({
        stage,
        episodeId,
        message: "voicevox_project has project_meta but missing .vvproj",
      });
    }
  }

  // Validate voicevox_project_meta schema
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

  // Stage order dependencies: script → voicevox_text → voicevox_project → audio
  const scriptEpisodeIds = new Set(artifacts.scriptPaths.keys());
  const vvTextEpisodeIds = new Set(artifacts.voicevoxTextPaths.keys());

  // voicevox_text requires script
  for (const episodeId of vvTextEpisodeIds) {
    if (!scriptEpisodeIds.has(episodeId)) {
      issues.push({
        stage,
        episodeId,
        message: "voicevox_text exists without script (stage order violation)",
      });
    }
  }

  // voicevox_project requires voicevox_text
  for (const episodeId of allProjectEpisodes) {
    if (!vvTextEpisodeIds.has(episodeId)) {
      issues.push({
        stage,
        episodeId,
        message: "voicevox_project exists without voicevox_text (stage order violation)",
      });
    }
  }

  // audio requires voicevox_project
  const audioEpisodeIds = new Set(artifacts.audioWavPaths.keys());
  for (const episodeId of audioEpisodeIds) {
    if (!vvprojEpisodeIds.has(episodeId)) {
      issues.push({
        stage,
        episodeId,
        message: "audio exists without voicevox_project (stage order violation)",
      });
    }
  }

  return {
    result: {
      validVoicevoxTextEpisodeIds,
    },
    issues,
  };
}
