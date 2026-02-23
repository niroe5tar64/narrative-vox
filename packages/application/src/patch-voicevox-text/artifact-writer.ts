import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { DictionaryCandidate, VoicevoxTextData } from "@narrative-vox/domain/types.ts";

const CSV_DELIMITER = ",";
const CSV_QUOTE = '"';

const CSV_HEADERS = [
  "surface",
  "reading",
  "priority",
  "occurrences",
  "source",
  "note",
] as const;

type CsvHeader = (typeof CSV_HEADERS)[number];

const csvAccessors: Record<CsvHeader, (candidate: DictionaryCandidate) => string> = {
  surface: (candidate) => candidate.surface,
  reading: (candidate) => candidate.reading_or_empty,
  priority: (candidate) => candidate.priority,
  occurrences: (candidate) => String(candidate.occurrences),
  source: (candidate) => candidate.source,
  note: (candidate) => candidate.note || "",
};

function escapeCsvValue(value: string): string {
  const escaped = String(value).replaceAll(CSV_QUOTE, CSV_QUOTE + CSV_QUOTE);
  return `${CSV_QUOTE}${escaped}${CSV_QUOTE}`;
}

function buildDictionaryCsv(candidates: DictionaryCandidate[]): string {
  const headerRow = CSV_HEADERS.map((header) => escapeCsvValue(header)).join(CSV_DELIMITER);
  const rows = candidates.map((candidate) =>
    CSV_HEADERS.map((header) => escapeCsvValue(csvAccessors[header](candidate))).join(
      CSV_DELIMITER,
    ),
  );
  return [headerRow, ...rows].join("\n");
}

function insertPatchedStem(filePath: string): string {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const extIndex = base.indexOf(".");
  if (extIndex === -1) {
    return path.join(dir, `${base}.patched`);
  }
  const stem = base.slice(0, extIndex);
  const ext = base.slice(extIndex);
  return path.join(dir, `${stem}.patched${ext}`);
}

export async function writePatchedArtifacts(options: {
  patchedData: VoicevoxTextData;
  voicevoxTextJsonPath: string;
  dictionaryCsvPath: string;
}): Promise<{ patchedJsonPath: string; patchedCsvPath: string }> {
  const patchedJsonPath = insertPatchedStem(options.voicevoxTextJsonPath);
  const patchedCsvPath = insertPatchedStem(options.dictionaryCsvPath);

  await writeFile(
    patchedJsonPath,
    `${JSON.stringify(options.patchedData, null, 2)}\n`,
    "utf-8",
  );

  await writeFile(
    patchedCsvPath,
    `${buildDictionaryCsv(options.patchedData.dictionary_candidates)}\n`,
    "utf-8",
  );

  return { patchedJsonPath, patchedCsvPath };
}
