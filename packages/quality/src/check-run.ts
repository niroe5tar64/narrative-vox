import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseSectionHeader } from "@narrative-vox/domain/script-structure.ts";
import {
  hasSpeakerTagPrefix,
  parseSpeakerTag,
} from "@narrative-vox/domain/speaker-tag.ts";
import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import { validateBuildPrerequisites } from "./build-prerequisites.ts";

const MATERIAL_FILE_RE = /^(E[0-9]{2})_material\.json$/;
const SCRIPT_FILE_RE = /^(E[0-9]{2})_script\.md$/;
const DIGEST_FILE_RE = /^(E[0-9]{2})_episode_digest\.json$/;

type SpeakerMode = "monologue" | "dialogue" | "panel";

export interface CheckRunOptions {
  runDir: string;
  synthesisDefaultsPath?: string;
  characterMapPath?: string;
  characterKey?: string;
  engineId?: string;
  speakerId?: string;
  styleId?: number;
  emotion?: string;
  voicevoxApiUrl?: string;
  speedPreset?: string;
  speedProfilesPath?: string;
}

export interface CheckRunResult {
  runDir: string;
  materialEpisodeCount: number;
  scriptEpisodeCount: number;
  validatedEpisodeIds: string[];
  warnings: string[];
}

interface BlueprintEpisodePlanItem {
  episode_id: string;
  prerequisite_episodes?: string[];
}

interface BlueprintForCheckRun {
  episode_plan: BlueprintEpisodePlanItem[];
}

interface EpisodeMaterialForCheckRun {
  meta: {
    project_id: string;
  };
}

interface ProjectConfigForCheckRun {
  STYLE_ID: string;
}

interface ContentStyleForCheckRun {
  style_id: string;
  format: {
    speaker_mode: SpeakerMode;
    speaker_count: number;
  };
}

function toRelativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || ".";
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

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath);
    return true;
  } catch {
    return false;
  }
}

function ensureMinimalScriptStructure(
  scriptText: string,
  scriptPath: string,
  episodeId: string,
): void {
  const scriptRef = `${toRelativePath(scriptPath)} (episode: ${episodeId})`;
  if (scriptText.trim().length === 0) {
    throw new Error(`${scriptRef} is empty`);
  }
  let hasSectionHeading = false;
  for (const line of scriptText.split(/\r?\n/)) {
    if (parseSectionHeader(line)) {
      hasSectionHeading = true;
      break;
    }
  }
  if (!hasSectionHeading) {
    throw new Error(
      `${scriptRef} has no section headings (expected "## N. Title" format)`,
    );
  }
}

function validateScriptSpeakerStructure(
  scriptText: string,
  scriptPath: string,
  episodeId: string,
  contentStyle: ContentStyleForCheckRun,
): void {
  const scriptRef = `${toRelativePath(scriptPath)} (episode: ${episodeId})`;
  const speakerKeys = new Set<string>();
  const lines = scriptText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0) {
      continue;
    }
    if (parseSectionHeader(line)) {
      continue;
    }

    const speakerTag = parseSpeakerTag(line);
    if (!speakerTag) {
      if (hasSpeakerTagPrefix(line)) {
        throw new Error(
          `${scriptRef}:${i + 1} has invalid [speaker:<key>] format for style "${contentStyle.style_id}" (${contentStyle.format.speaker_mode})`,
        );
      }
      throw new Error(
        `${scriptRef}:${i + 1} requires [speaker:<key>] at line start for style "${contentStyle.style_id}" (${contentStyle.format.speaker_mode})`,
      );
    }

    speakerKeys.add(speakerTag.speakerKey);
  }

  if (speakerKeys.size !== contentStyle.format.speaker_count) {
    const speakerList = [...speakerKeys].sort().join(", ") || "(none)";
    throw new Error(
      `${scriptRef} has ${speakerKeys.size} unique speaker keys (${speakerList}), but style "${contentStyle.style_id}" (${contentStyle.format.speaker_mode}) requires speaker_count=${contentStyle.format.speaker_count}`,
    );
  }
}

function findEpisodeDependencyCycle(
  dependencies: Map<string, string[]>,
): string[] | undefined {
  const visitState = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (episodeId: string): string[] | undefined => {
    const state = visitState.get(episodeId) ?? 0;
    if (state === 1) {
      const cycleStart = stack.indexOf(episodeId);
      if (cycleStart >= 0) {
        return [...stack.slice(cycleStart), episodeId];
      }
      return [episodeId, episodeId];
    }
    if (state === 2) {
      return undefined;
    }

    visitState.set(episodeId, 1);
    stack.push(episodeId);

    for (const dependencyId of dependencies.get(episodeId) ?? []) {
      const cycle = visit(dependencyId);
      if (cycle) {
        return cycle;
      }
    }

    stack.pop();
    visitState.set(episodeId, 2);
    return undefined;
  };

  for (const episodeId of dependencies.keys()) {
    const cycle = visit(episodeId);
    if (cycle) {
      return cycle;
    }
  }

  return undefined;
}

function validateEpisodePrerequisites(
  blueprint: BlueprintForCheckRun,
  blueprintPath: string,
): void {
  const episodeIds = blueprint.episode_plan.map(
    (episode) => episode.episode_id,
  );
  const episodeIdSet = new Set(episodeIds);
  const dependencies = new Map<string, string[]>();

  for (const episode of blueprint.episode_plan) {
    const prerequisites = episode.prerequisite_episodes ?? [];
    const seen = new Set<string>();
    const duplicatePrerequisites: string[] = [];
    const missingEpisodeIds: string[] = [];

    for (const prerequisiteEpisodeId of prerequisites) {
      if (seen.has(prerequisiteEpisodeId)) {
        duplicatePrerequisites.push(prerequisiteEpisodeId);
      } else {
        seen.add(prerequisiteEpisodeId);
      }

      if (prerequisiteEpisodeId === episode.episode_id) {
        throw new Error(
          `${toRelativePath(
            blueprintPath,
          )}: episode_plan "${episode.episode_id}" cannot list itself in prerequisite_episodes`,
        );
      }

      if (!episodeIdSet.has(prerequisiteEpisodeId)) {
        missingEpisodeIds.push(prerequisiteEpisodeId);
      }
    }

    if (duplicatePrerequisites.length > 0) {
      const duplicateList = [...new Set(duplicatePrerequisites)].join(", ");
      throw new Error(
        `${toRelativePath(
          blueprintPath,
        )}: episode_plan "${episode.episode_id}" has duplicate prerequisite_episodes: ${duplicateList}`,
      );
    }

    if (missingEpisodeIds.length > 0) {
      const missingList = [...new Set(missingEpisodeIds)].join(", ");
      throw new Error(
        `${toRelativePath(
          blueprintPath,
        )}: episode_plan "${episode.episode_id}" references missing prerequisite_episodes: ${missingList}`,
      );
    }

    dependencies.set(episode.episode_id, prerequisites);
  }

  const cycle = findEpisodeDependencyCycle(dependencies);
  if (cycle) {
    throw new Error(
      `${toRelativePath(blueprintPath)}: episode_plan prerequisite_episodes has a cycle: ${cycle.join(" -> ")}`,
    );
  }
}

export async function checkRun({
  runDir,
  synthesisDefaultsPath,
  characterMapPath,
  characterKey,
  engineId,
  speakerId,
  styleId,
  emotion,
  voicevoxApiUrl,
  speedPreset,
  speedProfilesPath,
}: CheckRunOptions): Promise<CheckRunResult> {
  const resolvedRunDir = path.resolve(runDir);
  const warnings: string[] = [];

  // 1. Blueprint validation
  const blueprintPath = path.join(
    resolvedRunDir,
    "blueprint",
    "project_blueprint.json",
  );
  const blueprint = await loadJson<BlueprintForCheckRun>(
    blueprintPath,
    SchemaPaths.blueprint,
  );
  validateEpisodePrerequisites(blueprint, blueprintPath);

  // 2. Material validation
  const materialDir = path.join(resolvedRunDir, "material");
  const materialFiles = (await readdir(materialDir))
    .filter((name) => MATERIAL_FILE_RE.test(name))
    .sort();
  if (materialFiles.length === 0) {
    throw new Error(
      `${toRelativePath(materialDir)} has no E##_material.json files`,
    );
  }
  const materialEpisodeIds = collectEpisodeIds(materialFiles, MATERIAL_FILE_RE);
  const materialProjectIds = new Set<string>();
  for (const fileName of materialFiles) {
    const filePath = path.join(materialDir, fileName);
    const material = await loadJson<EpisodeMaterialForCheckRun>(
      filePath,
      SchemaPaths.episodeMaterial,
    );
    materialProjectIds.add(material.meta.project_id);
  }

  if (materialProjectIds.size !== 1) {
    throw new Error(
      `${toRelativePath(materialDir)} has inconsistent project_id values: ${[
        ...materialProjectIds,
      ].join(", ")}`,
    );
  }
  const [projectId] = [...materialProjectIds];
  if (!projectId) {
    throw new Error(
      `${toRelativePath(materialDir)} has no project_id in material metadata`,
    );
  }

  // 2.5 Project config + content style validation
  const projectConfigPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.json`,
  );
  if (!(await dirExists(projectConfigPath))) {
    throw new Error(
      `Project config not found for project_id "${projectId}": ${toRelativePath(
        projectConfigPath,
      )}`,
    );
  }
  const projectConfig = await loadJson<ProjectConfigForCheckRun>(
    projectConfigPath,
    SchemaPaths.projectConfig,
  );
  const styleConfigId = projectConfig.STYLE_ID;
  const stylePath = path.resolve(
    "configs",
    "content",
    "styles",
    `${styleConfigId}.json`,
  );
  if (!(await dirExists(stylePath))) {
    throw new Error(
      `Style definition not found for STYLE_ID "${styleConfigId}": ${toRelativePath(
        stylePath,
      )}`,
    );
  }
  const contentStyle = await loadJson<ContentStyleForCheckRun>(
    stylePath,
    SchemaPaths.contentStyle,
  );
  if (contentStyle.style_id !== styleConfigId) {
    throw new Error(
      `${toRelativePath(
        stylePath,
      )}: style_id "${contentStyle.style_id}" does not match STYLE_ID "${styleConfigId}"`,
    );
  }

  // 3. Script validation (minimal structure)
  const scriptDir = path.join(resolvedRunDir, "script");
  const scriptFiles = (await readdir(scriptDir))
    .filter((name) => SCRIPT_FILE_RE.test(name))
    .sort();
  if (scriptFiles.length === 0) {
    throw new Error(`${toRelativePath(scriptDir)} has no E##_script.md files`);
  }
  const scriptPaths: string[] = [];
  const scriptEpisodeIds = collectEpisodeIds(scriptFiles, SCRIPT_FILE_RE);
  for (const fileName of scriptFiles) {
    const match = fileName.match(SCRIPT_FILE_RE);
    const episodeId = match?.[1];
    if (!episodeId) {
      continue;
    }
    const filePath = path.join(scriptDir, fileName);
    scriptPaths.push(filePath);
    const scriptText = await readFile(filePath, "utf-8");
    ensureMinimalScriptStructure(scriptText, filePath, episodeId);
    validateScriptSpeakerStructure(
      scriptText,
      filePath,
      episodeId,
      contentStyle,
    );
  }

  // 4. Material ↔ Script episode matching
  const missingInScript = diffEpisodes(materialEpisodeIds, scriptEpisodeIds);
  if (missingInScript.length > 0) {
    throw new Error(
      `script is missing scripts for episodes: ${missingInScript.join(", ")}`,
    );
  }

  const extraInScript = diffEpisodes(scriptEpisodeIds, materialEpisodeIds);
  if (extraInScript.length > 0) {
    throw new Error(
      `script has episodes not in material: ${extraInScript.join(", ")}`,
    );
  }

  // 5. Digest validation (optional — exists → validate)
  const contextDir = path.join(resolvedRunDir, "context");
  if (await dirExists(contextDir)) {
    const contextFiles = (await readdir(contextDir))
      .filter((name) => DIGEST_FILE_RE.test(name))
      .sort();
    for (const fileName of contextFiles) {
      const filePath = path.join(contextDir, fileName);
      const digest = await loadJson<{ episode_id?: string }>(
        filePath,
        SchemaPaths.episodeDigest,
      );
      const match = fileName.match(DIGEST_FILE_RE);
      const fileEpisodeId = match?.[1];
      if (
        fileEpisodeId &&
        digest.episode_id &&
        digest.episode_id !== fileEpisodeId
      ) {
        throw new Error(
          `${toRelativePath(filePath)}: episode_id "${digest.episode_id}" does not match filename "${fileEpisodeId}"`,
        );
      }
    }

    // Warn if E(N≥2) is missing E(N-1) digest
    for (const episodeId of materialEpisodeIds) {
      const episodeNum = Number.parseInt(episodeId.slice(1), 10);
      if (episodeNum >= 2) {
        const prevEpisodeId = `E${String(episodeNum - 1).padStart(2, "0")}`;
        const prevDigestFile = `${prevEpisodeId}_episode_digest.json`;
        const prevDigestPath = path.join(contextDir, prevDigestFile);
        if (!(await dirExists(prevDigestPath))) {
          warnings.push(
            `${episodeId}: prior digest ${prevDigestFile} not found (continuity may be limited)`,
          );
        }
      }
    }
  }

  // 6. Build prerequisites
  await validateBuildPrerequisites({
    scriptPaths,
    synthesisDefaultsPath,
    characterMapPath,
    characterKey,
    engineId,
    speakerId,
    styleId,
    emotion,
    voicevoxApiUrl,
    speedPreset,
    speedProfilesPath,
  });

  return {
    runDir: resolvedRunDir,
    materialEpisodeCount: materialEpisodeIds.length,
    scriptEpisodeCount: scriptEpisodeIds.length,
    validatedEpisodeIds: materialEpisodeIds,
    warnings,
  };
}
