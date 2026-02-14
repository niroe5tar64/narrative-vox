import type { SpeakabilityMetrics, VoicevoxTextUtterance } from "../../shared/types.ts";

const SENTENCE_ENDING_RE = /([。！？!?])/g;
const CLAUSE_PUNCTUATION_RE = /[、，；;：:]/g;
const CONJUNCTION_BOUNDARY_RE =
  /(そして|しかし|ただし|ただ|また|なお|そのため|なので|ところが|一方で|つまり|まず|次に|最後に|ちなみに)/g;
const CONJUNCTION_PLAIN_RE =
  /(そして|しかし|ただし|ただ|また|なお|そのため|なので|ところが|一方で|つまり|まず|次に|最後に|ちなみに)/;
const STRONG_END_PUNCTUATION_RE = /[！？!?]$/;
const FULL_STOP_END_RE = /。$/;
const CLAUSE_END_RE = /[、，；;：:]/;
const DEFAULT_MAX_CHARS_PER_SENTENCE = 48;
const MIN_SPLITTABLE_CHARS = 8;
const SPLIT_POINT_TOLERANCE = 6;

export interface PauseConfigValues {
  minMs: number;
  maxMs: number;
  bases: {
    default: number;
    strongEnding: number;
    fullStop: number;
    clauseEnd: number;
  };
  lengthBonus: {
    step: number;
    increment: number;
    max: number;
  };
  penalties: {
    conjunction: number;
    continuation: number;
  };
}

export const PauseConfig: PauseConfigValues = {
  minMs: 120,
  maxMs: 520,
  bases: {
    default: 190,
    strongEnding: 360,
    fullStop: 320,
    clauseEnd: 240
  },
  lengthBonus: {
    step: 10,
    increment: 20,
    max: 120
  },
  penalties: {
    conjunction: 40,
    continuation: 50
  }
};

export interface SpeakabilityScoringConfig {
  targetAverageChars: number;
  averagePenaltyFactor: number;
  averagePenaltyMax: number;
  longRatioWeight: number;
  punctuationWeight: number;
}

export const SpeakabilityConfig: SpeakabilityScoringConfig = {
  targetAverageChars: 32,
  averagePenaltyFactor: 1.2,
  averagePenaltyMax: 35,
  longRatioWeight: 45,
  punctuationWeight: 20
};
function collectPreferredSplitPoints(text: string): number[] {
  const points = new Set<number>();

  for (const match of text.matchAll(CLAUSE_PUNCTUATION_RE)) {
    const afterPunctuation = (match.index ?? -1) + 1;
    if (afterPunctuation > 0 && afterPunctuation < text.length) {
      points.add(afterPunctuation);
    }
  }

  for (const match of text.matchAll(CONJUNCTION_BOUNDARY_RE)) {
    const beforeConjunction = match.index ?? -1;
    if (beforeConjunction > 0 && beforeConjunction < text.length) {
      points.add(beforeConjunction);
    }
  }

  return [...points]
    .filter(
      (point) => point >= MIN_SPLITTABLE_CHARS && text.length - point >= MIN_SPLITTABLE_CHARS
    )
    .sort((a, b) => a - b);
}

function chooseSplitPoint(text: string, maxCharsPerSentence: number): number {
  const preferredPoints = collectPreferredSplitPoints(text);
  const pointsWithinLimit = preferredPoints.filter((point) => point <= maxCharsPerSentence);
  if (pointsWithinLimit.length > 0) {
    return pointsWithinLimit[pointsWithinLimit.length - 1];
  }

  const nearestAfterLimit = preferredPoints.find(
    (point) => point > maxCharsPerSentence && point <= maxCharsPerSentence + SPLIT_POINT_TOLERANCE
  );
  if (nearestAfterLimit) {
    return nearestAfterLimit;
  }

  return maxCharsPerSentence;
}

function splitLongSentence(text: string, maxCharsPerSentence: number): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  const minTailChars = Math.max(
    2,
    Math.min(MIN_SPLITTABLE_CHARS, Math.floor(maxCharsPerSentence / 2))
  );

  while (remaining.length > maxCharsPerSentence) {
    const splitPoint = chooseSplitPoint(remaining, maxCharsPerSentence);
    if (splitPoint <= 0 || splitPoint >= remaining.length) {
      break;
    }

    const head = remaining.slice(0, splitPoint).trim();
    const tail = remaining.slice(splitPoint).trim();
    // Avoid producing trailing fragments like "す。" or "。" when a sentence
    // barely exceeds the max length. In that case we keep the sentence unsplit.
    if (!head || !tail || tail.length < minTailChars) {
      break;
    }

    chunks.push(head);
    remaining = tail;
  }

  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

export function splitIntoSentences(
  text: string,
  options: { maxCharsPerSentence?: number } = {}
): string[] {
  const requestedMax = options.maxCharsPerSentence;
  const maxCharsPerSentence =
    typeof requestedMax === "number" && Number.isFinite(requestedMax)
      ? Math.max(10, Math.trunc(requestedMax))
      : DEFAULT_MAX_CHARS_PER_SENTENCE;

  return text
    .replace(SENTENCE_ENDING_RE, "$1\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => splitLongSentence(line, maxCharsPerSentence));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function decidePauseLengthMs(
  sentence: string,
  options: { isTerminalInSourceLine?: boolean } = {},
  pauseConfig: PauseConfigValues = PauseConfig
): number {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return pauseConfig.minMs;
  }

  const length = trimmed.length;
  const isTerminalInSourceLine = options.isTerminalInSourceLine !== false;

  let base: number = pauseConfig.bases.default;
  if (STRONG_END_PUNCTUATION_RE.test(trimmed)) {
    base = pauseConfig.bases.strongEnding;
  } else if (FULL_STOP_END_RE.test(trimmed)) {
    base = pauseConfig.bases.fullStop;
  } else if (CLAUSE_END_RE.test(trimmed)) {
    base = pauseConfig.bases.clauseEnd;
  }

  const lengthBonus = clampNumber(
    Math.floor((length - 18) / pauseConfig.lengthBonus.step) * pauseConfig.lengthBonus.increment,
    0,
    pauseConfig.lengthBonus.max
  );
  const conjunctionPenalty = CONJUNCTION_PLAIN_RE.test(trimmed)
    ? pauseConfig.penalties.conjunction
    : 0;
  const continuationPenalty = isTerminalInSourceLine ? 0 : pauseConfig.penalties.continuation;

  const rawPause = base + lengthBonus - conjunctionPenalty - continuationPenalty;
  const normalized = Math.round(rawPause / 10) * 10;
  return clampNumber(normalized, pauseConfig.minMs, pauseConfig.maxMs);
}

function roundTo(value: number, digits: number): number {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

export function evaluateSpeakability(
  utterances: Array<Pick<VoicevoxTextUtterance, "text">>,
  scoringConfig: SpeakabilityScoringConfig = SpeakabilityConfig
): SpeakabilityMetrics {
  if (utterances.length === 0) {
    return {
      score: 0,
      average_chars_per_utterance: 0,
      long_utterance_ratio: 0,
      terminal_punctuation_ratio: 0
    };
  }

  const lengths = utterances.map((utterance) => utterance.text.trim().length);
  const totalChars = lengths.reduce((sum, length) => sum + length, 0);
  const averageChars = totalChars / utterances.length;
  const longCount = lengths.filter((length) => length > DEFAULT_MAX_CHARS_PER_SENTENCE).length;
  const terminalCount = utterances.filter((utterance) =>
    /[。！？!?]$/.test(utterance.text.trim())
  ).length;

  const longRatio = longCount / utterances.length;
  const terminalRatio = terminalCount / utterances.length;

  const avgPenalty = clampNumber(
    Math.max(averageChars - scoringConfig.targetAverageChars, 0) *
      scoringConfig.averagePenaltyFactor,
    0,
    scoringConfig.averagePenaltyMax
  );
  const longPenalty = longRatio * scoringConfig.longRatioWeight;
  const punctuationPenalty = (1 - terminalRatio) * scoringConfig.punctuationWeight;
  const score = Math.round(clampNumber(100 - avgPenalty - longPenalty - punctuationPenalty, 0, 100));

  return {
    score,
    average_chars_per_utterance: roundTo(averageChars, 1),
    long_utterance_ratio: roundTo(longRatio, 3),
    terminal_punctuation_ratio: roundTo(terminalRatio, 3)
  };
}

const LEGACY_SECTION_DURATION_NOTE_RE = /\(想定:\s*[0-9.]+分\)\s*$/;
const SILENCE_TAG_RE = /\[[0-9]+秒沈黙\]/g;
const INLINE_CODE_RE = /`([^`]+)`/g;

export function normalizeScriptLine(rawLine: string): string {
  // Keep compatibility with legacy Stage3 scripts that still include
  // section duration notes like "(想定: 1分)".
  const withoutLegacyDurationNote = rawLine.replace(LEGACY_SECTION_DURATION_NOTE_RE, "");
  const withoutSilence = withoutLegacyDurationNote.replace(SILENCE_TAG_RE, "");
  const withoutInlineCode = withoutSilence.replace(INLINE_CODE_RE, "$1");
  return withoutInlineCode.replace(/\s+/g, " ").trim();
}
