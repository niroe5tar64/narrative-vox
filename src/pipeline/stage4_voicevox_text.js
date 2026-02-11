import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAgainstSchema } from "../quality/schema_validator.js";

const SECTION_RE = /^\s*([1-8])\.\s+(.+)$/;
const TOTAL_TIME_RE = /^\s*合計想定時間\s*:/;
const DURATION_SUFFIX_RE = /\(想定:\s*[0-9.]+分\)\s*$/;
const SILENCE_TAG_RE = /\[[0-9]+秒沈黙\]/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const RUBY_RE = /\{([^|{}]+)\|([^{}]+)\}/g;
const RUN_ID_RE = /^run-\d{8}-\d{4}$/;
const HIRAGANA_ONLY_RE = /^[ぁ-ゖー]+$/;
const KATAKANA_ONLY_RE = /^[ァ-ヴー]+$/;
const UPPERCASE_ASCII_RE = /^[A-Z]{2,8}$/;
const NUMBER_ONLY_RE = /^[0-9]+$/;
const WORDLIKE_RE = /[一-龠々ぁ-ゖァ-ヴーA-Za-z]/;
const FALLBACK_TOKEN_RE = /[A-Za-z][A-Za-z0-9_.+-]{1,}|[ァ-ヴー]{3,}|[一-龠々]{2,}/g;

const LOW_SIGNAL_TOKENS = new Set([
  "こと",
  "ため",
  "もの",
  "よう",
  "これ",
  "それ",
  "any"
]);

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

let cachedJaWordSegmenter;
let cachedMorphTokenizer;
let cachedMorphTokenizerPromise;

function toUtteranceId(index) {
  return `U${String(index + 1).padStart(3, "0")}`;
}

export function splitIntoSentences(text) {
  return text
    .replace(/([。！？!?])/g, "$1\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function normalizeScriptLine(rawLine) {
  const withoutDuration = rawLine.replace(DURATION_SUFFIX_RE, "");
  const withoutSilence = withoutDuration.replace(SILENCE_TAG_RE, "");
  const withoutInlineCode = withoutSilence.replace(INLINE_CODE_RE, "$1");
  return withoutInlineCode.replace(/\s+/g, " ").trim();
}

export function collectRubyCandidates(text, map) {
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

export function replaceRubyWithReading(text) {
  return text.replace(RUBY_RE, (_, _surface, reading) => reading);
}

function getJapaneseWordSegmenter() {
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

function resolveKuromojiDictPath() {
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "node_modules/kuromoji/dict"),
    path.resolve(currentFileDir, "../../node_modules/kuromoji/dict")
  ];
  return candidates.find((candidatePath) => existsSync(candidatePath));
}

async function buildJapaneseMorphTokenizer() {
  const dictPath = resolveKuromojiDictPath();
  if (!dictPath) {
    return null;
  }

  try {
    const module = await import("kuromoji");
    const kuromoji = module.default ?? module;
    return await new Promise((resolve) => {
      kuromoji.builder({ dicPath: dictPath }).build((error, tokenizer) => {
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

async function getJapaneseMorphTokenizer() {
  if (cachedMorphTokenizer !== undefined) {
    return cachedMorphTokenizer;
  }

  if (!cachedMorphTokenizerPromise) {
    cachedMorphTokenizerPromise = buildJapaneseMorphTokenizer();
  }

  cachedMorphTokenizer = await cachedMorphTokenizerPromise;
  return cachedMorphTokenizer;
}

function normalizeCandidateSurface(token) {
  return token
    .replace(/^[^A-Za-z0-9一-龠々ぁ-ゖァ-ヴー]+/, "")
    .replace(/[^A-Za-z0-9一-龠々ぁ-ゖァ-ヴー]+$/, "")
    .trim();
}

function shouldCollectCandidate(surface) {
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

export function inferReadingFromSurface(surface) {
  if (!surface) {
    return "";
  }
  if (KATAKANA_ONLY_RE.test(surface)) {
    return surface;
  }
  if (!UPPERCASE_ASCII_RE.test(surface)) {
    return "";
  }
  return [...surface].map((char) => UPPERCASE_ASCII_READING_MAP[char] || "").join("");
}

export function tokenizeDictionaryTerms(text) {
  const segmenter = getJapaneseWordSegmenter();
  if (!segmenter) {
    return text.match(FALLBACK_TOKEN_RE) ?? [];
  }

  const tokens = [];
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

function normalizeMorphReading(reading) {
  const normalized = String(reading || "").trim();
  if (!normalized || normalized === "*") {
    return "";
  }
  return KATAKANA_ONLY_RE.test(normalized) ? normalized : "";
}

function upsertTermCandidate(
  map,
  { surface, reading, source = "token", readingSource = "" }
) {
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

export function collectTermCandidates(text, map) {
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

export function collectTermCandidatesWithMorphology(text, map, tokenizer) {
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

export function priorityForCandidate(candidate) {
  if (candidate.source === "ruby") {
    return "HIGH";
  }
  if (candidate.occurrences >= 4) {
    return "HIGH";
  }
  if (candidate.reading && candidate.occurrences >= 2) {
    return "HIGH";
  }
  if (candidate.reading || candidate.occurrences >= 2) {
    return "MEDIUM";
  }
  return "LOW";
}

function makeCsv(candidates) {
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

export function toDictionaryCandidates(termCandidates) {
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

function inferEpisodeId(scriptPath, explicitEpisodeId) {
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

function inferProjectAndRun(outDir, explicitProjectId, explicitRunId) {
  const runId = resolveRunId(outDir, explicitRunId);
  const projectId = explicitProjectId || path.basename(path.dirname(outDir));
  return { projectId, runId };
}

function findRunIdInPath(outDir) {
  const segments = path.resolve(outDir).split(path.sep).filter(Boolean);
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const candidate = segments[index];
    if (RUN_ID_RE.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function toRunIdTimestampPart(value) {
  return String(value).padStart(2, "0");
}

function makeRunIdNow(now = new Date()) {
  const year = String(now.getFullYear());
  const month = toRunIdTimestampPart(now.getMonth() + 1);
  const day = toRunIdTimestampPart(now.getDate());
  const hour = toRunIdTimestampPart(now.getHours());
  const minute = toRunIdTimestampPart(now.getMinutes());
  return `run-${year}${month}${day}-${hour}${minute}`;
}

function validateExplicitRunId(explicitRunId) {
  if (RUN_ID_RE.test(explicitRunId)) {
    return explicitRunId;
  }
  throw new Error(`Invalid --run-id "${explicitRunId}". Expected format: run-YYYYMMDD-HHMM`);
}

function resolveRunId(outDir, explicitRunId) {
  if (explicitRunId) {
    return validateExplicitRunId(String(explicitRunId));
  }

  const inferred = findRunIdInPath(outDir);
  if (inferred) {
    return inferred;
  }

  return makeRunIdNow();
}

export async function runStage4({ scriptPath, outDir, projectId, runId, episodeId }) {
  const resolvedScriptPath = path.resolve(scriptPath);
  const resolvedOutDir = path.resolve(outDir);
  const finalEpisodeId = inferEpisodeId(resolvedScriptPath, episodeId);
  const ids = inferProjectAndRun(resolvedOutDir, projectId, runId);

  const source = await readFile(resolvedScriptPath, "utf-8");
  const lines = source.split(/\r?\n/);
  const morphTokenizer = await getJapaneseMorphTokenizer();

  const termCandidates = new Map();
  const utterances = [];

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

    for (const sentence of sentences) {
      collectTermCandidatesWithMorphology(sentence, termCandidates, morphTokenizer);
      const pauseLengthMs = /[。！？!?]$/.test(sentence) ? 300 : 150;
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
  const warnings = [];

  if (maxChars > 80) {
    warnings.push("Some utterances exceed 80 chars. Consider additional sentence split.");
  }

  const stage4Data = {
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
