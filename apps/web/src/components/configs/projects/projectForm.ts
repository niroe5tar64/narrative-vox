import type { ProjectConfig } from "@/api/client";

export type CastRow = { role: string; charKey: string };

export type ProjForm = {
  PROJECT_ID: string;
  PROJECT_TITLE: string;
  GENRE_ID: string;
  STYLE_ID: string;
  EPISODE_ID: string;
  SOURCE_MARKDOWN_PATHS: string;
  AUDIENCE_BACKGROUND: string;
  AUDIENCE_LEVEL: string;
  AUDIENCE_INTEREST: string;
  BASELINE_CONTEXT_OR_EMPTY: string;
  EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: string;
  PROJECT_BLUEPRINT_JSON_PATH: string;
  REPO_ROOT_PATH: string;
  DEEP_DIVE_FOCUS: string;
  castRows: CastRow[];
  NOTES: string;
};

export const EMPTY_FORM: ProjForm = {
  PROJECT_ID: "",
  PROJECT_TITLE: "",
  GENRE_ID: "",
  STYLE_ID: "",
  EPISODE_ID: "E01",
  SOURCE_MARKDOWN_PATHS: "",
  AUDIENCE_BACKGROUND: "",
  AUDIENCE_LEVEL: "",
  AUDIENCE_INTEREST: "",
  BASELINE_CONTEXT_OR_EMPTY: "",
  EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: "",
  PROJECT_BLUEPRINT_JSON_PATH: "",
  REPO_ROOT_PATH: "",
  DEEP_DIVE_FOCUS: "",
  castRows: [],
  NOTES: "",
};

export function projToForm(p: ProjectConfig): ProjForm {
  return {
    PROJECT_ID: p.PROJECT_ID,
    PROJECT_TITLE: p.PROJECT_TITLE,
    GENRE_ID: p.GENRE_ID,
    STYLE_ID: p.STYLE_ID,
    EPISODE_ID: p.EPISODE_ID,
    SOURCE_MARKDOWN_PATHS: p.SOURCE_MARKDOWN_PATHS,
    AUDIENCE_BACKGROUND: p.AUDIENCE_BACKGROUND,
    AUDIENCE_LEVEL: p.AUDIENCE_LEVEL,
    AUDIENCE_INTEREST: p.AUDIENCE_INTEREST,
    BASELINE_CONTEXT_OR_EMPTY: p.BASELINE_CONTEXT_OR_EMPTY,
    EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: p.EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY,
    PROJECT_BLUEPRINT_JSON_PATH: p.PROJECT_BLUEPRINT_JSON_PATH,
    REPO_ROOT_PATH:
      (p as unknown as Record<string, string>).REPO_ROOT_PATH ?? "",
    DEEP_DIVE_FOCUS:
      (p as unknown as Record<string, string>).DEEP_DIVE_FOCUS ?? "",
    castRows: Object.entries(p.CAST).map(([role, charKey]) => ({
      role,
      charKey,
    })),
    NOTES: p.NOTES ?? "",
  };
}

export function formToProj(f: ProjForm, extraFields: string[]): ProjectConfig {
  const base: ProjectConfig = {
    PROJECT_ID: f.PROJECT_ID,
    PROJECT_TITLE: f.PROJECT_TITLE,
    GENRE_ID: f.GENRE_ID,
    STYLE_ID: f.STYLE_ID,
    EPISODE_ID: f.EPISODE_ID,
    SOURCE_MARKDOWN_PATHS: f.SOURCE_MARKDOWN_PATHS,
    AUDIENCE_BACKGROUND: f.AUDIENCE_BACKGROUND,
    AUDIENCE_LEVEL: f.AUDIENCE_LEVEL,
    AUDIENCE_INTEREST: f.AUDIENCE_INTEREST,
    BASELINE_CONTEXT_OR_EMPTY: f.BASELINE_CONTEXT_OR_EMPTY,
    EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: f.EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY,
    PROJECT_BLUEPRINT_JSON_PATH: f.PROJECT_BLUEPRINT_JSON_PATH,
    CAST: Object.fromEntries(
      f.castRows.filter((r) => r.role.trim()).map((r) => [r.role, r.charKey]),
    ),
    ...(f.NOTES && { NOTES: f.NOTES }),
  };
  const extra = base as unknown as Record<string, string>;
  if (extraFields.includes("REPO_ROOT_PATH") && f.REPO_ROOT_PATH) {
    extra.REPO_ROOT_PATH = f.REPO_ROOT_PATH;
  }
  if (extraFields.includes("DEEP_DIVE_FOCUS") && f.DEEP_DIVE_FOCUS) {
    extra.DEEP_DIVE_FOCUS = f.DEEP_DIVE_FOCUS;
  }
  return base;
}
