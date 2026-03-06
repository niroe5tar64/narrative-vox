import { readFile } from "node:fs/promises";
import { parseSectionHeader } from "@narrative-vox/domain/script-structure.ts";
import {
  hasSpeakerTagPrefix,
  parseSpeakerTag,
} from "@narrative-vox/domain/speaker-tag.ts";
import type { CollectedArtifacts } from "../artifact-collection.ts";
import type { CheckRunIssue } from "../issues.ts";
import { type ContentStyleForCheckRun, toRelativePath } from "../shared.ts";

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

export async function validateScriptStructure(
  artifacts: CollectedArtifacts,
  plannedEpisodeIds: string[],
  contentStyle: ContentStyleForCheckRun | null,
): Promise<{
  scriptTextByEpisodeId: Map<string, string>;
  issues: CheckRunIssue[];
}> {
  const issues: CheckRunIssue[] = [];
  const stage = "script-structure" as const;
  const scriptTextByEpisodeId = new Map<string, string>();

  for (const episodeId of plannedEpisodeIds) {
    const scriptPath = artifacts.scriptPaths.get(episodeId);
    if (!scriptPath) continue;

    try {
      const scriptText = await readFile(scriptPath, "utf-8");
      scriptTextByEpisodeId.set(episodeId, scriptText);

      ensureMinimalScriptStructure(scriptText, scriptPath, episodeId);

      if (contentStyle) {
        validateScriptSpeakerStructure(
          scriptText,
          scriptPath,
          episodeId,
          contentStyle,
        );
      }
    } catch (error) {
      issues.push({
        stage,
        episodeId,
        message: (error as Error).message,
      });
    }
  }

  return { scriptTextByEpisodeId, issues };
}
