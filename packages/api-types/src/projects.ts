export type ProjectConfigBase = {
  PROJECT_ID: string;
  GENRE_ID: "tech-explainer" | "oss-dive";
  STYLE_ID: string;
  PROJECT_TITLE?: string;
  AUDIENCE_BACKGROUND?: string;
  AUDIENCE_LEVEL?: string;
  AUDIENCE_INTEREST?: string;
  BASELINE_CONTEXT_OR_EMPTY?: string;
  EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY?: string;
  CAST: Record<string, string>;
  NOTES?: string;
};

export type TechExplainerProjectConfig = ProjectConfigBase & {
  GENRE_ID: "tech-explainer";
  SOURCE_MARKDOWN_PATHS: string;
  SOURCE_EXCLUDE_PATHS?: string[];
  SOURCE_LANGUAGE_HINT?: "en" | "ja" | "mixed";
};

export type OssDiveProjectConfig = ProjectConfigBase & {
  GENRE_ID: "oss-dive";
  REPO_ROOT_PATH: string;
  DEEP_DIVE_FOCUS: string;
  SOURCE_EXCLUDE_PATHS?: string[];
  SOURCE_LANGUAGE_HINT?: "en" | "ja" | "mixed";
};

export type ProjectConfig = TechExplainerProjectConfig | OssDiveProjectConfig;
