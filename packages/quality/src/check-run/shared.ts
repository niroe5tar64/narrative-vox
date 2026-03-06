import { access } from "node:fs/promises";
import path from "node:path";

export const EPISODE_PACK_FILE_RE = /^(E[0-9]{2})_episode_pack\.json$/;
export const SCRIPT_FILE_RE = /^(E[0-9]{2})_script\.md$/;
export const SERIES_CONTEXT_FILE_RE = /^(E[0-9]{2})_series_context\.json$/;
export const VOICEVOX_TEXT_FILE_RE = /^(E[0-9]{2})_voicevox_text\.json$/;
export const VVPROJ_META_RE = /^(E[0-9]{2})_voicevox_project_meta\.json$/;
export const AUDIO_WAV_FILE_RE = /^(E[0-9]{2})_.*\.wav$/;

export type SpeakerMode = "monologue" | "dialogue" | "panel";

export interface ProjectConfigForCheckRun {
  STYLE_ID: string;
}

export interface ContentStyleForCheckRun {
  style_id: string;
  format: {
    speaker_mode: SpeakerMode;
    speaker_count: number;
  };
}

export interface VoicevoxTextForCheckRun {
  dictionary_candidates?: Array<{
    surface?: string;
    priority?: string;
    reading_or_empty?: string;
  }>;
}

export interface UserDictForCheckRun {
  words?: Array<{
    surface?: string;
  }>;
}

export interface TechnicalTermsAuditDetail {
  term: string;
  variants: string[];
}

export interface TechnicalTermsAuditReport {
  schema_version: "1.0";
  meta: {
    project_id: string;
    run_id: string;
    episode_id: string;
    generated_at: string;
    source_episode_pack_path: string;
    source_script_path: string;
    source_voicevox_text_path?: string;
  };
  summary: {
    total_terms: number;
    evaluated_terms: number;
    covered_terms: number;
    coverage_ratio: number;
    skipped_non_ascii_terms_count: number;
    unresolved_high_risk_count: number;
    notation_inconsistency_count: number;
    high_priority_not_in_user_dict_count: number;
    candidates_without_reading_count: number;
    warnings_count: number;
  };
  warnings: string[];
  details: {
    missing_in_script: string[];
    missing_in_dictionary_candidates: string[];
    unresolved_high_risk_terms: string[];
    skipped_non_ascii_terms: string[];
    notation_inconsistencies: TechnicalTermsAuditDetail[];
    high_priority_not_in_user_dict: string[];
    candidates_without_reading: string[];
  };
}

export function toRelativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || ".";
}

export function collectEpisodeIds(
  fileNames: string[],
  pattern: RegExp,
): string[] {
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

export function diffEpisodes(
  baseIds: string[],
  compareIds: string[],
): string[] {
  const compareSet = new Set(compareIds);
  return baseIds.filter((id) => !compareSet.has(id));
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}
