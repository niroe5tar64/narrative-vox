import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadJson } from "../shared/json.ts";
import { SchemaPaths } from "../shared/schema_paths.ts";
import { REQUIRED_SECTION_IDS, validateRequiredScriptStructure } from "../shared/script_structure.ts";

const VARIABLES_FILE_RE = /^(E[0-9]{2})_variables\.json$/;
const SCRIPT_FILE_RE = /^(E[0-9]{2})_script\.md$/;

export interface CheckRunOptions {
  runDir: string;
}

export interface CheckRunResult {
  runDir: string;
  variablesEpisodeCount: number;
  scriptEpisodeCount: number;
  validatedEpisodeIds: string[];
}

function toRelativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || ".";
}

function ensureHasAllSections(scriptText: string, scriptPath: string, episodeId: string): void {
  const validation = validateRequiredScriptStructure(scriptText);
  const scriptRef = `${toRelativePath(scriptPath)} (episode: ${episodeId})`;
  const missingSections = validation.missingSectionIds;
  if (missingSections.length > 0) {
    throw new Error(`${scriptRef} is missing required sections: ${missingSections.join(", ")}`);
  }

  if (validation.duplicateSectionIds.length > 0) {
    throw new Error(
      `${scriptRef} has duplicate section IDs: ${validation.duplicateSectionIds.join(", ")}`
    );
  }

  const hasOrderViolation =
    validation.sectionOrder.length !== REQUIRED_SECTION_IDS.length ||
    validation.sectionOrder.some((id, index) => id !== REQUIRED_SECTION_IDS[index]);
  if (hasOrderViolation) {
    throw new Error(
      `${scriptRef} has section order violation: found [${validation.sectionOrder.join(", ")}], expected [${REQUIRED_SECTION_IDS.join(", ")}]`
    );
  }

  if (!validation.hasTotalTimeLine) {
    throw new Error(`${scriptRef} is missing "合計想定時間:" line`);
  }
}

function collectEpisodeIds(fileNames: string[], pattern: RegExp): string[] {
  const episodeIds: string[] = [];
  for (const name of fileNames) {
    const match = name.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    episodeIds.push(match[1]);
  }
  return episodeIds.sort();
}

function diffEpisodes(baseIds: string[], compareIds: string[]): string[] {
  const compareSet = new Set(compareIds);
  return baseIds.filter((id) => !compareSet.has(id));
}

export async function checkRun({ runDir }: CheckRunOptions): Promise<CheckRunResult> {
  const resolvedRunDir = path.resolve(runDir);

  const blueprintPath = path.join(resolvedRunDir, "blueprint", "book_blueprint.json");
  const variablesDir = path.join(resolvedRunDir, "variables");
  const scriptDir = path.join(resolvedRunDir, "script");

  await loadJson<unknown>(blueprintPath, SchemaPaths.blueprint);

  const variablesFiles = (await readdir(variablesDir)).filter((name) => VARIABLES_FILE_RE.test(name)).sort();
  if (variablesFiles.length === 0) {
    throw new Error(`${toRelativePath(variablesDir)} has no E##_variables.json files`);
  }
  const variablesEpisodeIds = collectEpisodeIds(variablesFiles, VARIABLES_FILE_RE);
  for (const fileName of variablesFiles) {
    const filePath = path.join(variablesDir, fileName);
    await loadJson<unknown>(filePath, SchemaPaths.episodeVariables);
  }

  const scriptFiles = (await readdir(scriptDir)).filter((name) => SCRIPT_FILE_RE.test(name)).sort();
  if (scriptFiles.length === 0) {
    throw new Error(`${toRelativePath(scriptDir)} has no E##_script.md files`);
  }
  const scriptEpisodeIds = collectEpisodeIds(scriptFiles, SCRIPT_FILE_RE);
  for (const fileName of scriptFiles) {
    const match = fileName.match(SCRIPT_FILE_RE);
    const episodeId = match?.[1];
    if (!episodeId) {
      continue;
    }
    const filePath = path.join(scriptDir, fileName);
    const scriptText = await readFile(filePath, "utf-8");
    ensureHasAllSections(scriptText, filePath, episodeId);
  }

  const missingInScript = diffEpisodes(variablesEpisodeIds, scriptEpisodeIds);
  if (missingInScript.length > 0) {
    throw new Error(`script is missing scripts for episodes: ${missingInScript.join(", ")}`);
  }

  const extraInScript = diffEpisodes(scriptEpisodeIds, variablesEpisodeIds);
  if (extraInScript.length > 0) {
    throw new Error(`script has episodes not in variables: ${extraInScript.join(", ")}`);
  }

  return {
    runDir: resolvedRunDir,
    variablesEpisodeCount: variablesEpisodeIds.length,
    scriptEpisodeCount: scriptEpisodeIds.length,
    validatedEpisodeIds: variablesEpisodeIds
  };
}
