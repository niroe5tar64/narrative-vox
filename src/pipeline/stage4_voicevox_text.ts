import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateAgainstSchema } from "../quality/schema_validator.ts";
import { SECTION_RE, TOTAL_TIME_RE } from "../shared/script_patterns.ts";
import type { Stage4Data, Stage4Utterance } from "../shared/types.ts";
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
import { writeStage4Artifacts, Stage4Paths } from "./stage4/io.ts";
import { resolveRunMetadata } from "./stage4/run_metadata.ts";

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

const SpeakabilityWarningConfig = {
  scoreThreshold: 70,
  minTerminalPunctuationRatio: 0.65,
  maxLongUtteranceRatio: 0.25
} as const;

function formatPercentage(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
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

export async function runStage4({
  scriptPath,
  runDir,
  projectId,
  runId,
  episodeId
}: RunStage4Options): Promise<RunStage4Result> {
  const metadata = resolveRunMetadata({
    scriptPath,
    runDir,
    projectId,
    runId,
    episodeId
  });
  const {
    resolvedScriptPath,
    runDir: resolvedRunDir,
    projectId: finalProjectId,
    runId: finalRunId,
    episodeId: finalEpisodeId,
    stage4Dir,
    stage4DictDir,
    stage4JsonPath,
    stage4TxtPath,
    dictCsvPath
  } = metadata;

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
  if (speakability.score < SpeakabilityWarningConfig.scoreThreshold) {
    warnings.push(
      `Speakability score is low (${speakability.score}/100). Consider shorter utterances and clearer sentence endings.`
    );
  }
  if (speakability.terminal_punctuation_ratio < SpeakabilityWarningConfig.minTerminalPunctuationRatio) {
    warnings.push(
      `Terminal punctuation is infrequent (${formatPercentage(
        speakability.terminal_punctuation_ratio
      )}). Aim for clearer sentence endings (。！？).`
    );
  }
  if (speakability.long_utterance_ratio > SpeakabilityWarningConfig.maxLongUtteranceRatio) {
    warnings.push(
      `Long utterance ratio is high (${formatPercentage(
        speakability.long_utterance_ratio
      )}). Split longer lines into tighter sentences.`
    );
  }

  const stage4Data: Stage4Data = {
    schema_version: "1.0",
    meta: {
      project_id: finalProjectId,
      run_id: finalRunId,
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

  const paths: Stage4Paths = {
    stage4Dir,
    stage4DictDir,
    stage4JsonPath,
    stage4TxtPath,
    dictCsvPath
  };
  await writeStage4Artifacts(paths, stage4Data);

  return {
    stage4JsonPath,
    stage4TxtPath,
    dictCsvPath,
    utteranceCount: utterances.length,
    dictionaryCount: dictionaryCandidates.length,
    episodeId: finalEpisodeId
  };
}
