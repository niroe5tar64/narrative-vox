import { readFile } from "node:fs/promises";
import type { TechExplainerProjectConfig } from "@narrative-vox/api-types/projects.ts";
import { estimateTokens } from "../shared/token-estimate.ts";

export interface RawMarkdownSection {
  source_type: "markdown_section";
  path: string;
  heading_path: string[];
  display_title: string;
  body_markdown: string;
  char_count: number;
  token_estimate: number;
  is_auxiliary: boolean;
  preview_text: string;
}

const AUXILIARY_KEYWORDS = [
  "appendix",
  "changelog",
  "acknowledgment",
  "acknowledgement",
  "reference",
  "bibliography",
  "glossary",
  "index",
  "colophon",
  "about",
  "license",
  "licence",
  "copyright",
  "faq",
  "付録",
  "謝辞",
  "参考文献",
  "索引",
  "奥付",
  "著者",
  "ライセンス",
];

function isAuxiliaryByHeading(headingPath: string[]): boolean {
  if (headingPath.length === 0) return false;
  const last = headingPath[headingPath.length - 1].toLowerCase();
  return AUXILIARY_KEYWORDS.some((kw) => last.includes(kw));
}

function makePreviewText(body: string): string {
  const collapsed = body.replace(/\s+/g, " ").trim();
  const codePoints = [...collapsed];
  if (codePoints.length <= 200) return collapsed;
  return codePoints.slice(0, 200).join("");
}

interface SectionAccumulator {
  headingPath: string[];
  bodyLines: string[];
  path: string;
  isFrontMatter: boolean;
}

function isTopLevelHeading(line: string): boolean {
  return /^#{1,2}\s/.test(line) && !/^###/.test(line);
}

function parseHeadingLevel(line: string): { level: number; text: string } | null {
  const match = line.match(/^(#{1,6})\s+(.*)/);
  if (!match) return null;
  return { level: match[1].length, text: match[2].trim() };
}

function flushSection(
  acc: SectionAccumulator,
  sections: RawMarkdownSection[],
): void {
  const body = acc.bodyLines.join("\n").trim();
  if (!body) return;
  const headingPath = acc.headingPath;
  const displayTitle =
    headingPath.length > 0
      ? headingPath[headingPath.length - 1]
      : acc.path;
  sections.push({
    source_type: "markdown_section",
    path: acc.path,
    heading_path: headingPath,
    display_title: displayTitle,
    body_markdown: body,
    char_count: body.length,
    token_estimate: estimateTokens(body),
    is_auxiliary: acc.isFrontMatter || isAuxiliaryByHeading(headingPath),
    preview_text: makePreviewText(body),
  });
}

function extractFrontMatter(
  content: string,
): { frontMatter: string | null; body: string } {
  if (!content.startsWith("---")) {
    return { frontMatter: null, body: content };
  }
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontMatter: null, body: content };
  }
  const fmEnd = endIndex + 4;
  return {
    frontMatter: content.slice(4, endIndex).trim(),
    body: content.slice(fmEnd).trimStart(),
  };
}

function collectSectionsFromFile(
  filePath: string,
  content: string,
): RawMarkdownSection[] {
  const sections: RawMarkdownSection[] = [];
  const { frontMatter, body } = extractFrontMatter(content);

  if (frontMatter) {
    sections.push({
      source_type: "markdown_section",
      path: filePath,
      heading_path: ["(front matter)"],
      display_title: "(front matter)",
      body_markdown: frontMatter,
      char_count: frontMatter.length,
      token_estimate: estimateTokens(frontMatter),
      is_auxiliary: true,
      preview_text: makePreviewText(frontMatter),
    });
  }

  const lines = body.split(/\r?\n/);
  let currentHeadingStack: string[] = [];
  let acc: SectionAccumulator | null = null;

  for (const line of lines) {
    const heading = parseHeadingLevel(line);
    if (heading && heading.level <= 2) {
      // Flush previous section
      if (acc) {
        flushSection(acc, sections);
      }
      // Update heading stack
      if (heading.level === 1) {
        currentHeadingStack = [heading.text];
      } else {
        currentHeadingStack = currentHeadingStack.length > 0
          ? [currentHeadingStack[0], heading.text]
          : [heading.text];
      }
      acc = {
        headingPath: [...currentHeadingStack],
        bodyLines: [],
        path: filePath,
        isFrontMatter: false,
      };
    } else {
      if (!acc) {
        acc = {
          headingPath: [...currentHeadingStack],
          bodyLines: [],
          path: filePath,
          isFrontMatter: false,
        };
      }
      acc.bodyLines.push(line);
    }
  }

  if (acc) {
    flushSection(acc, sections);
  }

  return sections;
}

export async function collectTechExplainerSections(
  config: TechExplainerProjectConfig,
): Promise<RawMarkdownSection[]> {
  const globPattern = config.SOURCE_MARKDOWN_PATHS;
  if (!globPattern) return [];

  const glob = new Bun.Glob(globPattern);
  const files: string[] = [];
  for await (const file of glob.scan({ cwd: process.cwd() })) {
    files.push(file);
  }
  files.sort();

  const allSections: RawMarkdownSection[] = [];
  for (const file of files) {
    const content = await readFile(file, "utf-8");
    const sections = collectSectionsFromFile(file, content);
    allSections.push(...sections);
  }

  return allSections;
}

// Exported for testing
export {
  isAuxiliaryByHeading as _isAuxiliaryByHeading,
  makePreviewText as _makePreviewText,
  collectSectionsFromFile as _collectSectionsFromFile,
  isTopLevelHeading as _isTopLevelHeading,
};
