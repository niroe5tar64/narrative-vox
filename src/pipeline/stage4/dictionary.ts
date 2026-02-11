import type {
  CandidatePriority,
  CandidateSource,
  DictionaryCandidate,
  ReadingSource
} from "../../shared/types.ts";
import { getJapaneseMorphTokenizer, type MorphTokenizer } from "./dictionary_tokenizer.ts";
export { getJapaneseMorphTokenizer, type MorphTokenizer } from "./dictionary_tokenizer.ts";

export interface TermCandidateState {
  reading: string;
  occurrences: number;
  source: CandidateSource;
  readingSource: ReadingSource;
}

export type TermCandidateMap = Map<string, TermCandidateState>;

export enum DictionaryCsvField {
  surface = "surface",
  reading = "reading",
  priority = "priority",
  occurrences = "occurrences",
  source = "source",
  note = "note"
}

export const DictionaryNoiseConfig = {
  /**
   * Terms that skew dictionary quality because they are frequent grammatical particles,
   * vague demonstratives, or general-purpose fillers. We treat them as noise when collecting candidates.
   */
  lowSignalTokens: new Set(["こと", "ため", "もの", "よう", "これ", "それ", "any"])
} as const;
const UPPERCASE_ASCII_READING_MAP = Object.freeze({
  A: "エー",
  B: "ビー",
  C: "シー",
  D: "ディー",
  E: "イー",
  F: "エフ",
  G: "ジー",
  H: "エイチ",
  I: "アイ",
  J: "ジェー",
  K: "ケー",
  L: "エル",
  M: "エム",
  N: "エヌ",
  O: "オー",
  P: "ピー",
  Q: "キュー",
  R: "アール",
  S: "エス",
  T: "ティー",
  U: "ユー",
  V: "ブイ",
  W: "ダブリュー",
  X: "エックス",
  Y: "ワイ",
  Z: "ゼット"
});

const HIRAGANA_ONLY_RE = /^[ぁ-ゖー]+$/;
const KATAKANA_ONLY_RE = /^[ァ-ヴー]+$/;
const UPPERCASE_ASCII_RE = /^[A-Z]{2,8}$/;
const NUMBER_ONLY_RE = /^[0-9]+$/;
const WORDLIKE_RE = /[一-龠々ぁ-ゖァ-ヴーA-Za-z]/;
const FALLBACK_TOKEN_RE = /[A-Za-z][A-Za-z0-9_.+-]{1,}|[ァ-ヴー]{3,}|[一-龠々]{2,}/g;

function normalizeCandidateSurface(token: string): string {
  return token
    .replace(/^[^A-Za-z0-9一-龠々ぁ-ゖァ-ヴー]+/, "")
    .replace(/[^A-Za-z0-9一-龠々ぁ-ゖァ-ヴー]+$/, "")
    .trim();
}

function isLowSignalSurface(surface: string): boolean {
  if (!surface) {
    return false;
  }

  if (DictionaryNoiseConfig.lowSignalTokens.has(surface)) {
    return true;
  }
  if (DictionaryNoiseConfig.lowSignalTokens.has(surface.toLowerCase())) {
    return true;
  }
  return false;
}

function shouldCollectCandidate(surface: string): boolean {
  if (!surface || surface.length < 2) {
    return false;
  }
  if (NUMBER_ONLY_RE.test(surface)) {
    return false;
  }
  if (HIRAGANA_ONLY_RE.test(surface)) {
    return false;
  }
  if (!WORDLIKE_RE.test(surface)) {
    return false;
  }
  if (isLowSignalSurface(surface)) {
    return false;
  }
  return true;
}

export function inferReadingFromSurface(surface: string): string {
  if (!surface) {
    return "";
  }
  if (KATAKANA_ONLY_RE.test(surface)) {
    return surface;
  }
  if (!UPPERCASE_ASCII_RE.test(surface)) {
    return "";
  }

  return [...surface]
    .map((char) => UPPERCASE_ASCII_READING_MAP[char as keyof typeof UPPERCASE_ASCII_READING_MAP] || "")
    .join("");
}

function getJapaneseWordSegmenter(): Intl.Segmenter | null {
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
    return null;
  }
  return new Intl.Segmenter("ja", { granularity: "word" });
}

let cachedJaWordSegmenter: Intl.Segmenter | null | undefined;

function tokenizeWithSegmenter(text: string): string[] {
  if (cachedJaWordSegmenter === undefined) {
    cachedJaWordSegmenter = getJapaneseWordSegmenter();
  }

  if (!cachedJaWordSegmenter) {
    return text.match(FALLBACK_TOKEN_RE) ?? [];
  }

  const tokens: string[] = [];
  for (const segment of cachedJaWordSegmenter.segment(text)) {
    if (!segment.isWordLike) {
      continue;
    }
    const normalized = normalizeCandidateSurface(segment.segment);
    if (!normalized) {
      continue;
    }
    tokens.push(normalized);
  }
  return tokens;
}

export function tokenizeDictionaryTerms(text: string): string[] {
  return tokenizeWithSegmenter(text);
}

function normalizeMorphReading(reading?: string): string {
  const normalized = String(reading || "").trim();
  if (!normalized || normalized === "*") {
    return "";
  }
  return KATAKANA_ONLY_RE.test(normalized) ? normalized : "";
}

function upsertTermCandidate(
  map: TermCandidateMap,
  {
    surface,
    reading,
    source = "token",
    readingSource = ""
  }: {
    surface: string;
    reading: string;
    source?: CandidateSource;
    readingSource?: ReadingSource;
  }
): void {
  const current = map.get(surface);
  if (!current) {
    map.set(surface, { reading, occurrences: 1, source, readingSource });
    return;
  }

  current.occurrences += 1;
  if (current.source !== "ruby" && source === "morph") {
    current.source = "morph";
  }
  if (!current.reading && reading) {
    current.reading = reading;
    if (current.readingSource !== "ruby") {
      current.readingSource = readingSource || current.readingSource;
    }
  }
  if (current.readingSource !== "ruby" && readingSource === "morph" && reading) {
    current.readingSource = "morph";
  }
}

export function collectRubyCandidates(text: string, map: TermCandidateMap): void {
  const RUBY_RE = /\{([^|{}]+)\|([^{}]+)\}/g;
  for (const match of text.matchAll(RUBY_RE)) {
    const surface = (match[1] || "").trim();
    const reading = (match[2] || "").trim();
    if (!surface || !reading) {
      continue;
    }
    upsertTermCandidate(map, {
      surface,
      reading,
      source: "ruby",
      readingSource: "ruby"
    });
  }
}

export function collectTermCandidates(text: string, map: TermCandidateMap): void {
  for (const token of tokenizeDictionaryTerms(text)) {
    const surface = token.trim();
    if (!shouldCollectCandidate(surface)) {
      continue;
    }

    const inferredReading = inferReadingFromSurface(surface);
    upsertTermCandidate(map, {
      surface,
      reading: inferredReading,
      source: "token",
      readingSource: inferredReading ? "inferred" : ""
    });
  }
}

export function collectTermCandidatesWithMorphology(
  text: string,
  map: TermCandidateMap,
  tokenizer: MorphTokenizer | null | undefined
): void {
  if (!tokenizer || typeof tokenizer.tokenize !== "function") {
    collectTermCandidates(text, map);
    return;
  }

  for (const token of tokenizer.tokenize(text)) {
    if (!token || token.pos !== "名詞" || token.pos_detail_1 === "非自立") {
      continue;
    }

    const surface = normalizeCandidateSurface(token.surface_form || "");
    if (!shouldCollectCandidate(surface)) {
      continue;
    }

    const readingFromMorph = normalizeMorphReading(token.reading);
    const inferredReading = readingFromMorph ? "" : inferReadingFromSurface(surface);
    const reading = readingFromMorph || inferredReading;
    upsertTermCandidate(map, {
      surface,
      reading,
      source: "morph",
      readingSource: readingFromMorph ? "morph" : inferredReading ? "inferred" : ""
    });
  }
}

export function priorityForCandidate(candidate: TermCandidateState): CandidatePriority {
  if (candidate.source === "ruby") {
    return "HIGH";
  }

  const hasReading = candidate.reading.length > 0;
  const hasMorphReading = candidate.readingSource === "morph";
  const hasInferredReading = candidate.readingSource === "inferred";

  if (candidate.occurrences >= 3) {
    return "HIGH";
  }
  if (candidate.occurrences >= 2 && (hasMorphReading || candidate.source === "morph")) {
    return "HIGH";
  }

  if (candidate.source === "token" && hasInferredReading && candidate.occurrences === 1) {
    return "LOW";
  }

  if (candidate.occurrences >= 2 || hasMorphReading || hasReading) {
    return "MEDIUM";
  }
  return "LOW";
}

export function toDictionaryCandidates(termCandidates: TermCandidateMap): DictionaryCandidate[] {
  return [...termCandidates.entries()]
    .map(([surface, info]) => ({
      surface,
      reading_or_empty: info.reading,
      priority: priorityForCandidate(info),
      occurrences: info.occurrences,
      source: info.source,
      note:
        info.readingSource === "ruby"
          ? "ruby_from_script"
          : info.readingSource === "morph"
            ? "reading_from_morphology"
            : info.reading
              ? "reading_inferred"
              : "auto_detected"
    }))
    .sort((a, b) => {
      if (b.occurrences !== a.occurrences) {
        return b.occurrences - a.occurrences;
      }
      return a.surface.localeCompare(b.surface, "ja");
    });
}
