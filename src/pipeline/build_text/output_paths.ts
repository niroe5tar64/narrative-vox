import path from "node:path";
import { inferProjectIdFromRunDir, resolveRunId } from "../../shared/run_id.ts";

type BuildTextOutputPaths = {
  voicevoxTextDir: string;
  dictionaryDir: string;
  voicevoxTextJsonPath: string;
  voicevoxTextPath: string;
  dictionaryCsvPath: string;
};

export type BuildTextPathOptions = {
  scriptPath: string;
  runDir?: string;
  projectId?: string;
  runId?: string;
  episodeId?: string;
};

export type BuildTextPathResolution = BuildTextOutputPaths & {
  resolvedScriptPath: string;
  runDir: string;
  projectId: string;
  runId: string;
  episodeId: string;
};

function inferRunDirFromScriptPath(scriptPath: string): string | undefined {
  const stageDir = path.dirname(path.resolve(scriptPath));
  if (path.basename(stageDir) !== "stage3") {
    return undefined;
  }
  return path.dirname(stageDir);
}

function inferEpisodeId(scriptPath: string, explicitEpisodeId?: string): string {
  if (explicitEpisodeId) {
    return explicitEpisodeId;
  }
  const base = path.basename(scriptPath);
  const match = base.match(/^(E[0-9]{2})_script\.md$/);
  if (!match) {
    throw new Error(
      `Could not infer episode_id from script path basename "${base}". Expected file name: E##_script.md (e.g. E01_script.md). Pass --episode-id E##.`
    );
  }
  return match[1];
}

function inferProjectAndRun(
  runDir: string,
  explicitProjectId?: string,
  explicitRunId?: string
): { projectId: string; runId: string } {
  const runId = resolveRunId(runDir, explicitRunId);
  const projectId = explicitProjectId || inferProjectIdFromRunDir(runDir);
  return { projectId, runId };
}

function buildTextOutputPaths(runDir: string, episodeId: string): BuildTextOutputPaths {
  const voicevoxTextDir = path.join(runDir, "voicevox_text");
  const dictionaryDir = path.join(runDir, "dict_candidates");
  return {
    voicevoxTextDir,
    dictionaryDir,
    voicevoxTextJsonPath: path.join(voicevoxTextDir, `${episodeId}_voicevox_text.json`),
    voicevoxTextPath: path.join(voicevoxTextDir, `${episodeId}_voicevox.txt`),
    dictionaryCsvPath: path.join(dictionaryDir, `${episodeId}_dict_candidates.csv`)
  };
}

export function resolveBuildTextOutputPaths({
  scriptPath,
  runDir,
  projectId,
  runId,
  episodeId
}: BuildTextPathOptions): BuildTextPathResolution {
  const resolvedScriptPath = path.resolve(scriptPath);
  const inferredRunDir = runDir ? path.resolve(runDir) : inferRunDirFromScriptPath(resolvedScriptPath);
  if (!inferredRunDir) {
    throw new Error(
      "Could not infer run directory from --script path. Pass --run-dir explicitly."
    );
  }

  const finalEpisodeId = inferEpisodeId(resolvedScriptPath, episodeId);
  const ids = inferProjectAndRun(inferredRunDir, projectId, runId);
  const paths = buildTextOutputPaths(inferredRunDir, finalEpisodeId);

  return {
    resolvedScriptPath,
    runDir: inferredRunDir,
    projectId: ids.projectId,
    runId: ids.runId,
    episodeId: finalEpisodeId,
    ...paths
  };
}
