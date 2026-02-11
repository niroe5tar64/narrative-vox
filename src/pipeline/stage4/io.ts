import { mkdir, writeFile } from "node:fs/promises";
import { DictionaryCsvField } from "./dictionary.ts";
import type { DictionaryCandidate, Stage4Data } from "../../shared/types.ts";

export type Stage4Paths = {
  stage4Dir: string;
  stage4DictDir: string;
  stage4JsonPath: string;
  stage4TxtPath: string;
  dictCsvPath: string;
};

/**
 * Dictionary CSV layout and quoting rules for Stage4 artifacts.
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

export async function writeStage4Artifacts(paths: Stage4Paths, stage4Data: Stage4Data): Promise<void> {
  await mkdir(paths.stage4Dir, { recursive: true });
  await mkdir(paths.stage4DictDir, { recursive: true });

  await writeFile(paths.stage4JsonPath, `${JSON.stringify(stage4Data, null, 2)}\n`, "utf-8");
  await writeFile(
    paths.stage4TxtPath,
    `${stage4Data.utterances.map((entry) => entry.text).join("\n")}\n`,
    "utf-8"
  );
  await writeFile(
    paths.dictCsvPath,
    `${buildDictionaryCsv(stage4Data.dictionary_candidates)}\n`,
    "utf-8"
  );
}
