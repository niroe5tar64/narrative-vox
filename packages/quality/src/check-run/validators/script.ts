import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parseSectionHeader } from "@narrative-vox/domain/script-structure.ts";
import {
  hasSpeakerTagPrefix,
  parseSpeakerTag,
} from "@narrative-vox/domain/speaker-tag.ts";
import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import {
  type ContentStyleForCheckRun,
  collectEpisodeIds,
  DIGEST_FILE_RE,
  diffEpisodes,
  dirExists,
  SCRIPT_FILE_RE,
  toRelativePath,
} from "../shared.ts";

export function ensureMinimalScriptStructure(
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

export function validateScriptSpeakerStructure(
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

  const mode = contentStyle.format.speaker_mode;
  const count = contentStyle.format.speaker_count;
  if (mode === "panel") {
    if (speakerKeys.size < 2 || speakerKeys.size > count) {
      const speakerList = [...speakerKeys].sort().join(", ") || "(none)";
      throw new Error(
        `${scriptRef} has ${speakerKeys.size} unique speaker keys (${speakerList}), but style "${contentStyle.style_id}" (panel) requires 2..${count} speakers for panel mode`,
      );
    }
  } else if (speakerKeys.size !== count) {
    const speakerList = [...speakerKeys].sort().join(", ") || "(none)";
    throw new Error(
      `${scriptRef} has ${speakerKeys.size} unique speaker keys (${speakerList}), but style "${contentStyle.style_id}" (${mode}) requires speaker_count=${count}`,
    );
  }
}

export async function validateScripts(params: {
  resolvedRunDir: string;
  contentStyle: ContentStyleForCheckRun;
}): Promise<{
  scriptPaths: string[];
  scriptEpisodeIds: string[];
  scriptPathByEpisodeId: Map<string, string>;
  scriptTextByEpisodeId: Map<string, string>;
}> {
  const scriptDir = path.join(params.resolvedRunDir, "script");
  const scriptFiles = (await readdir(scriptDir))
    .filter((name) => SCRIPT_FILE_RE.test(name))
    .sort();
  if (scriptFiles.length === 0) {
    throw new Error(`${toRelativePath(scriptDir)} has no E##_script.md files`);
  }

  const scriptPaths: string[] = [];
  const scriptPathByEpisodeId = new Map<string, string>();
  const scriptTextByEpisodeId = new Map<string, string>();
  const scriptEpisodeIds = collectEpisodeIds(scriptFiles, SCRIPT_FILE_RE);

  for (const fileName of scriptFiles) {
    const match = fileName.match(SCRIPT_FILE_RE);
    const episodeId = match?.[1];
    if (!episodeId) {
      continue;
    }
    const filePath = path.join(scriptDir, fileName);
    const scriptText = await readFile(filePath, "utf-8");
    scriptPaths.push(filePath);
    scriptPathByEpisodeId.set(episodeId, `script/${fileName}`);
    scriptTextByEpisodeId.set(episodeId, scriptText);
    ensureMinimalScriptStructure(scriptText, filePath, episodeId);
    validateScriptSpeakerStructure(
      scriptText,
      filePath,
      episodeId,
      params.contentStyle,
    );
  }

  return {
    scriptPaths,
    scriptEpisodeIds,
    scriptPathByEpisodeId,
    scriptTextByEpisodeId,
  };
}

export function validateEpisodeParity(
  materialEpisodeIds: string[],
  scriptEpisodeIds: string[],
): void {
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
}

export async function validateDigestsIfPresent(params: {
  resolvedRunDir: string;
  materialEpisodeIds: string[];
  warnings: string[];
}): Promise<void> {
  const contextDir = path.join(params.resolvedRunDir, "context");
  if (!(await dirExists(contextDir))) {
    return;
  }

  const contextFiles = (await readdir(contextDir))
    .filter((name) => DIGEST_FILE_RE.test(name))
    .sort();
  for (const fileName of contextFiles) {
    const filePath = path.join(contextDir, fileName);
    const digest = await loadJson<{ episode_id?: string }>(filePath);
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

  for (const episodeId of params.materialEpisodeIds) {
    const episodeNum = Number.parseInt(episodeId.slice(1), 10);
    if (episodeNum < 2) {
      continue;
    }
    const prevEpisodeId = `E${String(episodeNum - 1).padStart(2, "0")}`;
    const prevDigestFile = `${prevEpisodeId}_episode_digest.json`;
    const prevDigestPath = path.join(contextDir, prevDigestFile);
    if (!(await dirExists(prevDigestPath))) {
      params.warnings.push(
        `${episodeId}: prior digest ${prevDigestFile} not found (continuity may be limited)`,
      );
    }
  }
}
