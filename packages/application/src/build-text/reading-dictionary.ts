import path from "node:path";
import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";

export interface ReadingDictionaryEntry {
  surface: string;
  reading: string;
}

export interface ReadingDictionary {
  version: number;
  entries: ReadingDictionaryEntry[];
}

export async function loadReadingDictionary(filePath: string): Promise<ReadingDictionary> {
  const resolvedPath = path.resolve(filePath);
  try {
    return await loadJson<ReadingDictionary>(resolvedPath, SchemaPaths.readingDictionary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load reading dictionary (${resolvedPath}): ${message}`);
  }
}

export function applyReadingDictionary(text: string, dictionary: ReadingDictionary): string {
  const sortedEntries = [...dictionary.entries].sort(
    (left, right) => right.surface.length - left.surface.length
  );

  let applied = text;
  for (const entry of sortedEntries) {
    applied = applied.replaceAll(entry.surface, entry.reading);
  }
  return applied;
}
