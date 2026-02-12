import { mkdir, writeFile } from "node:fs/promises";
import { DictionaryCsvField } from "./dictionary.ts";
import type { DictionaryCandidate, VoicevoxTextData } from "../../shared/types.ts";

export type BuildTextArtifactPaths = {
  voicevoxTextDir: string;
  dictionaryDir: string;
  voicevoxTextJsonPath: string;
  voicevoxTextPath: string;
  dictionaryCsvPath: string;
};

/**
 * Dictionary CSV layout and quoting rules for build-text artifacts.
 */
const DictionaryCsvConfig = {
  delimiter: ",",
  quoteChar: '"',
  headers: [
    DictionaryCsvField.surface,
    DictionaryCsvField.reading,
    DictionaryCsvField.priority,
    DictionaryCsvField.occurrences,
    DictionaryCsvField.source,
    DictionaryCsvField.note
  ]
} as const;

const dictionaryCsvAccessors: Record<
  DictionaryCsvField,
  (candidate: DictionaryCandidate) => string
> = {
  [DictionaryCsvField.surface]: (candidate) => candidate.surface,
  [DictionaryCsvField.reading]: (candidate) => candidate.reading_or_empty,
  [DictionaryCsvField.priority]: (candidate) => candidate.priority,
  [DictionaryCsvField.occurrences]: (candidate) => String(candidate.occurrences),
  [DictionaryCsvField.source]: (candidate) => candidate.source,
  [DictionaryCsvField.note]: (candidate) => candidate.note || ""
};

function escapeCsvValue(value: string): string {
  const escaped = String(value).replaceAll(
    DictionaryCsvConfig.quoteChar,
    DictionaryCsvConfig.quoteChar + DictionaryCsvConfig.quoteChar
  );
  return `${DictionaryCsvConfig.quoteChar}${escaped}${DictionaryCsvConfig.quoteChar}`;
}

function buildDictionaryCsv(candidates: DictionaryCandidate[]): string {
  const headerRow = DictionaryCsvConfig.headers
    .map((field) => escapeCsvValue(field))
    .join(DictionaryCsvConfig.delimiter);

  const rows = candidates.map((candidate) =>
    DictionaryCsvConfig.headers
      .map((field) => escapeCsvValue(dictionaryCsvAccessors[field](candidate)))
      .join(DictionaryCsvConfig.delimiter)
  );

  return [headerRow, ...rows].join("\n");
}

export async function writeBuildTextArtifacts(paths: BuildTextArtifactPaths, voicevoxTextData: VoicevoxTextData): Promise<void> {
  await mkdir(paths.voicevoxTextDir, { recursive: true });
  await mkdir(paths.dictionaryDir, { recursive: true });

  await writeFile(paths.voicevoxTextJsonPath, `${JSON.stringify(voicevoxTextData, null, 2)}\n`, "utf-8");
  await writeFile(
    paths.voicevoxTextPath,
    `${voicevoxTextData.utterances.map((entry) => entry.text).join("\n")}\n`,
    "utf-8"
  );
  await writeFile(
    paths.dictionaryCsvPath,
    `${buildDictionaryCsv(voicevoxTextData.dictionary_candidates)}\n`,
    "utf-8"
  );
}
