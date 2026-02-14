import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateAgainstSchema } from "../quality/schema_validator.ts";
import { parseSectionHeader, isTotalTimeLine } from "../shared/script_structure.ts";
import { SchemaPaths } from "../shared/schema_paths.ts";
import type { VoicevoxTextData, VoicevoxTextQualityChecks, VoicevoxTextUtterance } from "../shared/types.ts";
import {
  splitIntoSentences,
  decidePauseLengthMs,
  evaluateSpeakability,
  normalizeScriptLine
} from "./build_text/text_processing.ts";
import {
  loadStage4TextConfig,
  normalizeStage4TextConfig,
  type Stage4TextConfig
} from "./build_text/stage4_text_config.ts";
import {
  collectRubyCandidates,
  collectTermCandidates,
  collectTermCandidatesWithMorphology,
  getJapaneseMorphTokenizer,
  inferReadingFromSurface,
  priorityForCandidate,
  toDictionaryCandidates,
  TermCandidateMap
} from "./build_text/dictionary.ts";
import { writeBuildTextArtifacts, BuildTextArtifactPaths } from "./build_text/artifact_writer.ts";
import { resolveBuildTextOutputPaths } from "./build_text/output_paths.ts";

export {
  collectRubyCandidates,
  collectTermCandidates,
  collectTermCandidatesWithMorphology,
  inferReadingFromSurface,
  priorityForCandidate,
  toDictionaryCandidates
} from "./build_text/dictionary.ts";

export {
  splitIntoSentences,
  decidePauseLengthMs,
  evaluateSpeakability,
  normalizeScriptLine
} from "./build_text/text_processing.ts";

const RUBY_RE = /\{([^|{}]+)\|([^{}]+)\}/g;
const phase5GuidanceRelativePath = "docs/phase5-speakability-guidance.md";

function formatPercentage(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
interface BuildTextOptions {
  scriptPath: string;
  runDir?: string;
  projectId?: string;
  runId?: string;
  episodeId?: string;
  stage4ConfigPath?: string;
}

interface BuildTextResult {
  voicevoxTextJsonPath: string;
  voicevoxTextPath: string;
  dictionaryCsvPath: string;
  utteranceCount: number;
  dictionaryCount: number;
  episodeId: string;
}

function toUtteranceId(index: number): string {
  return `U${String(index + 1).padStart(3, "0")}`;
}

function toRunRelativePath(runDir: string, targetPath: string): string {
  const relativePath = path.relative(runDir, targetPath);
  return relativePath.split(path.sep).join("/");
}

export function replaceRubyWithReading(text: string): string {
  return text.replace(RUBY_RE, (_matched, _surface, reading: string) => reading);
}

function buildUtterancesAndCandidates(
  source: string,
  morphTokenizer: Awaited<ReturnType<typeof getJapaneseMorphTokenizer>>,
  stage4TextConfig: Stage4TextConfig
): { utterances: VoicevoxTextUtterance[]; dictionaryCandidates: ReturnType<typeof toDictionaryCandidates> } {
  const lines = source.split(/\r?\n/);
  const termCandidates: TermCandidateMap = new Map();
  const utterances: VoicevoxTextUtterance[] = [];
  let currentSectionId = 0;
  let currentSectionTitle = "";

  for (const rawLine of lines) {
    const sectionHeader = parseSectionHeader(rawLine);
    if (sectionHeader) {
      currentSectionId = sectionHeader.id;
      currentSectionTitle = sectionHeader.title;
      continue;
    }

    if (isTotalTimeLine(rawLine)) {
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
      utterances.push({
        utterance_id: toUtteranceId(utterances.length),
        section_id: currentSectionId,
        section_title: currentSectionTitle,
        text: sentence,
        pause_length_ms: decidePauseLengthMs(sentence, {
          isTerminalInSourceLine: sentenceIndex === sentences.length - 1
        }, stage4TextConfig.pause)
      });
    }
  }

  return {
    utterances,
    dictionaryCandidates: toDictionaryCandidates(termCandidates)
  };
}

function buildQualityChecks(
  source: string,
  utterances: VoicevoxTextUtterance[],
  stage4TextConfig: Stage4TextConfig
): VoicevoxTextQualityChecks {
  const maxChars = Math.max(...utterances.map((entry) => entry.text.length));
  const hasRuby = /\{[^|{}]+\|[^{}]+\}/.test(source);
  const speakability = evaluateSpeakability(utterances, stage4TextConfig.speakability.scoring);
  const warningThresholds = stage4TextConfig.speakability.warningThresholds;
  const warnings: string[] = [];

  if (maxChars > 80) {
    warnings.push("Some utterances exceed 80 chars. Consider additional sentence split.");
  }
  if (speakability.score < warningThresholds.scoreThreshold) {
    warnings.push(
      `Speakability score is low (score=${speakability.score}/100, threshold=${warningThresholds.scoreThreshold}). Refer to ${phase5GuidanceRelativePath} to correlate with SpeakabilityWarningConfig.scoreThreshold guidance.`
    );
  }
  if (speakability.terminal_punctuation_ratio < warningThresholds.minTerminalPunctuationRatio) {
    warnings.push(
      `Terminal punctuation is infrequent (${formatPercentage(
        speakability.terminal_punctuation_ratio
      )}, threshold=${warningThresholds.minTerminalPunctuationRatio}). Add clearer sentence endings and see ${phase5GuidanceRelativePath} for SpeakabilityWarningConfig.minTerminalPunctuationRatio context.`
    );
  }
  if (speakability.long_utterance_ratio > warningThresholds.maxLongUtteranceRatio) {
    warnings.push(
      `Long utterance ratio is high (${formatPercentage(
        speakability.long_utterance_ratio
      )}, threshold=${warningThresholds.maxLongUtteranceRatio}). Split longer lines and consult ${phase5GuidanceRelativePath} for SpeakabilityWarningConfig.maxLongUtteranceRatio guidance.`
    );
  }

  return {
    utterance_count: utterances.length,
    max_chars_per_utterance: maxChars,
    has_ruby_notation: hasRuby,
    speakability,
    warnings
  };
}

function buildVoicevoxTextData(params: {
  finalProjectId: string;
  finalRunId: string;
  finalEpisodeId: string;
  resolvedRunDir: string;
  resolvedScriptPath: string;
  utterances: VoicevoxTextUtterance[];
  dictionaryCandidates: ReturnType<typeof toDictionaryCandidates>;
  source: string;
  stage4TextConfig: Stage4TextConfig;
}): VoicevoxTextData {
  const qualityChecks = buildQualityChecks(params.source, params.utterances, params.stage4TextConfig);
  return {
    schema_version: "1.0",
    meta: {
      project_id: params.finalProjectId,
      run_id: params.finalRunId,
      episode_id: params.finalEpisodeId,
      source_script_path: toRunRelativePath(params.resolvedRunDir, params.resolvedScriptPath),
      generated_at: new Date().toISOString()
    },
    utterances: params.utterances,
    dictionary_candidates: params.dictionaryCandidates,
    quality_checks: qualityChecks
  };
}

export async function buildText({
  scriptPath,
  runDir,
  projectId,
  runId,
  episodeId,
  stage4ConfigPath
}: BuildTextOptions): Promise<BuildTextResult> {
  const metadata = resolveBuildTextOutputPaths({
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
    voicevoxTextDir,
    dictionaryDir,
    voicevoxTextJsonPath,
    voicevoxTextPath,
    dictionaryCsvPath
  } = metadata;

  const source = await readFile(resolvedScriptPath, "utf-8");
  const morphTokenizer = await getJapaneseMorphTokenizer();
  const stage4TextConfig = stage4ConfigPath
    ? await loadStage4TextConfig(stage4ConfigPath)
    : normalizeStage4TextConfig();
  const { utterances, dictionaryCandidates } = buildUtterancesAndCandidates(
    source,
    morphTokenizer,
    stage4TextConfig
  );

  if (utterances.length === 0) {
    throw new Error("No utterances generated from script. Check script format.");
  }

  const voicevoxTextData = buildVoicevoxTextData({
    finalProjectId,
    finalRunId,
    finalEpisodeId,
    resolvedRunDir,
    resolvedScriptPath,
    utterances,
    dictionaryCandidates,
    source,
    stage4TextConfig
  });

  await validateAgainstSchema(voicevoxTextData, SchemaPaths.voicevoxText);

  const paths: BuildTextArtifactPaths = {
    voicevoxTextDir,
    dictionaryDir,
    voicevoxTextJsonPath,
    voicevoxTextPath,
    dictionaryCsvPath
  };
  await writeBuildTextArtifacts(paths, voicevoxTextData);

  return {
    voicevoxTextJsonPath,
    voicevoxTextPath,
    dictionaryCsvPath,
    utteranceCount: utterances.length,
    dictionaryCount: dictionaryCandidates.length,
    episodeId: finalEpisodeId
  };
}
