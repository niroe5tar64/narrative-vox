import { SECTION_RE, TOTAL_TIME_RE } from "./script_patterns.ts";

export const REQUIRED_SECTION_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export interface SectionHeader {
  id: number;
  title: string;
}

export interface ScriptStructureSummary {
  sectionIds: number[];
  hasTotalTimeLine: boolean;
}

export interface RequiredStructureValidation {
  missingSectionIds: number[];
  hasTotalTimeLine: boolean;
}

export function parseSectionHeader(line: string): SectionHeader | null {
  const sectionMatch = line.match(SECTION_RE);
  if (!sectionMatch?.[1] || !sectionMatch[2]) {
    return null;
  }
  return {
    id: Number(sectionMatch[1]),
    title: sectionMatch[2].trim()
  };
}

export function isTotalTimeLine(line: string): boolean {
  return TOTAL_TIME_RE.test(line);
}

export function analyzeScriptStructure(scriptText: string): ScriptStructureSummary {
  const sectionIds = new Set<number>();
  let hasTotalTimeLine = false;

  for (const line of scriptText.split(/\r?\n/)) {
    const sectionHeader = parseSectionHeader(line);
    if (sectionHeader) {
      sectionIds.add(sectionHeader.id);
      continue;
    }
    if (isTotalTimeLine(line)) {
      hasTotalTimeLine = true;
    }
  }

  return {
    sectionIds: [...sectionIds].sort((a, b) => a - b),
    hasTotalTimeLine
  };
}

export function validateRequiredScriptStructure(scriptText: string): RequiredStructureValidation {
  const summary = analyzeScriptStructure(scriptText);
  return {
    hasTotalTimeLine: summary.hasTotalTimeLine,
    missingSectionIds: REQUIRED_SECTION_IDS.filter((id) => !summary.sectionIds.includes(id))
  };
}
