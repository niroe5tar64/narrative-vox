import { readFile } from "node:fs/promises";
import path from "node:path";

export interface RenderPromptOptions {
  genre: string;
  step: string;
  bookConfigPath: string;
  episodeId?: string;
}

export interface RenderPromptResult {
  resolvedPrompt: string;
  templatePath: string;
  unresolvedKeys: string[];
}

const STEP_FILE_MAP: Record<string, string> = {
  blueprint: "blueprint.md",
  variables: "episode_variables.md",
};

/**
 * Resolve the filesystem path for a prompt template given genre and step.
 */
export function resolvePromptTemplatePath(genre: string, step: string): string {
  const filename = STEP_FILE_MAP[step];
  if (!filename) {
    throw new Error(`Unknown step: ${step}. Valid steps: ${Object.keys(STEP_FILE_MAP).join(", ")}`);
  }
  return path.resolve("prompts", genre, filename);
}

const PLACEHOLDER_RE = /\{\{([A-Z0-9_]+)\}\}/g;
const PROMPT_SECTION_RE = /^## Prompt$/m;

/**
 * Resolve placeholders in a prompt template using a config map.
 * Only resolves placeholders in the ## Prompt section (after the --- separator).
 * Placeholders inside ```json code blocks are left untouched.
 */
export function resolvePromptTemplate(
  template: string,
  config: Record<string, string>
): RenderPromptResult {
  const promptSectionIndex = template.search(PROMPT_SECTION_RE);
  if (promptSectionIndex === -1) {
    return { resolvedPrompt: template, templatePath: "", unresolvedKeys: [] };
  }

  const preamble = template.slice(0, promptSectionIndex);
  const promptSection = template.slice(promptSectionIndex);

  // Split prompt section by code blocks to avoid replacing inside them
  const segments = promptSection.split(/(```[\s\S]*?```)/g);
  const unresolvedKeys = new Set<string>();

  const resolvedSegments = segments.map((segment, index) => {
    // Odd indices are code block contents — skip them
    if (index % 2 === 1) {
      return segment;
    }
    return segment.replace(PLACEHOLDER_RE, (_match, key: string) => {
      if (key in config) {
        return config[key];
      }
      unresolvedKeys.add(key);
      return `{{${key}}}`;
    });
  });

  const resolvedPrompt = preamble + resolvedSegments.join("");
  return {
    resolvedPrompt,
    templatePath: "",
    unresolvedKeys: [...unresolvedKeys].sort(),
  };
}

/**
 * Load a prompt template for the given genre/step, resolve placeholders
 * from the book config, and return the result.
 */
export async function renderPrompt(options: RenderPromptOptions): Promise<RenderPromptResult> {
  const templatePath = resolvePromptTemplatePath(options.genre, options.step);
  const [template, configRaw] = await Promise.all([
    readFile(templatePath, "utf-8"),
    readFile(options.bookConfigPath, "utf-8"),
  ]);

  const config: Record<string, string> = JSON.parse(configRaw);

  // Override EPISODE_ID if provided
  if (options.episodeId) {
    config.EPISODE_ID = options.episodeId;
  }

  const result = resolvePromptTemplate(template, config);

  if (result.unresolvedKeys.length > 0) {
    throw new Error(
      `Unresolved placeholders: ${result.unresolvedKeys.join(", ")}. ` +
        `Check book config: ${options.bookConfigPath}`
    );
  }

  return {
    ...result,
    templatePath,
  };
}
