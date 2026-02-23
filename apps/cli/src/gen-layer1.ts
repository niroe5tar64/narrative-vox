import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createRunContract } from "@narrative-vox/domain/run-contract.ts";
import { makeRunIdNow } from "@narrative-vox/domain/run-id.ts";
import { saveRunContract } from "@narrative-vox/infrastructure/run-contract-io.ts";
import { validateAgainstSchema } from "@narrative-vox/infrastructure/schema-validator.ts";

import { resolvePromptTemplate } from "./render-prompt.ts";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const PROMPT_STEP_FILES: Record<string, string> = {
  blueprint: "blueprint.md",
  material: "episode-material.md",
  script: "script-common-frame.md",
  digest: "episode-digest.md",
};

const SCHEMA_PATHS = {
  blueprint: "schemas/blueprint.schema.json",
  episodeMaterial: "schemas/episode-material.schema.json",
  episodeDigest: "schemas/episode-digest.schema.json",
} as const;

// ---------------------------------------------------------------------------
// プロジェクト設定型（最小限）
// ---------------------------------------------------------------------------

interface ProjectConfig {
  GENRE_ID: string;
  PROJECT_ID: string;
  SOURCE_MARKDOWN_PATHS?: string;
  STYLE_ID: string;
  CAST: Record<string, string>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// ユーティリティ: プロンプトテンプレートパス解決
// ---------------------------------------------------------------------------

function resolvePromptFilePath(genre: string, step: string): string {
  const filename = PROMPT_STEP_FILES[step];
  if (!filename) {
    throw new Error(`Unknown step: ${step}. Valid: ${Object.keys(PROMPT_STEP_FILES).join(", ")}`);
  }
  const normalizedGenre = genre.replace(/_/g, "-");
  return path.resolve("prompts", normalizedGenre, filename);
}

// ---------------------------------------------------------------------------
// ユーティリティ: プロジェクト設定読み込み
// ---------------------------------------------------------------------------

async function loadProjectConfig(projectId: string): Promise<ProjectConfig> {
  const configPath = path.resolve("configs", "pipeline", "projects", `${projectId}.json`);
  const raw = await readFile(configPath, "utf-8");
  return JSON.parse(raw) as ProjectConfig;
}

// ---------------------------------------------------------------------------
// ユーティリティ: ソースファイル読み込み
// ---------------------------------------------------------------------------

async function loadSourceFiles(globPattern: string): Promise<string[]> {
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

// ---------------------------------------------------------------------------
// ユーティリティ: ## Prompt セクション以降を抽出
// ---------------------------------------------------------------------------

function extractPromptSection(template: string): string {
  const match = template.match(/^## Prompt$/m);
  if (!match || match.index === undefined) {
    return template;
  }
  return template.slice(match.index);
}

// ---------------------------------------------------------------------------
// コア: claude --print - でプロンプトを実行
// ---------------------------------------------------------------------------

export async function runClaudeWithPrompt(prompt: string): Promise<string> {
  const repoRoot = process.cwd();
  const proc = Bun.spawn(["claude", "--print", "-"], {
    cwd: repoRoot,
    stdin: new TextEncoder().encode(prompt),
    stdout: "pipe",
    stderr: "pipe",
  });

  // stderr をコンソールに流す
  const stderrStream = proc.stderr;
  if (stderrStream) {
    (async () => {
      const reader = stderrStream.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          process.stderr.write(decoder.decode(value, { stream: true }));
        }
      } finally {
        reader.releaseLock();
      }
    })().catch(() => {
      // ignore stderr read errors
    });
  }

  // stdout を行単位でリアルタイム表示しながら収集
  const outputChunks: string[] = [];
  const stdoutStream = proc.stdout;
  if (stdoutStream) {
    const reader = stdoutStream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.length > 0) {
            outputChunks.push(buffer);
            process.stdout.write(buffer + "\n");
          }
          break;
        }
        const text = decoder.decode(value, { stream: true });
        outputChunks.push(text);
        buffer += text;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          process.stdout.write(line + "\n");
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`claude --print - exited with code ${exitCode}`);
  }
  return outputChunks.join("");
}

// ---------------------------------------------------------------------------
// コア: JSON 抽出
// ---------------------------------------------------------------------------

export function extractJson(output: string): unknown {
  // ```json ブロック優先
  const match = output.match(/```json\n([\s\S]+?)\n```/);
  if (match) {
    return JSON.parse(match[1]);
  }
  // 生 JSON を試行
  return JSON.parse(output.trim());
}

// ---------------------------------------------------------------------------
// gen-blueprint
// ---------------------------------------------------------------------------

export interface GenBlueprintOptions {
  projectId: string;
  episodeId: string;
}

export async function genBlueprint(options: GenBlueprintOptions): Promise<void> {
  const { projectId, episodeId } = options;

  // 1. project config 読み込み
  console.log(`[gen-blueprint] Loading project config: ${projectId}`);
  const projectConfig = await loadProjectConfig(projectId);
  const genreId = projectConfig.GENRE_ID;

  // 2. プロンプトテンプレート解決
  console.log(`[gen-blueprint] Resolving prompt template: ${genreId}/blueprint`);
  const templatePath = resolvePromptFilePath(genreId, "blueprint");
  const templateRaw = await readFile(templatePath, "utf-8");

  // project config のキーを string 化
  const configMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(projectConfig)) {
    if (typeof value === "string") {
      configMap[key] = value;
    }
  }
  if (episodeId) {
    configMap.EPISODE_ID = episodeId;
  }

  const { resolvedPrompt } = resolvePromptTemplate(templateRaw, configMap);
  const promptSection = extractPromptSection(resolvedPrompt);

  // 3. ソースファイル読み込み
  const sourceGlob = projectConfig.SOURCE_MARKDOWN_PATHS ?? "";
  console.log(`[gen-blueprint] Loading source files: ${sourceGlob || "(none)"}`);
  const sourceContents = await loadSourceFiles(sourceGlob);

  // 4. プロンプト構築
  let fullPrompt = promptSection;
  if (sourceContents.length > 0) {
    fullPrompt += "\n\n---\n\n## Source Materials\n\n" + sourceContents.join("\n\n---\n\n");
  }

  // 5. claude 実行
  console.log("[gen-blueprint] Running claude --print -...");
  const output = await runClaudeWithPrompt(fullPrompt);

  // 6. JSON 抽出
  const blueprintJson = extractJson(output);

  // 7. run ディレクトリ作成
  const runId = makeRunIdNow();
  const runDir = path.resolve("data", "projects", projectId, runId);
  const blueprintDir = path.join(runDir, "blueprint");
  await mkdir(blueprintDir, { recursive: true });

  // 8. blueprint 保存
  const blueprintPath = path.join(blueprintDir, "project_blueprint.json");
  await writeFile(blueprintPath, JSON.stringify(blueprintJson, null, 2) + "\n");
  console.log(`[gen-blueprint] Saved: ${path.relative(process.cwd(), blueprintPath)}`);

  // 9. run-contract 作成・保存
  const contract = createRunContract({ projectId, runId, runDir });
  await saveRunContract(contract);
  console.log(`[gen-blueprint] Run contract saved: ${runDir}`);

  // 10. スキーマバリデーション
  try {
    await validateAgainstSchema(blueprintJson, SCHEMA_PATHS.blueprint);
    console.log("[gen-blueprint] Schema validation: OK");
  } catch (err) {
    console.log(`[gen-blueprint] Schema validation: WARN - ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// gen-material
// ---------------------------------------------------------------------------

export interface GenMaterialOptions {
  projectId: string;
  episodeId: string;
  runDir: string;
}

export async function genMaterial(options: GenMaterialOptions): Promise<void> {
  const { projectId, episodeId, runDir } = options;

  // 1. project config 読み込み
  console.log(`[gen-material] Loading project config: ${projectId}`);
  const projectConfig = await loadProjectConfig(projectId);
  const genreId = projectConfig.GENRE_ID;

  // 2. blueprint 読み込み
  const blueprintPath = path.join(runDir, "blueprint", "project_blueprint.json");
  console.log(`[gen-material] Loading blueprint: ${blueprintPath}`);
  const blueprintRaw = await readFile(blueprintPath, "utf-8");
  const blueprint = JSON.parse(blueprintRaw);

  // 3. プロンプトテンプレート解決
  console.log(`[gen-material] Resolving prompt template: ${genreId}/material`);
  const templatePath = resolvePromptFilePath(genreId, "material");
  const templateRaw = await readFile(templatePath, "utf-8");

  const configMap: Record<string, string> = {};
  for (const [key, value] of Object.entries(projectConfig)) {
    if (typeof value === "string") {
      configMap[key] = value;
    }
  }
  configMap.EPISODE_ID = episodeId;

  const { resolvedPrompt } = resolvePromptTemplate(templateRaw, configMap);
  const promptSection = extractPromptSection(resolvedPrompt);

  // 4. ソースファイル読み込み
  const sourceGlob = projectConfig.SOURCE_MARKDOWN_PATHS ?? "";
  console.log(`[gen-material] Loading source files: ${sourceGlob || "(none)"}`);
  const sourceContents = await loadSourceFiles(sourceGlob);

  // 5. プロンプト構築
  let fullPrompt = promptSection;
  fullPrompt += "\n\n---\n\n## Blueprint JSON\n\n```json\n" + JSON.stringify(blueprint, null, 2) + "\n```";
  if (sourceContents.length > 0) {
    fullPrompt += "\n\n---\n\n## Source Materials\n\n" + sourceContents.join("\n\n---\n\n");
  }

  // 6. claude 実行
  console.log("[gen-material] Running claude --print -...");
  const output = await runClaudeWithPrompt(fullPrompt);

  // 7. JSON 抽出
  const materialJson = extractJson(output);

  // 8. material ディレクトリ作成・保存
  const materialDir = path.join(runDir, "material");
  await mkdir(materialDir, { recursive: true });
  const materialPath = path.join(materialDir, `${episodeId}_material.json`);
  await writeFile(materialPath, JSON.stringify(materialJson, null, 2) + "\n");
  console.log(`[gen-material] Saved: ${path.relative(process.cwd(), materialPath)}`);

  // 9. スキーマバリデーション
  try {
    await validateAgainstSchema(materialJson, SCHEMA_PATHS.episodeMaterial);
    console.log("[gen-material] Schema validation: OK");
  } catch (err) {
    console.log(`[gen-material] Schema validation: WARN - ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// gen-script
// ---------------------------------------------------------------------------

export interface GenScriptOptions {
  projectId: string;
  episodeId: string;
  runDir: string;
}

export async function genScript(options: GenScriptOptions): Promise<void> {
  const { projectId, episodeId, runDir } = options;

  // 1. project config 読み込み
  console.log(`[gen-script] Loading project config: ${projectId}`);
  const projectConfig = await loadProjectConfig(projectId);
  const { GENRE_ID: genreId, STYLE_ID: styleId, CAST: cast } = projectConfig;

  // 2. material 読み込み
  const materialPath = path.join(runDir, "material", `${episodeId}_material.json`);
  console.log(`[gen-script] Loading material: ${materialPath}`);
  const materialRaw = await readFile(materialPath, "utf-8");
  const material = JSON.parse(materialRaw);

  // 3. style 読み込み
  const stylePath = path.resolve("configs", "content", "styles", `${styleId}.json`);
  console.log(`[gen-script] Loading style: ${stylePath}`);
  const styleRaw = await readFile(stylePath, "utf-8");
  const style = JSON.parse(styleRaw);

  // 4. character 読み込み
  const characters: Record<string, unknown> = {};
  for (const [role, characterKey] of Object.entries(cast)) {
    const charPath = path.resolve("configs", "content", "characters", `${characterKey}.json`);
    console.log(`[gen-script] Loading character [${role}]: ${charPath}`);
    const charRaw = await readFile(charPath, "utf-8");
    characters[role] = { key: characterKey, ...JSON.parse(charRaw) };
  }

  // 5. 先行ダイジェスト読み込み
  const episodeNum = Number.parseInt(episodeId.replace("E", ""), 10);
  const contextDir = path.join(runDir, "context");
  const priorDigests: unknown[] = [];
  for (let i = 1; i < episodeNum; i++) {
    const prevId = `E${String(i).padStart(2, "0")}`;
    const digestPath = path.join(contextDir, `${prevId}_episode_digest.json`);
    try {
      const digestRaw = await readFile(digestPath, "utf-8");
      priorDigests.push(JSON.parse(digestRaw));
    } catch {
      // 先行ダイジェストが存在しない場合はスキップ
    }
  }

  // 6. プロンプト構築
  const templatePath = resolvePromptFilePath(genreId, "script");
  const templateRaw = await readFile(templatePath, "utf-8");
  const promptSection = extractPromptSection(templateRaw);

  let fullPrompt = promptSection;
  fullPrompt += "\n\n---\n\n## Material JSON\n\n```json\n" + JSON.stringify(material, null, 2) + "\n```";
  fullPrompt += "\n\n---\n\n## Style JSON\n\n```json\n" + JSON.stringify(style, null, 2) + "\n```";
  fullPrompt += "\n\n---\n\n## Character Profiles\n\n```json\n" + JSON.stringify(characters, null, 2) + "\n```";
  if (priorDigests.length > 0) {
    fullPrompt += "\n\n---\n\n## Prior Episode Digests\n\n```json\n" + JSON.stringify(priorDigests, null, 2) + "\n```";
  }

  // 7. claude 実行
  console.log("[gen-script] Running claude --print -...");
  const output = await runClaudeWithPrompt(fullPrompt);

  // 8. Markdown 保存（生テキスト）
  const scriptDir = path.join(runDir, "script");
  await mkdir(scriptDir, { recursive: true });
  const scriptPath = path.join(scriptDir, `${episodeId}_script.md`);
  await writeFile(scriptPath, output.trim() + "\n");
  console.log(`[gen-script] Saved: ${path.relative(process.cwd(), scriptPath)}`);

  // 9. 最小構造検証
  const scriptContent = output.trim();
  const isEmpty = scriptContent.length === 0;
  const hasSectionHeaders = /^## \d+\./m.test(scriptContent);
  const hasSpeakerTags = /\[speaker:/.test(scriptContent);

  if (isEmpty) {
    throw new Error("[gen-script] Script is empty");
  }
  if (!hasSectionHeaders) {
    console.log("[gen-script] WARN: No section headers (## N.) found in script");
  }
  if (!hasSpeakerTags) {
    console.log("[gen-script] WARN: No speaker tags ([speaker:xxx]) found in script");
  }
  if (hasSectionHeaders && hasSpeakerTags) {
    console.log("[gen-script] Structure validation: OK");
  }
}

// ---------------------------------------------------------------------------
// gen-digest
// ---------------------------------------------------------------------------

export interface GenDigestOptions {
  projectId: string;
  episodeId: string;
  runDir: string;
}

export async function genDigest(options: GenDigestOptions): Promise<void> {
  const { projectId, episodeId, runDir } = options;

  // 1. project config 読み込み
  console.log(`[gen-digest] Loading project config: ${projectId}`);
  const projectConfig = await loadProjectConfig(projectId);
  const { GENRE_ID: genreId, CAST: cast } = projectConfig;

  // 2. 台本読み込み
  const scriptPath = path.join(runDir, "script", `${episodeId}_script.md`);
  console.log(`[gen-digest] Loading script: ${scriptPath}`);
  const scriptContent = await readFile(scriptPath, "utf-8");

  // 3. material 読み込み
  const materialPath = path.join(runDir, "material", `${episodeId}_material.json`);
  console.log(`[gen-digest] Loading material: ${materialPath}`);
  const materialRaw = await readFile(materialPath, "utf-8");
  const material = JSON.parse(materialRaw);

  // 4. blueprint 読み込み
  const blueprintPath = path.join(runDir, "blueprint", "project_blueprint.json");
  console.log(`[gen-digest] Loading blueprint: ${blueprintPath}`);
  const blueprintRaw = await readFile(blueprintPath, "utf-8");
  const blueprint = JSON.parse(blueprintRaw);

  // 5. character 読み込み
  const characters: Record<string, unknown> = {};
  for (const [role, characterKey] of Object.entries(cast)) {
    const charPath = path.resolve("configs", "content", "characters", `${characterKey}.json`);
    const charRaw = await readFile(charPath, "utf-8");
    characters[role] = { key: characterKey, ...JSON.parse(charRaw) };
  }

  // 6. プロンプト構築
  const templatePath = resolvePromptFilePath(genreId, "digest");
  const templateRaw = await readFile(templatePath, "utf-8");
  const promptSection = extractPromptSection(templateRaw);

  let fullPrompt = promptSection;
  fullPrompt += "\n\n---\n\n## Script (Markdown)\n\n" + scriptContent;
  fullPrompt += "\n\n---\n\n## Material JSON\n\n```json\n" + JSON.stringify(material, null, 2) + "\n```";
  fullPrompt += "\n\n---\n\n## Blueprint JSON\n\n```json\n" + JSON.stringify(blueprint, null, 2) + "\n```";
  fullPrompt += "\n\n---\n\n## Character Profiles\n\n```json\n" + JSON.stringify(characters, null, 2) + "\n```";

  // 7. claude 実行
  console.log("[gen-digest] Running claude --print -...");
  const output = await runClaudeWithPrompt(fullPrompt);

  // 8. JSON 抽出・保存
  const digestJson = extractJson(output);

  const contextDir = path.join(runDir, "context");
  await mkdir(contextDir, { recursive: true });
  const digestPath = path.join(contextDir, `${episodeId}_episode_digest.json`);
  await writeFile(digestPath, JSON.stringify(digestJson, null, 2) + "\n");
  console.log(`[gen-digest] Saved: ${path.relative(process.cwd(), digestPath)}`);

  // 9. スキーマバリデーション
  try {
    await validateAgainstSchema(digestJson, SCHEMA_PATHS.episodeDigest);
    console.log("[gen-digest] Schema validation: OK");
  } catch (err) {
    console.log(`[gen-digest] Schema validation: WARN - ${err instanceof Error ? err.message : String(err)}`);
  }
}
