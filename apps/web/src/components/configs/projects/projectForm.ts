import type { ProjectConfig } from "@/api/client";

export type CastRow = { role: string; charKey: string };

export type ProjForm = {
  PROJECT_ID: string;
  PROJECT_TITLE: string;
  GENRE_ID: string;
  STYLE_ID: string;
  SOURCE_MARKDOWN_PATHS: string;
  AUDIENCE_BACKGROUND: string;
  AUDIENCE_LEVEL: string;
  AUDIENCE_INTEREST: string;
  BASELINE_CONTEXT_OR_EMPTY: string;
  EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: string;
  REPO_ROOT_PATH: string;
  DEEP_DIVE_FOCUS: string;
  SOURCE_LANGUAGE_HINT: string;
  SOURCE_EXCLUDE_PATHS: string;
  castRows: CastRow[];
  NOTES: string;
};

export const EMPTY_FORM: ProjForm = {
  PROJECT_ID: "",
  PROJECT_TITLE: "",
  GENRE_ID: "",
  STYLE_ID: "",
  SOURCE_MARKDOWN_PATHS: "",
  AUDIENCE_BACKGROUND: "",
  AUDIENCE_LEVEL: "",
  AUDIENCE_INTEREST: "",
  BASELINE_CONTEXT_OR_EMPTY: "",
  EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: "",
  REPO_ROOT_PATH: "",
  DEEP_DIVE_FOCUS: "",
  SOURCE_LANGUAGE_HINT: "",
  SOURCE_EXCLUDE_PATHS: "",
  castRows: [],
  NOTES: "",
};

export function projToForm(p: ProjectConfig): ProjForm {
  const base = {
    PROJECT_ID: p.PROJECT_ID,
    PROJECT_TITLE: p.PROJECT_TITLE ?? "",
    GENRE_ID: p.GENRE_ID,
    STYLE_ID: p.STYLE_ID,
    SOURCE_MARKDOWN_PATHS:
      "SOURCE_MARKDOWN_PATHS" in p ? p.SOURCE_MARKDOWN_PATHS : "",
    AUDIENCE_BACKGROUND: p.AUDIENCE_BACKGROUND ?? "",
    AUDIENCE_LEVEL: p.AUDIENCE_LEVEL ?? "",
    AUDIENCE_INTEREST: p.AUDIENCE_INTEREST ?? "",
    BASELINE_CONTEXT_OR_EMPTY: p.BASELINE_CONTEXT_OR_EMPTY ?? "",
    EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY:
      p.EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY ?? "",
    REPO_ROOT_PATH: "REPO_ROOT_PATH" in p ? p.REPO_ROOT_PATH : "",
    DEEP_DIVE_FOCUS: "DEEP_DIVE_FOCUS" in p ? p.DEEP_DIVE_FOCUS : "",
    SOURCE_LANGUAGE_HINT: p.SOURCE_LANGUAGE_HINT ?? "",
    SOURCE_EXCLUDE_PATHS: (p.SOURCE_EXCLUDE_PATHS ?? []).join("\n"),
    castRows: Object.entries(p.CAST).map(([role, charKey]) => ({
      role,
      charKey,
    })),
    NOTES: p.NOTES ?? "",
  };
  return base;
}

export function formToProj(f: ProjForm): ProjectConfig {
  const cast = Object.fromEntries(
    f.castRows.filter((r) => r.role.trim()).map((r) => [r.role, r.charKey]),
  );
  const excludePaths = f.SOURCE_EXCLUDE_PATHS.split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const langHint = f.SOURCE_LANGUAGE_HINT as "en" | "ja" | "mixed" | "";

  const common = {
    PROJECT_ID: f.PROJECT_ID,
    STYLE_ID: f.STYLE_ID,
    CAST: cast,
    ...(f.PROJECT_TITLE && { PROJECT_TITLE: f.PROJECT_TITLE }),
    ...(f.AUDIENCE_BACKGROUND && {
      AUDIENCE_BACKGROUND: f.AUDIENCE_BACKGROUND,
    }),
    ...(f.AUDIENCE_LEVEL && { AUDIENCE_LEVEL: f.AUDIENCE_LEVEL }),
    ...(f.AUDIENCE_INTEREST && { AUDIENCE_INTEREST: f.AUDIENCE_INTEREST }),
    ...(f.BASELINE_CONTEXT_OR_EMPTY && {
      BASELINE_CONTEXT_OR_EMPTY: f.BASELINE_CONTEXT_OR_EMPTY,
    }),
    ...(f.EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY && {
      EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: f.EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY,
    }),
    ...(f.NOTES && { NOTES: f.NOTES }),
    ...(langHint && { SOURCE_LANGUAGE_HINT: langHint }),
    ...(excludePaths.length > 0 && { SOURCE_EXCLUDE_PATHS: excludePaths }),
  };

  if (f.GENRE_ID === "oss-dive") {
    return {
      ...common,
      GENRE_ID: "oss-dive" as const,
      REPO_ROOT_PATH: f.REPO_ROOT_PATH,
      DEEP_DIVE_FOCUS: f.DEEP_DIVE_FOCUS,
    };
  }

  return {
    ...common,
    GENRE_ID: "tech-explainer" as const,
    SOURCE_MARKDOWN_PATHS: f.SOURCE_MARKDOWN_PATHS,
  };
}
