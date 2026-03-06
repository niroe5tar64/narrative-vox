import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "@narrative-vox/infrastructure/json.ts";
import {
  loadPriorDigests,
  logStep,
  type ProjectConfig,
  readJsonFile,
} from "./shared.ts";

export type ScriptStepResources = {
  material: unknown;
  style: unknown;
  characters: Record<string, unknown>;
  priorDigests: unknown[];
};

export type MaterialStepResources = {
  blueprint: unknown;
};

export type DigestStepResources = {
  scriptContent: string;
  material: unknown;
  blueprint: unknown;
  characters: Record<string, unknown>;
};

async function loadJsonArtifact<T>(options: {
  stepLabel: string;
  label: string;
  filePath: string;
}): Promise<T> {
  const { stepLabel, label, filePath } = options;
  logStep(stepLabel, `Loading ${label}: ${filePath}`);
  return loadConfig<T>(filePath);
}

async function loadTextArtifact(options: {
  stepLabel: string;
  label: string;
  filePath: string;
}): Promise<string> {
  const { stepLabel, label, filePath } = options;
  logStep(stepLabel, `Loading ${label}: ${filePath}`);
  return readFile(filePath, "utf-8");
}

function resolveStylePath(styleId: string): string {
  return path.resolve("configs", "content", "styles", `${styleId}.yaml`);
}

function resolveCharacterPath(characterKey: string): string {
  return path.resolve(
    "configs",
    "content",
    "characters",
    `${characterKey}.yaml`,
  );
}

export async function loadStyleForScript(options: {
  stepLabel: string;
  styleId: string;
}): Promise<unknown> {
  const { stepLabel, styleId } = options;
  return loadJsonArtifact({
    stepLabel,
    label: "style",
    filePath: resolveStylePath(styleId),
  });
}

export async function loadCharactersForStep(options: {
  stepLabel: string;
  cast: Record<string, string>;
  logPerRole: boolean;
}): Promise<Record<string, unknown>> {
  const { stepLabel, cast, logPerRole } = options;
  const characters: Record<string, unknown> = {};
  for (const [role, characterKey] of Object.entries(cast)) {
    const charPath = resolveCharacterPath(characterKey);
    if (logPerRole) {
      logStep(stepLabel, `Loading character [${role}]: ${charPath}`);
    }
    characters[role] = {
      key: characterKey,
      ...(await loadConfig<Record<string, unknown>>(charPath)),
    };
  }
  return characters;
}

export async function loadScriptStepResources(options: {
  stepLabel: string;
  projectConfig: ProjectConfig;
  runDir: string;
  episodeId: string;
}): Promise<ScriptStepResources> {
  const { stepLabel, projectConfig, runDir, episodeId } = options;
  const material = await loadJsonArtifact<unknown>({
    stepLabel,
    label: "material",
    filePath: path.join(runDir, "material", `${episodeId}_material.json`),
  });
  const style = await loadStyleForScript({
    stepLabel,
    styleId: projectConfig.STYLE_ID,
  });
  const characters = await loadCharactersForStep({
    stepLabel,
    cast: projectConfig.CAST,
    logPerRole: true,
  });
  const priorDigests = await loadPriorDigests(runDir, episodeId);
  return { material, style, characters, priorDigests };
}

export async function loadMaterialStepResources(options: {
  stepLabel: string;
  runDir: string;
}): Promise<MaterialStepResources> {
  const { stepLabel, runDir } = options;
  const blueprint = await loadJsonArtifact<unknown>({
    stepLabel,
    label: "blueprint",
    filePath: path.join(runDir, "blueprint", "project_blueprint.json"),
  });
  return { blueprint };
}

export async function loadDigestStepResources(options: {
  stepLabel: string;
  projectConfig: ProjectConfig;
  runDir: string;
  episodeId: string;
}): Promise<DigestStepResources> {
  const { stepLabel, projectConfig, runDir, episodeId } = options;
  const scriptContent = await loadTextArtifact({
    stepLabel,
    label: "script",
    filePath: path.join(runDir, "script", `${episodeId}_script.md`),
  });
  const material = await loadJsonArtifact<unknown>({
    stepLabel,
    label: "material",
    filePath: path.join(runDir, "material", `${episodeId}_material.json`),
  });
  const blueprint = await loadJsonArtifact<unknown>({
    stepLabel,
    label: "blueprint",
    filePath: path.join(runDir, "blueprint", "project_blueprint.json"),
  });
  const characters = await loadCharactersForStep({
    stepLabel,
    cast: projectConfig.CAST,
    logPerRole: false,
  });
  return { scriptContent, material, blueprint, characters };
}
