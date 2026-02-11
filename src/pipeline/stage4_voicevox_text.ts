import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { IpadicFeatures, Tokenizer } from "kuromoji";
import { validateAgainstSchema } from "../quality/schema_validator.ts";

const SECTION_RE = /^\s*([1-8])\.\s+(.+)$/;
const TOTAL_TIME_RE = /^\s*合計想定時間\s*:/;
const DURATION_SUFFIX_RE = /\(想定:\s*[0-9.]+分\)\s*$/;
const SILENCE_TAG_RE = /\[[0-9]+秒沈黙\]/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const RUBY_RE = /\{([^|{}]+)\|([^{}]+)\}/g;
const SENTENCE_ENDING_RE = /([。！？!?])/g;
const CLAUSE_PUNCTUATION_RE = /[、，；;：:]/g;
const CONJUNCTION_BOUNDARY_RE =
  /(そして|しかし|ただし|ただ|また|なお|そのため|なので|ところが|一方で|つまり|まず|次に|最後に|ちなみに)/g;
const CONJUNCTION_PLAIN_RE =
  /(そして|しかし|ただし|ただ|また|なお|そのため|なので|ところが|一方で|つまり|まず|次に|最後に|ちなみに)/;
const STRONG_END_PUNCTUATION_RE = /[！？!?]$/;
const FULL_STOP_END_RE = /。$/;
const CLAUSE_END_RE = /[、，；;：:]$/;
const RUN_ID_RE = /^run-\d{8}-\d{4}$/;
const HIRAGANA_ONLY_RE = /^[ぁ-ゖー]+$/;
const KATAKANA_ONLY_RE = /^[ァ-ヴー]+$/;
const UPPERCASE_ASCII_RE = /^[A-Z]{2,8}$/;
const NUMBER_ONLY_RE = /^[0-9]+$/;
const WORDLIKE_RE = /[一-龠々ぁ-ゖァ-ヴーA-Za-z]/;
const FALLBACK_TOKEN_RE = /[A-Za-z][A-Za-z0-9_.+-]{1,}|[ァ-ヴー]{3,}|[一-龠々]{2,}/g;
const DEFAULT_MAX_CHARS_PER_SENTENCE = 48;
const MIN_SPLITTABLE_CHARS = 8;
const MIN_PAUSE_MS = 120;
const MAX_PAUSE_MS = 520;

type CandidateSource = "ruby" | "token" | "morph";
type ReadingSource = "" | "ruby" | "morph" | "inferred";
type CandidatePriority = "HIGH" | "MEDIUM" | "LOW";

type MorphTokenizer = Tokenizer<IpadicFeatures>;

interface TermCandidateState {
  reading: string;
  occurrences: number;
  source: CandidateSource;
  readingSource: ReadingSource;
}

interface DictionaryCandidate {
  surface: string;
  reading_or_empty: string;
  priority: CandidatePriority;
  occurrences: number;
  source: CandidateSource;
  note: string;
}

interface Stage4Utterance {
  utterance_id: string;
  section_id: number;
  section_title: string;
  text: string;
  pause_length_ms: number;
}

interface SpeakabilityMetrics {
  score: number;
  average_chars_per_utterance: number;
  long_utterance_ratio: number;
  terminal_punctuation_ratio: number;
}

interface Stage4Data {
  schema_version: "1.0";
  meta: {
    project_id: string;
    run_id: string;
    episode_id: string;
    source_script_path: string;
    generated_at: string;
  };
  utterances: Stage4Utterance[];
  dictionary_candidates: DictionaryCandidate[];
  quality_checks: {
    utterance_count: number;
    max_chars_per_utterance: number;
    has_ruby_notation: boolean;
    speakability: SpeakabilityMetrics;
    warnings: string[];
  };
}

interface RunStage4Options {
  scriptPath: string;
  outDir: string;
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

type TermCandidateMap = Map<string, TermCandidateState>;

const LOW_SIGNAL_TOKENS = new Set(["こと", "ため", "もの", "よう", "これ", "それ", "any"]);

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

let cachedJaWordSegmenter: Intl.Segmenter | null | undefined;
let cachedMorphTokenizer: MorphTokenizer | null | undefined;
let cachedMorphTokenizerPromise: Promise<MorphTokenizer | null> | undefined;

function toUtteranceId(index: number): string {
  return `U${String(index + 1).padStart(3, "0")}`;
}

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
    (point) => point > maxCharsPerSentence && point <= maxCharsPerSentence + 6
  );
  if (nearestAfterLimit) {
    return nearestAfterLimit;
  }

  return maxCharsPerSentence;
}

function splitLongSentence(text: string, maxCharsPerSentence: number): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxCharsPerSentence) {
    const splitPoint = chooseSplitPoint(remaining, maxCharsPerSentence);
    if (splitPoint <= 0 || splitPoint >= remaining.length) {
      break;
    }

    const head = remaining.slice(0, splitPoint).trim();
    const tail = remaining.slice(splitPoint).trim();
    if (!head || !tail) {
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
  options: { isTerminalInSourceLine?: boolean } = {}
): number {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return MIN_PAUSE_MS;
  }

  const length = trimmed.length;
  const isTerminalInSourceLine = options.isTerminalInSourceLine !== false;

  let base = 190;
  if (STRONG_END_PUNCTUATION_RE.test(trimmed)) {
    base = 360;
  } else if (FULL_STOP_END_RE.test(trimmed)) {
    base = 320;
  } else if (CLAUSE_END_RE.test(trimmed)) {
    base = 240;
  }

  const lengthBonus = clampNumber(Math.floor((length - 18) / 10) * 20, 0, 120);
  const conjunctionPenalty = CONJUNCTION_PLAIN_RE.test(trimmed) ? 40 : 0;
  const continuationPenalty = isTerminalInSourceLine ? 0 : 50;

  const rawPause = base + lengthBonus - conjunctionPenalty - continuationPenalty;
  const normalized = Math.round(rawPause / 10) * 10;
  return clampNumber(normalized, MIN_PAUSE_MS, MAX_PAUSE_MS);
}

function roundTo(value: number, digits: number): number {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

export function evaluateSpeakability(
  utterances: Array<Pick<Stage4Utterance, "text">>
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

  const avgPenalty = clampNumber(Math.max(averageChars - 32, 0) * 1.2, 0, 35);
  const longPenalty = longRatio * 45;
  const punctuationPenalty = (1 - terminalRatio) * 20;
  const score = Math.round(clampNumber(100 - avgPenalty - longPenalty - punctuationPenalty, 0, 100));

  return {
    score,
    average_chars_per_utterance: roundTo(averageChars, 1),
    long_utterance_ratio: roundTo(longRatio, 3),
    terminal_punctuation_ratio: roundTo(terminalRatio, 3)
  };
}

function normalizeScriptLine(rawLine: string): string {
  const withoutDuration = rawLine.replace(DURATION_SUFFIX_RE, "");
  const withoutSilence = withoutDuration.replace(SILENCE_TAG_RE, "");
  const withoutInlineCode = withoutSilence.replace(INLINE_CODE_RE, "$1");
  return withoutInlineCode.replace(/\s+/g, " ").trim();
}

export function collectRubyCandidates(text: string, map: TermCandidateMap): void {
  for (const match of text.matchAll(RUBY_RE)) {
    const surface = (match[1] || "").trim();
    const reading = (match[2] || "").trim();
    if (!surface || !reading) {
      continue;
    }

    const current = map.get(surface);
    if (!current) {
      map.set(surface, { reading, occurrences: 1, source: "ruby", readingSource: "ruby" });
      continue;
    }

    current.occurrences += 1;
    current.source = "ruby";
    current.reading = reading;
    current.readingSource = "ruby";
  }
}

export function replaceRubyWithReading(text: string): string {
  return text.replace(RUBY_RE, (_matched, _surface, reading: string) => reading);
}

function getJapaneseWordSegmenter(): Intl.Segmenter | null {
  if (cachedJaWordSegmenter !== undefined) {
    return cachedJaWordSegmenter;
  }
  if (typeof Intl === "undefined" || typeof Intl.Segmenter !== "function") {
    cachedJaWordSegmenter = null;
    return cachedJaWordSegmenter;
  }
  cachedJaWordSegmenter = new Intl.Segmenter("ja", { granularity: "word" });
  return cachedJaWordSegmenter;
}

function resolveKuromojiDictPath(): string | undefined {
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "node_modules/kuromoji/dict"),
    path.resolve(currentFileDir, "../../node_modules/kuromoji/dict")
  ];
  return candidates.find((candidatePath) => existsSync(candidatePath));
}

async function buildJapaneseMorphTokenizer(): Promise<MorphTokenizer | null> {
  const dictPath = resolveKuromojiDictPath();
  if (!dictPath) {
    return null;
  }

  try {
    const kuromojiModule = (await import("kuromoji")) as {
      builder?: typeof import("kuromoji").builder;
      default?: { builder?: typeof import("kuromoji").builder };
    };

    const builder = kuromojiModule.builder ?? kuromojiModule.default?.builder;
    if (!builder) {
      return null;
    }

    return await new Promise<MorphTokenizer | null>((resolve) => {
      builder({ dicPath: dictPath }).build((error, tokenizer) => {
        if (error || !tokenizer) {
          resolve(null);
          return;
        }
        resolve(tokenizer);
      });
    });
  } catch {
    return null;
  }
}

async function getJapaneseMorphTokenizer(): Promise<MorphTokenizer | null> {
  if (cachedMorphTokenizer !== undefined) {
    return cachedMorphTokenizer;
  }

  if (!cachedMorphTokenizerPromise) {
    cachedMorphTokenizerPromise = buildJapaneseMorphTokenizer();
  }

  cachedMorphTokenizer = await cachedMorphTokenizerPromise;
  return cachedMorphTokenizer;
}

function normalizeCandidateSurface(token: string): string {
  return token
    .replace(/^[^A-Za-z0-9一-龠々ぁ-ゖァ-ヴー]+/, "")
    .replace(/[^A-Za-z0-9一-龠々ぁ-ゖァ-ヴー]+$/, "")
    .trim();
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
  if (LOW_SIGNAL_TOKENS.has(surface)) {
    return false;
  }
  if (LOW_SIGNAL_TOKENS.has(surface.toLowerCase())) {
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

export function tokenizeDictionaryTerms(text: string): string[] {
  const segmenter = getJapaneseWordSegmenter();
  if (!segmenter) {
    return text.match(FALLBACK_TOKEN_RE) ?? [];
  }

  const tokens: string[] = [];
  for (const segment of segmenter.segment(text)) {
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
  outDir: string,
  explicitProjectId?: string,
  explicitRunId?: string
): { projectId: string; runId: string } {
  const runId = resolveRunId(outDir, explicitRunId);
  const projectId = explicitProjectId || path.basename(path.dirname(outDir));
  return { projectId, runId };
}

function findRunIdInPath(outDir: string): string | undefined {
  const segments = path.resolve(outDir).split(path.sep).filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = segments[index];
    if (RUN_ID_RE.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function toRunIdTimestampPart(value: number): string {
  return String(value).padStart(2, "0");
}

function makeRunIdNow(now: Date = new Date()): string {
  const year = String(now.getFullYear());
  const month = toRunIdTimestampPart(now.getMonth() + 1);
  const day = toRunIdTimestampPart(now.getDate());
  const hour = toRunIdTimestampPart(now.getHours());
  const minute = toRunIdTimestampPart(now.getMinutes());
  return `run-${year}${month}${day}-${hour}${minute}`;
}

function validateExplicitRunId(explicitRunId: string): string {
  if (RUN_ID_RE.test(explicitRunId)) {
    return explicitRunId;
  }
  throw new Error(`Invalid --run-id "${explicitRunId}". Expected format: run-YYYYMMDD-HHMM`);
}

function resolveRunId(outDir: string, explicitRunId?: string): string {
  if (explicitRunId) {
    return validateExplicitRunId(String(explicitRunId));
  }

  const inferred = findRunIdInPath(outDir);
  if (inferred) {
    return inferred;
  }

  return makeRunIdNow();
}

export async function runStage4({
  scriptPath,
  outDir,
  projectId,
  runId,
  episodeId
}: RunStage4Options): Promise<RunStage4Result> {
  const resolvedScriptPath = path.resolve(scriptPath);
  const resolvedOutDir = path.resolve(outDir);
  const finalEpisodeId = inferEpisodeId(resolvedScriptPath, episodeId);
  const ids = inferProjectAndRun(resolvedOutDir, projectId, runId);

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

  const stage4Dir = path.join(resolvedOutDir, "stage4");
  const stage4DictDir = path.join(resolvedOutDir, "stage4_dict");
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
