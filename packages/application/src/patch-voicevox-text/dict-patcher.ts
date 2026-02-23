import type { DictionaryCandidate, ForceReading } from "@narrative-vox/domain/types.ts";

export function patchDictionaryCandidates(
  candidates: DictionaryCandidate[],
  forceReadings: ForceReading[],
  suppressSurfaces: string[],
): { candidates: DictionaryCandidate[]; addedCount: number; removedCount: number } {
  const suppressSet = new Set(suppressSurfaces);

  const afterSuppress = candidates.filter(
    (candidate) => !suppressSet.has(candidate.surface),
  );
  const removedCount = candidates.length - afterSuppress.length;

  const existingSurfaces = new Map(
    afterSuppress.map((candidate) => [candidate.surface, candidate]),
  );

  let addedCount = 0;
  for (const forceReading of forceReadings) {
    if (existingSurfaces.has(forceReading.surface)) {
      const existing = existingSurfaces.get(forceReading.surface)!;
      existingSurfaces.set(forceReading.surface, {
        ...existing,
        reading_or_empty: forceReading.reading,
        priority: forceReading.priority,
        note: forceReading.note ?? "force_patch",
      });
    } else {
      existingSurfaces.set(forceReading.surface, {
        surface: forceReading.surface,
        reading_or_empty: forceReading.reading,
        priority: forceReading.priority,
        occurrences: 1,
        source: "force_patch",
        note: forceReading.note ?? "force_patch",
      });
      addedCount++;
    }
  }

  return {
    candidates: Array.from(existingSurfaces.values()),
    addedCount,
    removedCount,
  };
}
