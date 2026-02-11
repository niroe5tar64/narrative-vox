import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateAgainstSchema } from "../quality/schema_validator.ts";
import { resolveRunId, inferProjectIdFromRunDir } from "../shared/run_id.ts";
import { SECTION_RE, TOTAL_TIME_RE } from "../shared/script_patterns.ts";
import type { DictionaryCandidate, Stage4Data, Stage4Utterance } from "../shared/types.ts";
import {
  splitIntoSentences,
  decidePauseLengthMs,
  evaluateSpeakability,
  normalizeScriptLine
} from "./stage4/text_processing.ts";
import {
  collectRubyCandidates,
  collectTermCandidates,
  collectTermCandidatesWithMorphology,
  getJapaneseMorphTokenizer,
  inferReadingFromSurface,
  priorityForCandidate,
  toDictionaryCandidates,
  TermCandidateMap
} from "./stage4/dictionary.ts";

export {
  collectRubyCandidates,
  collectTermCandidates,
  collectTermCandidatesWithMorphology,
  inferReadingFromSurface,
  priorityForCandidate,
  toDictionaryCandidates
} from "./stage4/dictionary.ts";

export {
  splitIntoSentences,
  decidePauseLengthMs,
  evaluateSpeakability,
  normalizeScriptLine
} from "./stage4/text_processing.ts";

const RUBY_RE = /\{([^|{}]+)\|([^{}]+)\}/g;
interface RunStage4Options {
  scriptPath: string;
  runDir?: string;
  projectId?: string;
  runId?: string;
  episodeId?: string;
}

interface RunStage4Result {
  stage4JsonPath: string;
  stage4TxtPath: string;
  dictCsvPath: string;
  utteranceCount: number;
  dictionaryCount: number;
  episodeId: string;
}

function toUtteranceId(index: number): string {
  return `U${String(index + 1).padStart(3, "0")}`;
}

export function replaceRubyWithReading(text: string): string {
  return text.replace(RUBY_RE, (_matched, _surface, reading: string) => reading);
}

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

function inferEpisodeId(scriptPath: string, explicitEpisodeId?: string): string {
  if (explicitEpisodeId) {
    return explicitEpisodeId;
  }
  const base = path.basename(scriptPath);
  const match = base.match(/(E[0-9]{2})/);
  if (!match) {
    throw new Error("Could not infer episode_id from script path. Pass --episode-id E##.");
  }
  return match[1];
}

function inferProjectAndRun(
  runDir: string,
  explicitProjectId?: string,
  explicitRunId?: string
): { projectId: string; runId: string } {
  const runId = resolveRunId(runDir, explicitRunId);
  const projectId = explicitProjectId || inferProjectIdFromRunDir(runDir);
  return { projectId, runId };
}

function inferRunDirFromScriptPath(scriptPath: string): string | undefined {
  const stageDir = path.dirname(path.resolve(scriptPath));
  if (path.basename(stageDir) !== "stage3") {
    return undefined;
  }
  return path.dirname(stageDir);
}

export async function runStage4({
  scriptPath,
  runDir,
  projectId,
  runId,
  episodeId
}: RunStage4Options): Promise<RunStage4Result> {
  const resolvedScriptPath = path.resolve(scriptPath);
  const inferredRunDir = runDir ? path.resolve(runDir) : inferRunDirFromScriptPath(resolvedScriptPath);
  if (!inferredRunDir) {
    throw new Error(
      "Could not infer run directory from --script path. Pass --run-dir explicitly."
    );
  }
  const resolvedRunDir = inferredRunDir;
  const finalEpisodeId = inferEpisodeId(resolvedScriptPath, episodeId);
  const ids = inferProjectAndRun(resolvedRunDir, projectId, runId);

  const source = await readFile(resolvedScriptPath, "utf-8");
  const lines = source.split(/\r?\n/);
  const morphTokenizer = await getJapaneseMorphTokenizer();

  const termCandidates: TermCandidateMap = new Map();
  const utterances: Stage4Utterance[] = [];

  let currentSectionId = 0;
  let currentSectionTitle = "";

  for (const rawLine of lines) {
    const sectionMatch = rawLine.match(SECTION_RE);
    if (sectionMatch) {
      currentSectionId = Number(sectionMatch[1]);
      currentSectionTitle = sectionMatch[2].trim();
      continue;
    }

    if (TOTAL_TIME_RE.test(rawLine)) {
      continue;
    }

    const normalized = normalizeScriptLine(rawLine);
    if (!normalized) {
      continue;
    }

    if (currentSectionId < 1 || currentSectionId > 8) {
      continue;
    }

    collectRubyCandidates(normalized, termCandidates);
    const withoutRuby = replaceRubyWithReading(normalized);
    const sentences = splitIntoSentences(withoutRuby);

    for (const [sentenceIndex, sentence] of sentences.entries()) {
      collectTermCandidatesWithMorphology(sentence, termCandidates, morphTokenizer);
      const pauseLengthMs = decidePauseLengthMs(sentence, {
        isTerminalInSourceLine: sentenceIndex === sentences.length - 1
      });
      utterances.push({
        utterance_id: toUtteranceId(utterances.length),
        section_id: currentSectionId,
        section_title: currentSectionTitle,
        text: sentence,
        pause_length_ms: pauseLengthMs
      });
    }
  }

  if (utterances.length === 0) {
    throw new Error("No utterances generated from script. Check script format.");
  }

  const dictionaryCandidates = toDictionaryCandidates(termCandidates);

  const maxChars = Math.max(...utterances.map((entry) => entry.text.length));
  const hasRuby = /\{[^|{}]+\|[^{}]+\}/.test(source);
  const speakability = evaluateSpeakability(utterances);
  const warnings: string[] = [];

  if (maxChars > 80) {
    warnings.push("Some utterances exceed 80 chars. Consider additional sentence split.");
  }
  if (speakability.score < 70) {
    warnings.push(
      `Speakability score is low (${speakability.score}/100). Consider shorter utterances and clearer sentence endings.`
    );
  }

  const stage4Data: Stage4Data = {
    schema_version: "1.0",
    meta: {
      project_id: ids.projectId,
      run_id: ids.runId,
      episode_id: finalEpisodeId,
      source_script_path: path.relative(process.cwd(), resolvedScriptPath),
      generated_at: new Date().toISOString()
    },
    utterances,
    dictionary_candidates: dictionaryCandidates,
    quality_checks: {
      utterance_count: utterances.length,
      max_chars_per_utterance: maxChars,
      has_ruby_notation: hasRuby,
      speakability,
      warnings
    }
  };

  await validateAgainstSchema(
    stage4Data,
    path.resolve(process.cwd(), "schemas/stage4.voicevox-text.schema.json")
  );

  const stage4Dir = path.join(resolvedRunDir, "stage4");
  const stage4DictDir = path.join(resolvedRunDir, "stage4_dict");
  await mkdir(stage4Dir, { recursive: true });
  await mkdir(stage4DictDir, { recursive: true });

  const stage4JsonPath = path.join(stage4Dir, `${finalEpisodeId}_voicevox_text.json`);
  const stage4TxtPath = path.join(stage4Dir, `${finalEpisodeId}_voicevox.txt`);
  const dictCsvPath = path.join(stage4DictDir, `${finalEpisodeId}_dict_candidates.csv`);

  await writeFile(stage4JsonPath, `${JSON.stringify(stage4Data, null, 2)}\n`, "utf-8");
  await writeFile(stage4TxtPath, `${utterances.map((entry) => entry.text).join("\n")}\n`, "utf-8");
  await writeFile(dictCsvPath, `${makeCsv(dictionaryCandidates)}\n`, "utf-8");

  return {
    stage4JsonPath,
    stage4TxtPath,
    dictCsvPath,
    utteranceCount: utterances.length,
    dictionaryCount: dictionaryCandidates.length,
    episodeId: finalEpisodeId
  };
}
