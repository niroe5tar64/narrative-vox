import { SECTION_RE } from "./script-patterns.ts";

export interface SectionHeader {
	id: number;
	title: string;
}

export interface ScriptStructureSummary {
	sectionIds: number[];
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
		title: sectionMatch[2].trim(),
	};
}

export function analyzeScriptStructure(
	scriptText: string,
): ScriptStructureSummary {
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
		}
	}

	return {
		sectionIds: [...sectionIds].sort((a, b) => a - b),
		sectionOrder,
		duplicateSectionIds: [...duplicateSectionIds].sort((a, b) => a - b),
	};
}
