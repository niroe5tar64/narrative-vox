import path from "node:path";
import { inferProjectIdFromRunDir, resolveRunId } from "../../shared/run_id.ts";

type RunMetadataPaths = {
  stage4Dir: string;
  stage4DictDir: string;
  stage4JsonPath: string;
  stage4TxtPath: string;
  dictCsvPath: string;
};

export type RunMetadataOptions = {
  scriptPath: string;
  runDir?: string;
  projectId?: string;
  runId?: string;
  episodeId?: string;
};

export type RunMetadata = RunMetadataPaths & {
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
  const match = base.match(/(E[0-9]{2})/);
  if (!match) {
    throw new Error("Could not infer episode_id from script path. Pass --episode-id E##.");
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

function buildStage4Paths(runDir: string, episodeId: string): RunMetadataPaths {
  const stage4Dir = path.join(runDir, "stage4");
  const stage4DictDir = path.join(runDir, "stage4_dict");
  return {
    stage4Dir,
    stage4DictDir,
    stage4JsonPath: path.join(stage4Dir, `${episodeId}_voicevox_text.json`),
    stage4TxtPath: path.join(stage4Dir, `${episodeId}_voicevox.txt`),
    dictCsvPath: path.join(stage4DictDir, `${episodeId}_dict_candidates.csv`)
  };
}

export function resolveRunMetadata({
  scriptPath,
  runDir,
  projectId,
  runId,
  episodeId
}: RunMetadataOptions): RunMetadata {
  const resolvedScriptPath = path.resolve(scriptPath);
  const inferredRunDir = runDir ? path.resolve(runDir) : inferRunDirFromScriptPath(resolvedScriptPath);
  if (!inferredRunDir) {
    throw new Error(
      "Could not infer run directory from --script path. Pass --run-dir explicitly."
    );
  }

  const finalEpisodeId = inferEpisodeId(resolvedScriptPath, episodeId);
  const ids = inferProjectAndRun(inferredRunDir, projectId, runId);
  const paths = buildStage4Paths(inferredRunDir, finalEpisodeId);

  return {
    resolvedScriptPath,
    runDir: inferredRunDir,
    projectId: ids.projectId,
    runId: ids.runId,
    episodeId: finalEpisodeId,
    ...paths
  };
}
