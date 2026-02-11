import { mkdir, writeFile } from "node:fs/promises";
import type { DictionaryCandidate, Stage4Data } from "../../shared/types.ts";

export type Stage4Paths = {
  stage4Dir: string;
  stage4DictDir: string;
  stage4JsonPath: string;
  stage4TxtPath: string;
  dictCsvPath: string;
};

function makeCsv(candidates: DictionaryCandidate[]): string {
  const header = ["surface", "reading", "priority", "occurrences", "source", "note"];
  const rows = candidates.map((item) => [
    item.surface,
    item.reading_or_empty,
    item.priority,
    String(item.occurrences),
    item.source,
    item.note || ""
  ]);

  return [header, ...rows]
    .map((columns) =>
      columns
        .map((value) => {
          const escaped = String(value).replaceAll('"', '""');
          return `"${escaped}"`;
        })
        .join(",")
    )
    .join("\n");
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
  await writeFile(paths.dictCsvPath, `${makeCsv(stage4Data.dictionary_candidates)}\n`, "utf-8");
}
