import { readdir } from "node:fs/promises";
import path from "node:path";
import type { CheckRunIssue } from "./issues.ts";
import {
  AUDIO_WAV_FILE_RE,
  EPISODE_PACK_FILE_RE,
  SCRIPT_FILE_RE,
  SERIES_CONTEXT_FILE_RE,
  VOICEVOX_IMPORT_FILE_RE,
  VOICEVOX_TEXT_FILE_RE,
  VVPROJ_FILE_RE,
  VVPROJ_META_RE,
  collectEpisodeIds,
  pathExists,
} from "./shared.ts";

export interface CollectedArtifacts {
  runContractPath: string | null;
  sourceIndexPath: string | null;
  blueprintPath: string | null;

  episodePackPaths: Map<string, string>;
  scriptPaths: Map<string, string>;
  seriesContextPaths: Map<string, string>;
  voicevoxTextPaths: Map<string, string>;
  voicevoxProjectPaths: Map<string, string>;
  voicevoxProjectMetaPaths: Map<string, string>;
  voicevoxImportPaths: Map<string, string>;
  audioWavPaths: Map<string, string>;
  audioManifestPath: string | null;
}

async function scanDir(
  dirPath: string,
  pattern: RegExp,
): Promise<Map<string, string>> {
  if (!(await pathExists(dirPath))) {
    return new Map();
  }
  const files = (await readdir(dirPath))
    .filter((name) => pattern.test(name))
    .sort();
  const episodeIds = collectEpisodeIds(files, pattern);
  const result = new Map<string, string>();
  for (let i = 0; i < files.length; i++) {
    const episodeId = episodeIds[i];
    const fileName = files[i];
    if (episodeId && fileName) {
      result.set(episodeId, path.join(dirPath, fileName));
    }
  }
  return result;
}

export async function collectArtifacts(
  resolvedRunDir: string,
): Promise<{ artifacts: CollectedArtifacts; issues: CheckRunIssue[] }> {
  const issues: CheckRunIssue[] = [];

  const runContractCandidate = path.join(resolvedRunDir, "run-contract.json");
  const runContractPath = (await pathExists(runContractCandidate))
    ? runContractCandidate
    : null;

  const sourceIndexCandidate = path.join(
    resolvedRunDir,
    "source_index",
    "source_index.json",
  );
  const sourceIndexPath = (await pathExists(sourceIndexCandidate))
    ? sourceIndexCandidate
    : null;

  const blueprintCandidate = path.join(
    resolvedRunDir,
    "blueprint",
    "project_blueprint.json",
  );
  const blueprintPath = (await pathExists(blueprintCandidate))
    ? blueprintCandidate
    : null;

  const audioManifestCandidate = path.join(
    resolvedRunDir,
    "audio",
    "audio_manifest.json",
  );
  const audioManifestPath = (await pathExists(audioManifestCandidate))
    ? audioManifestCandidate
    : null;

  const [
    episodePackPaths,
    scriptPaths,
    seriesContextPaths,
    voicevoxTextPaths,
    voicevoxProjectPaths,
    voicevoxProjectMetaPaths,
    voicevoxImportPaths,
    audioWavPaths,
  ] = await Promise.all([
    scanDir(path.join(resolvedRunDir, "episode_pack"), EPISODE_PACK_FILE_RE),
    scanDir(path.join(resolvedRunDir, "script"), SCRIPT_FILE_RE),
    scanDir(path.join(resolvedRunDir, "series_context"), SERIES_CONTEXT_FILE_RE),
    scanDir(path.join(resolvedRunDir, "voicevox_text"), VOICEVOX_TEXT_FILE_RE),
    scanDir(path.join(resolvedRunDir, "voicevox_project"), VVPROJ_FILE_RE),
    scanDir(path.join(resolvedRunDir, "voicevox_project"), VVPROJ_META_RE),
    scanDir(path.join(resolvedRunDir, "voicevox_project"), VOICEVOX_IMPORT_FILE_RE),
    scanDir(path.join(resolvedRunDir, "audio"), AUDIO_WAV_FILE_RE),
  ]);

  return {
    artifacts: {
      runContractPath,
      sourceIndexPath,
      blueprintPath,
      episodePackPaths,
      scriptPaths,
      seriesContextPaths,
      voicevoxTextPaths,
      voicevoxProjectPaths,
      voicevoxProjectMetaPaths,
      voicevoxImportPaths,
      audioWavPaths,
      audioManifestPath,
    },
    issues,
  };
}
