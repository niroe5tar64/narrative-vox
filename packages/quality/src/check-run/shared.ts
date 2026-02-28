import { access } from "node:fs/promises";
import path from "node:path";

export const MATERIAL_FILE_RE = /^(E[0-9]{2})_material\.json$/;
export const SCRIPT_FILE_RE = /^(E[0-9]{2})_script\.md$/;
export const DIGEST_FILE_RE = /^(E[0-9]{2})_episode_digest\.json$/;

export type SpeakerMode = "monologue" | "dialogue" | "panel";

export interface BlueprintEpisodePlanItem {
  episode_id: string;
  prerequisite_episodes?: string[];
}

export interface BlueprintForCheckRun {
  episode_plan: BlueprintEpisodePlanItem[];
}

export interface EpisodeMaterialForCheckRun {
  meta: {
    project_id: string;
  };
  technical_terms?: Array<{
    term?: string;
    note?: string;
  }>;
}

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
  schema_version: "1.1";
  meta: {
    project_id: string;
    run_id: string;
    episode_id: string;
    generated_at: string;
    source_material_path: string;
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

export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath);
    return true;
  } catch {
    return false;
  }
}
