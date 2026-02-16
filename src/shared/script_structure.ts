import { SECTION_RE } from "./script_patterns.ts";

export const REQUIRED_SECTION_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export interface SectionHeader {
  id: number;
  title: string;
}

export interface ScriptStructureSummary {
  sectionIds: number[];
  sectionOrder: number[];
  duplicateSectionIds: number[];
}

export interface RequiredStructureValidation {
  missingSectionIds: number[];
  sectionOrder: number[];
  duplicateSectionIds: number[];
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

export function analyzeScriptStructure(scriptText: string): ScriptStructureSummary {
  const sectionIds = new Set<number>();
  const sectionOrder: number[] = [];
  const duplicateSectionIds = new Set<number>();

  for (const line of scriptText.split(/\r?\n/)) {
    const sectionHeader = parseSectionHeader(line);
    if (sectionHeader) {
      sectionOrder.push(sectionHeader.id);
      if (sectionIds.has(sectionHeader.id)) {
        duplicateSectionIds.add(sectionHeader.id);
      }
      sectionIds.add(sectionHeader.id);
      continue;
    }
  }

  return {
    sectionIds: [...sectionIds].sort((a, b) => a - b),
    sectionOrder,
    duplicateSectionIds: [...duplicateSectionIds].sort((a, b) => a - b)
  };
}

export function validateRequiredScriptStructure(scriptText: string): RequiredStructureValidation {
  const summary = analyzeScriptStructure(scriptText);
  return {
    missingSectionIds: REQUIRED_SECTION_IDS.filter((id) => !summary.sectionIds.includes(id)),
    sectionOrder: summary.sectionOrder,
    duplicateSectionIds: summary.duplicateSectionIds
  };
}
