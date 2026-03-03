import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { OssDiveProjectConfig } from "@narrative-vox/api-types/projects.ts";
import { estimateTokens } from "../shared/token-estimate.ts";

export interface RawRepoFileSection {
  source_type: "repo_file";
  repo_relative_path: string;
  display_title: string;
  language: string;
  body_text: string;
  char_count: number;
  token_estimate: number;
  is_auxiliary: boolean;
  preview_text: string;
  symbol_outline?: Array<{
    kind: "function" | "class" | "interface" | "type";
    name: string;
    line: number;
  }>;
}

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".rb": "ruby",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".swift": "swift",
  ".php": "php",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".md": "markdown",
  ".sql": "sql",
  ".graphql": "graphql",
  ".proto": "protobuf",
  ".zig": "zig",
  ".lua": "lua",
  ".ex": "elixir",
  ".exs": "elixir",
  ".erl": "erlang",
  ".ml": "ocaml",
  ".mli": "ocaml",
  ".res": "rescript",
  ".resi": "rescript",
  ".svelte": "svelte",
  ".vue": "vue",
  ".dart": "dart",
  ".r": "r",
  ".R": "r",
  ".scala": "scala",
  ".clj": "clojure",
  ".hs": "haskell",
  ".elm": "elm",
  ".nim": "nim",
  ".v": "v",
  ".tf": "terraform",
  ".dockerfile": "dockerfile",
  ".makefile": "makefile",
};

const DEFAULT_EXCLUDE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  ".next",
  ".cache",
  "__pycache__",
  ".tox",
  "vendor",
  "coverage",
  ".nyc_output",
];

const WHITELIST_EXTENSIONS = new Set(Object.keys(LANGUAGE_MAP));

// Also allow extensionless well-known files
const WHITELIST_FILENAMES = new Set([
  "Makefile",
  "Dockerfile",
  "Jenkinsfile",
  "Rakefile",
  "Gemfile",
  "Procfile",
]);

function makePreviewText(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  const codePoints = [...collapsed];
  if (codePoints.length <= 200) return collapsed;
  return codePoints.slice(0, 200).join("");
}

function resolveLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  if (LANGUAGE_MAP[ext]) return LANGUAGE_MAP[ext];
  const basename = path.basename(filePath);
  if (basename === "Makefile" || basename === "makefile") return "makefile";
  if (basename === "Dockerfile" || basename.startsWith("Dockerfile."))
    return "dockerfile";
  return null;
}

function shouldExclude(
  relativePath: string,
  excludePatterns: string[],
): boolean {
  const segments = relativePath.split(path.sep);
  for (const pattern of excludePatterns) {
    if (segments.some((seg) => seg === pattern)) return true;
  }
  return false;
}

function shouldInclude(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  if (WHITELIST_EXTENSIONS.has(ext)) return true;
  const basename = path.basename(filePath);
  return WHITELIST_FILENAMES.has(basename);
}

async function walkDirectory(
  dir: string,
  rootDir: string,
  excludePatterns: string[],
): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(rootDir, fullPath);
    if (shouldExclude(relativePath, excludePatterns)) continue;
    if (entry.isDirectory()) {
      const subResults = await walkDirectory(fullPath, rootDir, excludePatterns);
      results.push(...subResults);
    } else if (entry.isFile() && shouldInclude(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

const MAX_FILE_SIZE = 512 * 1024; // 512KB

export async function collectOssDiveSections(
  config: OssDiveProjectConfig,
): Promise<RawRepoFileSection[]> {
  const repoRoot = path.resolve(config.REPO_ROOT_PATH);
  const excludePatterns = [
    ...DEFAULT_EXCLUDE_PATTERNS,
    ...(config.SOURCE_EXCLUDE_PATHS ?? []),
  ];

  const files = await walkDirectory(repoRoot, repoRoot, excludePatterns);
  files.sort();

  const sections: RawRepoFileSection[] = [];
  for (const filePath of files) {
    const fileStat = await stat(filePath);
    if (fileStat.size > MAX_FILE_SIZE) continue;

    const content = await readFile(filePath, "utf-8");
    const relativePath = path.relative(repoRoot, filePath);
    const language = resolveLanguage(filePath);
    if (!language) continue;

    const isAux =
      relativePath.startsWith("test") ||
      relativePath.startsWith("tests") ||
      relativePath.includes("__test__") ||
      relativePath.includes("__tests__") ||
      relativePath.includes(".test.") ||
      relativePath.includes(".spec.") ||
      relativePath.includes("fixture") ||
      relativePath.includes("example");

    sections.push({
      source_type: "repo_file",
      repo_relative_path: relativePath,
      display_title: relativePath,
      language,
      body_text: content,
      char_count: content.length,
      token_estimate: estimateTokens(content),
      is_auxiliary: isAux,
      preview_text: makePreviewText(content),
    });
  }

  return sections;
}

// Exported for testing
export {
  resolveLanguage as _resolveLanguage,
  shouldExclude as _shouldExclude,
  shouldInclude as _shouldInclude,
  LANGUAGE_MAP as _LANGUAGE_MAP,
  DEFAULT_EXCLUDE_PATTERNS as _DEFAULT_EXCLUDE_PATTERNS,
};
