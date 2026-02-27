import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseSectionHeader } from "@narrative-vox/domain/script-structure.ts";
import {
  hasSpeakerTagPrefix,
  parseSpeakerTag,
} from "@narrative-vox/domain/speaker-tag.ts";
import type {
  VoicevoxTextData,
  VoicevoxTextQualityChecks,
  VoicevoxTextUtterance,
} from "@narrative-vox/domain/types.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import { validateAgainstSchema } from "@narrative-vox/infrastructure/schema-validator.ts";
import {
  type BuildTextArtifactPaths,
  writeBuildTextArtifacts,
} from "./build-text/artifact-writer.ts";
import {
  type BuildTextConfig,
  loadBuildTextConfig,
  normalizeBuildTextConfig,
} from "./build-text/build-text-config.ts";
import {
  collectRubyCandidates,
  collectTermCandidatesWithMorphology,
  getJapaneseMorphTokenizer,
  type TermCandidateMap,
  toDictionaryCandidates,
} from "./build-text/dictionary.ts";
import { resolveBuildTextOutputPaths } from "./build-text/output-paths.ts";
import {
  decidePauseLengthMs,
  evaluateSpeakability,
  normalizeScriptLine,
  splitIntoSentences,
} from "./build-text/text-processing.ts";

export {
  collectRubyCandidates,
  collectTermCandidates,
  collectTermCandidatesWithMorphology,
  inferReadingFromSurface,
  priorityForCandidate,
  toDictionaryCandidates,
} from "./build-text/dictionary.ts";
export {
  decidePauseLengthMs,
  evaluateSpeakability,
  normalizeScriptLine,
  splitIntoSentences,
} from "./build-text/text-processing.ts";

const RUBY_RE = /\{([^|{}]+)\|([^{}]+)\}/g;
const speakabilityChecklistPath =
  "docs/architecture/build-text-speakability-checklist.md";

function formatPercentage(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}
interface BuildTextOptions {
  scriptPath: string;
  runDir?: string;
  projectId?: string;
  runId?: string;
  episodeId?: string;
  buildTextConfigPath?: string;
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
  return text.replace(
    RUBY_RE,
    (_matched, _surface, reading: string) => reading,
  );
}

function extractSpeakerTag(rawLine: string): {
  speakerKey?: string;
  content: string;
} {
  const speakerTag = parseSpeakerTag(rawLine);
  if (speakerTag) {
    return {
      speakerKey: speakerTag.speakerKey,
      content: rawLine.slice(speakerTag.tagLength),
    };
  }

  if (hasSpeakerTagPrefix(rawLine)) {
    throw new Error(
      `Invalid speaker tag format: "${rawLine.trim()}". Expected: [speaker:<key>] at line start.`,
    );
  }

  return { content: rawLine };
}

function buildUtterancesAndCandidates(
  source: string,
  morphTokenizer: Awaited<ReturnType<typeof getJapaneseMorphTokenizer>>,
  buildTextConfig: BuildTextConfig,
): {
  utterances: VoicevoxTextUtterance[];
  dictionaryCandidates: ReturnType<typeof toDictionaryCandidates>;
} {
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

    const { speakerKey, content } = extractSpeakerTag(rawLine);
    const normalized = normalizeScriptLine(content);
    if (!normalized) {
      continue;
    }
    if (currentSectionId < 1) {
      continue;
    }
    collectRubyCandidates(normalized, termCandidates);
    const withoutRuby = replaceRubyWithReading(normalized);
    const sentences = splitIntoSentences(withoutRuby);
    for (const [sentenceIndex, sentence] of sentences.entries()) {
      collectTermCandidatesWithMorphology(
        sentence,
        termCandidates,
        morphTokenizer,
      );
      utterances.push({
        utterance_id: toUtteranceId(utterances.length),
        section_id: currentSectionId,
        section_title: currentSectionTitle,
        ...(speakerKey ? { speaker_key: speakerKey } : {}),
        text: sentence,
        pause_length_ms: decidePauseLengthMs(
          sentence,
          {
            isTerminalInSourceLine: sentenceIndex === sentences.length - 1,
          },
          buildTextConfig.pause,
        ),
      });
    }
  }

  return {
    utterances,
    dictionaryCandidates: toDictionaryCandidates(termCandidates),
  };
}

function buildQualityChecks(
  source: string,
  utterances: VoicevoxTextUtterance[],
  buildTextConfig: BuildTextConfig,
): VoicevoxTextQualityChecks {
  const maxChars = Math.max(...utterances.map((entry) => entry.text.length));
  const hasRuby = /\{[^|{}]+\|[^{}]+\}/.test(source);
  const speakability = evaluateSpeakability(
    utterances,
    buildTextConfig.speakability.scoring,
  );
  const warningThresholds = buildTextConfig.speakability.warningThresholds;
  const warnings: string[] = [];
  const utteranceIdsWithoutTerminalPunctuation = utterances
    .filter((utterance) => !/[。！？!?]$/.test(utterance.text.trim()))
    .map((utterance) => utterance.utterance_id);

  if (maxChars > 80) {
    warnings.push(
      "Some utterances exceed 80 chars. Consider additional sentence split.",
    );
  }
  if (speakability.score < warningThresholds.scoreThreshold) {
    warnings.push(
      `Speakability score is low (score=${speakability.score}/100, threshold=${warningThresholds.scoreThreshold}). Refer to ${speakabilityChecklistPath} for SpeakabilityWarningConfig.scoreThreshold guidance.`,
    );
  }
  if (
    speakability.terminal_punctuation_ratio <
    warningThresholds.minTerminalPunctuationRatio
  ) {
    warnings.push(
      `Terminal punctuation is infrequent (${formatPercentage(
        speakability.terminal_punctuation_ratio,
      )}, threshold=${warningThresholds.minTerminalPunctuationRatio}). Add clearer sentence endings. See ${speakabilityChecklistPath} for SpeakabilityWarningConfig.minTerminalPunctuationRatio guidance.`,
    );
    if (utteranceIdsWithoutTerminalPunctuation.length > 0) {
      warnings.push(
        `no terminal punctuation: ${utteranceIdsWithoutTerminalPunctuation.join(", ")}`,
      );
    }
  }
  if (
    speakability.long_utterance_ratio > warningThresholds.maxLongUtteranceRatio
  ) {
    warnings.push(
      `Long utterance ratio is high (${formatPercentage(
        speakability.long_utterance_ratio,
      )}, threshold=${warningThresholds.maxLongUtteranceRatio}). Split longer lines. See ${speakabilityChecklistPath} for SpeakabilityWarningConfig.maxLongUtteranceRatio guidance.`,
    );
  }
  return {
    utterance_count: utterances.length,
    max_chars_per_utterance: maxChars,
    has_ruby_notation: hasRuby,
    speakability,
    warnings,
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
  buildTextConfig: BuildTextConfig;
}): VoicevoxTextData {
  const qualityChecks = buildQualityChecks(
    params.source,
    params.utterances,
    params.buildTextConfig,
  );
  return {
    schema_version: "1.0",
    meta: {
      project_id: params.finalProjectId,
      run_id: params.finalRunId,
      episode_id: params.finalEpisodeId,
      source_script_path: toRunRelativePath(
        params.resolvedRunDir,
        params.resolvedScriptPath,
      ),
      generated_at: new Date().toISOString(),
    },
    utterances: params.utterances,
    dictionary_candidates: params.dictionaryCandidates,
    quality_checks: qualityChecks,
  };
}

export async function buildText({
  scriptPath,
  runDir,
  projectId,
  runId,
  episodeId,
  buildTextConfigPath,
}: BuildTextOptions): Promise<BuildTextResult> {
  const metadata = resolveBuildTextOutputPaths({
    scriptPath,
    runDir,
    projectId,
    runId,
    episodeId,
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
    dictionaryCsvPath,
  } = metadata;

  const source = await readFile(resolvedScriptPath, "utf-8");
  const morphTokenizer = await getJapaneseMorphTokenizer();
  const buildTextConfig = buildTextConfigPath
    ? await loadBuildTextConfig(buildTextConfigPath)
    : normalizeBuildTextConfig();
  const { utterances, dictionaryCandidates } = buildUtterancesAndCandidates(
    source,
    morphTokenizer,
    buildTextConfig,
  );

  if (utterances.length === 0) {
    throw new Error(
      "No utterances generated from script. Check script format.",
    );
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
    buildTextConfig,
  });

  await validateAgainstSchema(voicevoxTextData, SchemaPaths.voicevoxText);

  const paths: BuildTextArtifactPaths = {
    voicevoxTextDir,
    dictionaryDir,
    voicevoxTextJsonPath,
    voicevoxTextPath,
    dictionaryCsvPath,
  };
  await writeBuildTextArtifacts(paths, voicevoxTextData);

  return {
    voicevoxTextJsonPath,
    voicevoxTextPath,
    dictionaryCsvPath,
    utteranceCount: utterances.length,
    dictionaryCount: dictionaryCandidates.length,
    episodeId: finalEpisodeId,
  };
}
