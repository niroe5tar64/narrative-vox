import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateAgainstSchema } from "@narrative-vox/infrastructure/schema-validator.ts";
import {
  resolvePromptTemplate,
  resolvePromptTemplatePath,
} from "../render-prompt.ts";

export const SCHEMA_PATHS = {
  blueprint: "schemas/blueprint.schema.json",
  episodeMaterial: "schemas/episode-material.schema.json",
  episodeDigest: "schemas/episode-digest.schema.json",
} as const;

export interface ProjectConfig {
  GENRE_ID: string;
  PROJECT_ID: string;
  SOURCE_MARKDOWN_PATHS?: string;
  STYLE_ID: string;
  CAST: Record<string, string>;
  [key: string]: unknown;
}

export type Layer1Step = "blueprint" | "material" | "script" | "digest";

export type PromptAttachment =
  | { title: string; kind: "json"; value: unknown }
  | { title: string; kind: "markdown"; value: string }
  | { title: string; kind: "text"; value: string }
  | { title: "Source Materials"; kind: "fragments"; value: string[] };

export type SchemaValidationResult =
  | { ok: true }
  | { ok: false; message: string };

export type ScriptStructureAnalysis = {
  isEmpty: boolean;
  hasSectionHeaders: boolean;
  hasSpeakerTags: boolean;
};

function extractPromptSection(template: string): string {
  const match = template.match(/^## Prompt$/m);
  if (!match || match.index === undefined) {
    return template;
  }
  return template.slice(match.index);
}

export function logStep(stepLabel: string, message: string): void {
  console.log(`[${stepLabel}] ${message}`);
}

export function resolvePromptFilePath(genre: string, step: Layer1Step): string {
  if (step === "script") {
    const normalizedGenre = genre.replace(/_/g, "-");
    return path.resolve("prompts", normalizedGenre, "script-common-frame.md");
  }
  if (step === "digest") {
    const normalizedGenre = genre.replace(/_/g, "-");
    return path.resolve("prompts", normalizedGenre, "episode-digest.md");
  }
  return resolvePromptTemplatePath(genre, step);
}

export function buildStringConfigMap(
  projectConfig: ProjectConfig,
  episodeId?: string,
): Record<string, string> {
  const configMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(projectConfig)) {
    if (typeof value === "string") {
      configMap[key] = value;
    }
  }
  if (episodeId) {
    configMap.EPISODE_ID = episodeId;
  }
  return configMap;
}

export async function loadProjectConfig(
  projectId: string,
): Promise<ProjectConfig> {
  const configPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.json`,
  );
  const raw = await readFile(configPath, "utf-8");
  return JSON.parse(raw) as ProjectConfig;
}

export async function loadPromptSection(options: {
  projectConfig: ProjectConfig;
  step: Layer1Step;
  episodeId?: string;
}): Promise<string> {
  const { projectConfig, step, episodeId } = options;
  const templatePath = resolvePromptFilePath(projectConfig.GENRE_ID, step);
  const templateRaw = await readFile(templatePath, "utf-8");

  if (step === "script" || step === "digest") {
    return extractPromptSection(templateRaw);
  }

  const configMap = buildStringConfigMap(projectConfig, episodeId);
  const { resolvedPrompt } = resolvePromptTemplate(templateRaw, configMap);
  return extractPromptSection(resolvedPrompt);
}

export async function loadSourceFiles(globPattern: string): Promise<string[]> {
  if (!globPattern) return [];
  const glob = new Bun.Glob(globPattern);
  const files: string[] = [];
  for await (const file of glob.scan({ cwd: process.cwd() })) {
    files.push(file);
  }
  files.sort();
  const contents: string[] = [];
  for (const file of files) {
    const content = await readFile(file, "utf-8");
    contents.push(`=== ${file} ===\n${content}`);
  }
  return contents;
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export async function loadPriorDigests(
  runDir: string,
  episodeId: string,
): Promise<unknown[]> {
  const episodeNum = Number.parseInt(episodeId.replace("E", ""), 10);
  const contextDir = path.join(runDir, "context");
  const priorDigests: unknown[] = [];
  for (let i = 1; i < episodeNum; i += 1) {
    const prevId = `E${String(i).padStart(2, "0")}`;
    const digestPath = path.join(contextDir, `${prevId}_episode_digest.json`);
    try {
      priorDigests.push(await readJsonFile<unknown>(digestPath));
    } catch {
      // skip missing or unreadable prior digests
    }
  }
  return priorDigests;
}

export function composePrompt(
  promptSection: string,
  attachments: PromptAttachment[],
): string {
  let fullPrompt = promptSection;
  for (const attachment of attachments) {
    if (attachment.kind === "fragments" && attachment.value.length === 0) {
      continue;
    }
    fullPrompt += `\n\n---\n\n## ${attachment.title}\n\n`;
    if (attachment.kind === "json") {
      fullPrompt += `\`\`\`json\n${JSON.stringify(attachment.value, null, 2)}\n\`\`\``;
      continue;
    }
    if (attachment.kind === "fragments") {
      fullPrompt += attachment.value.join("\n\n---\n\n");
      continue;
    }
    fullPrompt += attachment.value;
  }
  return fullPrompt;
}

export async function writePrettyJson(
  filePath: string,
  data: unknown,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

export async function validateJsonSchema(
  data: unknown,
  schemaPath: string,
): Promise<SchemaValidationResult> {
  try {
    await validateAgainstSchema(data, schemaPath);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function analyzeScriptStructure(
  scriptContent: string,
): ScriptStructureAnalysis {
  return {
    isEmpty: scriptContent.length === 0,
    hasSectionHeaders: /^## \d+\./m.test(scriptContent),
    hasSpeakerTags: /\[speaker:/.test(scriptContent),
  };
}
