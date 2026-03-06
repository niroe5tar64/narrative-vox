import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getJapaneseMorphTokenizer,
  type MorphTokenizer,
} from "@narrative-vox/infrastructure/japanese-morph-tokenizer.ts";
import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import type {
  TechnicalTermsAuditDetail,
  TechnicalTermsAuditReport,
  UserDictForCheckRun,
  VoicevoxTextForCheckRun,
} from "./shared.ts";

// For token-level matching and dictionary surface comparison.
function normalizeTechnicalTermToken(term: string): string {
  return term
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[_./+-]/g, " ")
    .replace(/[()[\]{}"'`“”‘’<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+/g, "");
}

// For loose text/ruby surface comparison where spaces must remain meaningful.
function normalizeTechnicalTermText(term: string): string {
  return term
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[_./+-]/g, " ")
    .replace(/[()[\]{}"'`“”‘’<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface ScriptTokenSpan {
  raw: string;
  normalized: string;
  start: number;
  end: number;
}

interface MorphScriptTokenSpan {
  raw: string;
  normalized: string;
  start: number;
  end: number;
}

interface TokenSpan {
  start: number;
  end: number;
}

interface CoverageVariantEval {
  inScript: boolean;
  variants: string[];
  skipped: boolean;
}

interface CoverageRuntimeContext {
  scriptText: string;
  scriptTokenSpans: ScriptTokenSpan[];
  scriptTokens: string[];
  normalizedScriptText: string;
  rawStartByNormalizedIndex: number[];
  rawEndByNormalizedIndex: number[];
  scriptMorphTokenSpans: MorphScriptTokenSpan[];
  morphTokenizer?: MorphTokenizer | null;
}

interface NormalizedTextIndexMap {
  normalizedText: string;
  rawStartByNormalizedIndex: number[];
  rawEndByNormalizedIndex: number[];
}

const TECHNICAL_TOKEN_PATTERN =
  /[A-Za-z0-9Ａ-Ｚａ-ｚ０-９][A-Za-z0-9Ａ-Ｚａ-ｚ０-９_./+-]*/g;
const TECHNICAL_TO_SPACE_CHARS = new Set([
  "_",
  ".",
  "/",
  "+",
  "-",
  "(",
  ")",
  "[",
  "]",
  "{",
  "}",
  '"',
  "'",
  "`",
  "“",
  "”",
  "‘",
  "’",
  "<",
  ">",
]);

function tokenizeTechnicalMatchScript(scriptText: string): ScriptTokenSpan[] {
  const tokens: ScriptTokenSpan[] = [];
  for (const match of scriptText.matchAll(TECHNICAL_TOKEN_PATTERN)) {
    const rawToken = match[0] || "";
    const normalized = normalizeTechnicalTermToken(rawToken);
    const start = match.index ?? -1;
    if (!normalized || start < 0) {
      continue;
    }
    tokens.push({
      raw: rawToken,
      normalized,
      start,
      end: start + rawToken.length,
    });
  }
  return tokens;
}

function tokenizeMorphScript(
  scriptText: string,
  morphTokenizer: MorphTokenizer,
): MorphScriptTokenSpan[] {
  const tokens: MorphScriptTokenSpan[] = [];
  for (const token of morphTokenizer.tokenize(scriptText)) {
    const raw = String(token?.surface_form ?? "");
    const normalized = normalizeTechnicalTermText(raw);
    const wordPosition = Number(token?.word_position ?? 0);
    const start = wordPosition - 1;
    const end = start + raw.length;
    if (
      !raw ||
      !normalized ||
      !Number.isFinite(start) ||
      start < 0 ||
      end <= start ||
      end > scriptText.length
    ) {
      continue;
    }
    tokens.push({ raw, normalized, start, end });
  }
  return tokens;
}

function tokenizeMorphTerm(
  term: string,
  morphTokenizer: MorphTokenizer,
): string[] {
  const normalizedTokens: string[] = [];
  for (const token of morphTokenizer.tokenize(term)) {
    const raw = String(token?.surface_form ?? "");
    const normalized = normalizeTechnicalTermText(raw);
    if (!normalized) {
      continue;
    }
    normalizedTokens.push(normalized);
  }
  return normalizedTokens;
}

function normalizeTechnicalTextChar(char: string): string {
  if (TECHNICAL_TO_SPACE_CHARS.has(char) || /\s/.test(char)) {
    return " ";
  }
  return char;
}

function buildNormalizedTextIndexMap(
  scriptText: string,
): NormalizedTextIndexMap {
  const normalizedChars: string[] = [];
  const rawStartByNormalizedIndex: number[] = [];
  const rawEndByNormalizedIndex: number[] = [];
  let previousWasSpace = false;

  const clusters: Array<{ rawStart: number; rawEnd: number; text: string }> =
    [];
  for (let rawIndex = 0; rawIndex < scriptText.length; ) {
    const current = scriptText[rawIndex];
    if (!current) {
      break;
    }
    let rawEnd = rawIndex + current.length;
    let clusterText = current;

    while (rawEnd < scriptText.length) {
      const next = scriptText[rawEnd];
      if (!next) {
        break;
      }
      if (!/[\p{M}\uFF9E\uFF9F]/u.test(next)) {
        break;
      }
      clusterText += next;
      rawEnd += next.length;
    }

    clusters.push({ rawStart: rawIndex, rawEnd, text: clusterText });
    rawIndex = rawEnd;
  }

  for (const cluster of clusters) {
    const normalizedChunk = cluster.text.normalize("NFKC").toLowerCase();
    if (!normalizedChunk) {
      continue;
    }

    for (const chunkChar of normalizedChunk) {
      const normalizedChar = normalizeTechnicalTextChar(chunkChar);
      if (normalizedChar === " ") {
        if (normalizedChars.length === 0 || previousWasSpace) {
          continue;
        }
        normalizedChars.push(" ");
        rawStartByNormalizedIndex.push(cluster.rawStart);
        rawEndByNormalizedIndex.push(cluster.rawEnd);
        previousWasSpace = true;
        continue;
      }

      normalizedChars.push(normalizedChar);
      rawStartByNormalizedIndex.push(cluster.rawStart);
      rawEndByNormalizedIndex.push(cluster.rawEnd);
      previousWasSpace = false;
    }
  }

  while (
    normalizedChars.length > 0 &&
    normalizedChars[normalizedChars.length - 1] === " "
  ) {
    normalizedChars.pop();
    rawStartByNormalizedIndex.pop();
    rawEndByNormalizedIndex.pop();
  }

  return {
    normalizedText: normalizedChars.join(""),
    rawStartByNormalizedIndex,
    rawEndByNormalizedIndex,
  };
}

function normalizedTokensFromSpans(
  scriptTokenSpans: ScriptTokenSpan[],
): string[] {
  return scriptTokenSpans.map((token) => token.normalized);
}

function hasAsciiAlphaNum(value: string): boolean {
  return /[A-Za-z0-9]/.test(value.normalize("NFKC"));
}

function hasNonAsciiChar(value: string): boolean {
  return value
    .normalize("NFKC")
    .split("")
    .some((c) => c.charCodeAt(0) >= 0x80);
}

function isMixedTechnicalTerm(term: string): boolean {
  return hasAsciiAlphaNum(term) && hasNonAsciiChar(term);
}

function splitTechnicalTermWords(term: string): string[] {
  const normalized = normalizeTechnicalTermText(term);
  if (!normalized) {
    return [];
  }
  return normalized.split(" ").filter((part) => part.length > 0);
}

function containsWordSequence(tokens: string[], words: string[]): boolean {
  if (words.length === 0 || words.length > tokens.length) {
    return false;
  }
  for (let i = 0; i <= tokens.length - words.length; i++) {
    let matches = true;
    for (let j = 0; j < words.length; j++) {
      if (tokens[i + j] !== words[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return true;
    }
  }
  return false;
}

function collectTokenSequenceSpans<
  T extends { normalized: string; start: number; end: number },
>(tokens: T[], words: string[]): TokenSpan[] {
  if (words.length === 0 || words.length > tokens.length) {
    return [];
  }

  const spans: TokenSpan[] = [];
  for (let i = 0; i <= tokens.length - words.length; i++) {
    let matches = true;
    for (let j = 0; j < words.length; j++) {
      if (tokens[i + j]?.normalized !== words[j]) {
        matches = false;
        break;
      }
    }
    if (!matches) {
      continue;
    }

    const start = tokens[i]?.start;
    const end = tokens[i + words.length - 1]?.end;
    if (start === undefined || end === undefined || end <= start) {
      continue;
    }
    spans.push({ start, end });
  }
  return spans;
}

function dedupeSpans(spans: TokenSpan[]): TokenSpan[] {
  const seen = new Set<string>();
  const deduped: TokenSpan[] = [];
  for (const span of spans) {
    const key = `${span.start}:${span.end}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(span);
  }
  return deduped;
}

function collectNonAsciiMorphMatchSpans(params: {
  scriptText: string;
  scriptMorphTokenSpans: MorphScriptTokenSpan[];
  termMorphTokens: string[];
  normalizedTarget: string;
}): TokenSpan[] {
  const sequenceSpans =
    params.termMorphTokens.length > 0
      ? collectTokenSequenceSpans(
          params.scriptMorphTokenSpans,
          params.termMorphTokens,
        )
      : [];
  if (!params.normalizedTarget) {
    return sequenceSpans;
  }

  const concatenatedSpans: TokenSpan[] = [];
  for (let i = 0; i < params.scriptMorphTokenSpans.length; i++) {
    const start = params.scriptMorphTokenSpans[i]?.start;
    if (start === undefined) {
      continue;
    }
    for (let j = i; j < params.scriptMorphTokenSpans.length; j++) {
      const end = params.scriptMorphTokenSpans[j]?.end;
      if (end === undefined || end <= start) {
        continue;
      }

      const rawSlice = params.scriptText.slice(start, end);
      const normalizedConcat = normalizeTechnicalTermToken(rawSlice);
      if (!normalizedConcat) {
        continue;
      }

      if (normalizedConcat === params.normalizedTarget) {
        concatenatedSpans.push({ start, end });
        break;
      }

      if (normalizedConcat.length > params.normalizedTarget.length) {
        break;
      }
      if (!params.normalizedTarget.startsWith(normalizedConcat)) {
        break;
      }
    }
  }

  return dedupeSpans([...sequenceSpans, ...concatenatedSpans]);
}

function collectNotationVariantsFromSpans(
  scriptText: string,
  spans: TokenSpan[],
): string[] {
  const variants = new Set<string>();
  for (const span of spans) {
    const rawVariant = scriptText.slice(span.start, span.end).trim();
    if (rawVariant) {
      variants.add(rawVariant);
    }
  }
  return [...variants].sort((a, b) => a.localeCompare(b, "ja"));
}

function isAsciiAlphaNumChar(value: string): boolean {
  return /^[A-Za-z0-9]$/.test(value);
}

function isValidMixedTermBoundary(
  text: string,
  matchStart: number,
  matchLength: number,
): boolean {
  const prevChar = matchStart > 0 ? text[matchStart - 1] : "";
  const nextIndex = matchStart + matchLength;
  const nextChar = nextIndex < text.length ? text[nextIndex] : "";
  return !isAsciiAlphaNumChar(prevChar) && !isAsciiAlphaNumChar(nextChar);
}

function hasMixedTermAsciiBoundaryMatch(
  normalizedScriptText: string,
  normalizedTermText: string,
): boolean {
  if (!normalizedTermText) {
    return false;
  }

  let searchFrom = 0;
  for (;;) {
    const index = normalizedScriptText.indexOf(normalizedTermText, searchFrom);
    if (index < 0) {
      return false;
    }
    if (
      isValidMixedTermBoundary(
        normalizedScriptText,
        index,
        normalizedTermText.length,
      )
    ) {
      return true;
    }

    searchFrom = index + 1;
  }
}

function isTechnicalTermCoveredInScript(
  scriptTokens: string[],
  normalizedScriptText: string,
  term: string,
): boolean {
  if (isMixedTechnicalTerm(term)) {
    const normalizedTermText = normalizeTechnicalTermText(term);
    return hasMixedTermAsciiBoundaryMatch(
      normalizedScriptText,
      normalizedTermText,
    );
  }

  const normalizedTermToken = normalizeTechnicalTermToken(term);
  if (!normalizedTermToken) {
    return false;
  }

  const termWords = splitTechnicalTermWords(term);
  if (termWords.length >= 2) {
    if (containsWordSequence(scriptTokens, termWords)) {
      return true;
    }
  }
  return scriptTokens.includes(normalizedTermToken);
}

function isHighRiskTechnicalTerm(term: string): boolean {
  const normalized = term.normalize("NFKC");
  return (
    /^[A-Z]{2,}$/.test(normalized) ||
    /[A-Z][a-z]+[A-Z]/.test(normalized) ||
    /\d/.test(normalized) ||
    /[-_./+]/.test(normalized)
  );
}

function hasRubyReadingForTerm(scriptText: string, term: string): boolean {
  const normalizedTerm = normalizeTechnicalTermText(term);
  if (!normalizedTerm) {
    return false;
  }
  for (const match of scriptText.matchAll(/\{\s*([^|{}]+?)\s*\|[^{}]+\}/gu)) {
    const surface = normalizeTechnicalTermText(match[1] || "");
    if (surface && surface === normalizedTerm) {
      return true;
    }
  }
  return false;
}

function findTextNotationVariants(params: {
  scriptText: string;
  normalizedScriptText: string;
  rawStartByNormalizedIndex: number[];
  rawEndByNormalizedIndex: number[];
  normalizedTermText: string;
  isMixed: boolean;
}): string[] {
  if (!params.normalizedTermText) {
    return [];
  }

  const variants = new Set<string>();
  let searchFrom = 0;
  for (;;) {
    const index = params.normalizedScriptText.indexOf(
      params.normalizedTermText,
      searchFrom,
    );
    if (index < 0) {
      break;
    }
    if (
      params.isMixed &&
      !isValidMixedTermBoundary(
        params.normalizedScriptText,
        index,
        params.normalizedTermText.length,
      )
    ) {
      searchFrom = index + 1;
      continue;
    }
    const endIndex = index + params.normalizedTermText.length - 1;
    const rawStart = params.rawStartByNormalizedIndex[index];
    const rawEnd = params.rawEndByNormalizedIndex[endIndex];
    if (rawStart !== undefined && rawEnd !== undefined && rawEnd > rawStart) {
      const rawVariant = params.scriptText.slice(rawStart, rawEnd).trim();
      if (rawVariant) {
        variants.add(rawVariant);
      }
    }
    searchFrom = index + 1;
  }
  return [...variants].sort((a, b) => a.localeCompare(b, "ja"));
}

function findNotationVariants(params: {
  scriptText: string;
  term: string;
  scriptTokenSpans: ScriptTokenSpan[];
  normalizedScriptText: string;
  rawStartByNormalizedIndex: number[];
  rawEndByNormalizedIndex: number[];
}): string[] {
  const variants = new Set<string>();
  const normalizedTarget = normalizeTechnicalTermToken(params.term);
  if (!normalizedTarget) {
    return [];
  }

  const isMixed = isMixedTechnicalTerm(params.term);
  if (isMixed) {
    return findTextNotationVariants({
      scriptText: params.scriptText,
      normalizedScriptText: params.normalizedScriptText,
      rawStartByNormalizedIndex: params.rawStartByNormalizedIndex,
      rawEndByNormalizedIndex: params.rawEndByNormalizedIndex,
      normalizedTermText: normalizeTechnicalTermText(params.term),
      isMixed,
    });
  }

  const termWords = splitTechnicalTermWords(params.term);
  if (termWords.length >= 2) {
    const spans = collectTokenSequenceSpans(params.scriptTokenSpans, termWords);
    for (const span of spans) {
      const rawVariant = params.scriptText.slice(span.start, span.end).trim();
      if (rawVariant) {
        variants.add(rawVariant);
      }
    }
  }

  for (const token of params.scriptTokenSpans) {
    if (token.normalized === normalizedTarget) {
      const rawVariant = token.raw.trim();
      if (rawVariant) {
        variants.add(rawVariant);
      }
    }
  }

  return [...variants].sort((a, b) => a.localeCompare(b, "ja"));
}

function evaluateCoverageAndVariants(params: {
  term: string;
  context: CoverageRuntimeContext;
}): CoverageVariantEval {
  const { term, context } = params;
  const isNonAsciiTerm = !hasAsciiAlphaNum(term);

  if (isNonAsciiTerm) {
    if (!context.morphTokenizer) {
      return { inScript: false, variants: [], skipped: true };
    }

    const termMorphTokens = tokenizeMorphTerm(term, context.morphTokenizer);
    const normalizedTarget = normalizeTechnicalTermToken(term);
    const nonAsciiMatchSpans = collectNonAsciiMorphMatchSpans({
      scriptText: context.scriptText,
      scriptMorphTokenSpans: context.scriptMorphTokenSpans,
      termMorphTokens,
      normalizedTarget,
    });
    const trimmedLongVowelTerm = term.endsWith("ー")
      ? term.slice(0, -1).trim()
      : "";
    const trimmedLongVowelMatchSpans =
      trimmedLongVowelTerm.length > 0
        ? collectNonAsciiMorphMatchSpans({
            scriptText: context.scriptText,
            scriptMorphTokenSpans: context.scriptMorphTokenSpans,
            termMorphTokens: tokenizeMorphTerm(
              trimmedLongVowelTerm,
              context.morphTokenizer,
            ),
            normalizedTarget: normalizeTechnicalTermToken(trimmedLongVowelTerm),
          })
        : [];
    const allMatchSpans = dedupeSpans([
      ...nonAsciiMatchSpans,
      ...trimmedLongVowelMatchSpans,
    ]);
    const inScript = allMatchSpans.length > 0;
    const variants = inScript
      ? collectNotationVariantsFromSpans(context.scriptText, allMatchSpans)
      : [];
    if (
      variants.length > 0 &&
      trimmedLongVowelMatchSpans.length > 0 &&
      nonAsciiMatchSpans.length === 0
    ) {
      variants.push(term);
      variants.sort((a, b) => a.localeCompare(b, "ja"));
    }
    return { inScript, variants, skipped: false };
  }

  const inScript = isTechnicalTermCoveredInScript(
    context.scriptTokens,
    context.normalizedScriptText,
    term,
  );
  const variants = inScript
    ? findNotationVariants({
        scriptText: context.scriptText,
        term,
        scriptTokenSpans: context.scriptTokenSpans,
        normalizedScriptText: context.normalizedScriptText,
        rawStartByNormalizedIndex: context.rawStartByNormalizedIndex,
        rawEndByNormalizedIndex: context.rawEndByNormalizedIndex,
      })
    : [];
  return { inScript, variants, skipped: false };
}

export function buildTechnicalTermsAuditReport(params: {
  episodeId: string;
  projectId: string;
  runId: string;
  episodePackPath: string;
  scriptPath: string;
  voicevoxTextPath?: string;
  technicalTerms: string[];
  scriptText: string;
  dictionarySurfaces: string[];
  highPriorityDictionarySurfaces: string[];
  candidatesWithoutReading: string[];
  dictionaryCoverageSkipped: boolean;
  userDictSurfaces: string[];
  userDictCoverageSkipped: boolean;
  morphTokenizer?: MorphTokenizer | null;
}): TechnicalTermsAuditReport {
  const scriptTokenSpans = tokenizeTechnicalMatchScript(params.scriptText);
  const scriptTokens = normalizedTokensFromSpans(scriptTokenSpans);
  const normalizedTextIndexMap = buildNormalizedTextIndexMap(params.scriptText);
  const normalizedScriptText = normalizedTextIndexMap.normalizedText;
  const scriptMorphTokenSpans = params.morphTokenizer
    ? tokenizeMorphScript(params.scriptText, params.morphTokenizer)
    : [];
  const coverageContext: CoverageRuntimeContext = {
    scriptText: params.scriptText,
    scriptTokenSpans,
    scriptTokens,
    normalizedScriptText,
    rawStartByNormalizedIndex: normalizedTextIndexMap.rawStartByNormalizedIndex,
    rawEndByNormalizedIndex: normalizedTextIndexMap.rawEndByNormalizedIndex,
    scriptMorphTokenSpans,
    morphTokenizer: params.morphTokenizer,
  };
  const normalizedDictionary = new Set(
    params.dictionarySurfaces.map((surface) =>
      normalizeTechnicalTermToken(surface),
    ),
  );
  const normalizedUserDict = new Set(
    params.userDictSurfaces.map((surface) =>
      normalizeTechnicalTermToken(surface),
    ),
  );
  const missingInScript: string[] = [];
  const missingInDictionaryCandidates: string[] = [];
  const unresolvedHighRiskTerms: string[] = [];
  const skippedNonAsciiTerms: string[] = [];
  const notationInconsistencies: TechnicalTermsAuditDetail[] = [];
  const highPriorityNotInUserDict: string[] = [];
  const candidatesWithoutReading: string[] = [];
  const warnings: string[] = [];
  let coveredTerms = 0;

  for (const term of params.technicalTerms) {
    const normalized = normalizeTechnicalTermToken(term);
    if (!normalized) {
      warnings.push(`Invalid technical term skipped: "${term}"`);
      continue;
    }

    const coverageEval = evaluateCoverageAndVariants({
      term,
      context: coverageContext,
    });
    if (coverageEval.skipped) {
      skippedNonAsciiTerms.push(term);
      continue;
    }

    const inScript = coverageEval.inScript;
    const variants = coverageEval.variants;
    if (!inScript) {
      missingInScript.push(term);
    } else {
      coveredTerms += 1;
      if (variants.length === 0) {
        warnings.push(
          `covered technical term has no notation variants: ${term}`,
        );
      }
      if (variants.length >= 2) {
        notationInconsistencies.push({ term, variants });
      }
    }

    if (!params.dictionaryCoverageSkipped) {
      if (!normalizedDictionary.has(normalized)) {
        missingInDictionaryCandidates.push(term);
      }
    }

    if (isHighRiskTechnicalTerm(term)) {
      const resolvedByRuby = hasRubyReadingForTerm(params.scriptText, term);
      const resolvedByDictionary =
        !params.dictionaryCoverageSkipped &&
        normalizedDictionary.has(normalized);
      if (!resolvedByRuby && !resolvedByDictionary) {
        unresolvedHighRiskTerms.push(term);
      }
    }
  }

  if (missingInScript.length > 0) {
    warnings.push(
      `technical_terms missing in script: ${missingInScript.join(", ")}`,
    );
  }
  if (
    !params.dictionaryCoverageSkipped &&
    missingInDictionaryCandidates.length > 0
  ) {
    warnings.push(
      `technical_terms missing in dictionary_candidates: ${missingInDictionaryCandidates.join(", ")}`,
    );
  }
  if (unresolvedHighRiskTerms.length > 0) {
    warnings.push(
      `high-risk technical_terms unresolved (ruby/dictionary): ${unresolvedHighRiskTerms.join(", ")}`,
    );
  }
  if (notationInconsistencies.length > 0) {
    warnings.push(
      `technical_terms notation inconsistencies: ${notationInconsistencies
        .map((item) => `${item.term} => [${item.variants.join(", ")}]`)
        .join("; ")}`,
    );
  }
  if (skippedNonAsciiTerms.length > 0) {
    warnings.push(
      `morphological tokenizer unavailable; skipped ${skippedNonAsciiTerms.length} non-ASCII term(s) — see audit report for details`,
    );
  }
  if (params.dictionaryCoverageSkipped) {
    warnings.push(
      "dictionary_candidates audit skipped because voicevox_text is missing or invalid",
    );
  }
  if (!params.dictionaryCoverageSkipped && !params.userDictCoverageSkipped) {
    const seenSurfaces = new Set<string>();
    for (const surface of params.highPriorityDictionarySurfaces) {
      const normalized = normalizeTechnicalTermToken(surface);
      if (!normalized || seenSurfaces.has(normalized)) {
        continue;
      }
      seenSurfaces.add(normalized);
      if (!normalizedUserDict.has(normalized)) {
        highPriorityNotInUserDict.push(surface);
      }
    }
  }
  if (highPriorityNotInUserDict.length > 0) {
    warnings.push(
      `high-priority dictionary_candidates not in user-dict: ${highPriorityNotInUserDict.join(", ")}`,
    );
  }
  if (!params.dictionaryCoverageSkipped) {
    const seenSurfaces = new Set<string>();
    for (const surface of params.candidatesWithoutReading) {
      const normalized = normalizeTechnicalTermToken(surface);
      if (!normalized || seenSurfaces.has(normalized)) {
        continue;
      }
      seenSurfaces.add(normalized);
      candidatesWithoutReading.push(surface);
    }
  }
  if (candidatesWithoutReading.length > 0) {
    warnings.push(
      `dictionary_candidates missing reading_or_empty (HIGH/MEDIUM): ${candidatesWithoutReading.join(", ")}`,
    );
  }

  const totalTerms = params.technicalTerms.length;
  const evaluatedTerms = totalTerms - skippedNonAsciiTerms.length;
  const coverageRatio = evaluatedTerms > 0 ? coveredTerms / evaluatedTerms : 1;
  return {
    schema_version: "1.0",
    meta: {
      project_id: params.projectId,
      run_id: params.runId,
      episode_id: params.episodeId,
      generated_at: new Date().toISOString(),
      source_episode_pack_path: params.episodePackPath,
      source_script_path: params.scriptPath,
      ...(params.voicevoxTextPath
        ? { source_voicevox_text_path: params.voicevoxTextPath }
        : {}),
    },
    summary: {
      total_terms: totalTerms,
      evaluated_terms: evaluatedTerms,
      covered_terms: coveredTerms,
      coverage_ratio: Number(coverageRatio.toFixed(4)),
      skipped_non_ascii_terms_count: skippedNonAsciiTerms.length,
      unresolved_high_risk_count: unresolvedHighRiskTerms.length,
      notation_inconsistency_count: notationInconsistencies.length,
      high_priority_not_in_user_dict_count: highPriorityNotInUserDict.length,
      candidates_without_reading_count: candidatesWithoutReading.length,
      warnings_count: warnings.length,
    },
    warnings,
    details: {
      missing_in_script: missingInScript,
      missing_in_dictionary_candidates: missingInDictionaryCandidates,
      unresolved_high_risk_terms: unresolvedHighRiskTerms,
      skipped_non_ascii_terms: skippedNonAsciiTerms,
      notation_inconsistencies: notationInconsistencies,
      high_priority_not_in_user_dict: highPriorityNotInUserDict,
      candidates_without_reading: candidatesWithoutReading,
    },
  };
}

export function collectTechnicalTermsFromEpisodePack(
  episodePack: {
    technical_terms?: Array<{ term?: string; note?: string }>;
  },
  episodeId: string,
  episodePackRef: string,
  warnings: string[],
): string[] {
  const terms = episodePack.technical_terms;
  if (!Array.isArray(terms)) {
    return [];
  }

  const unique = new Set<string>();
  for (const entry of terms) {
    const raw = entry?.term;
    const term = typeof raw === "string" ? raw.trim() : "";
    if (!term) {
      warnings.push(
        `${episodeId}: ${episodePackRef} has empty technical_terms entry; skipped`,
      );
      continue;
    }
    unique.add(term);
  }
  return [...unique].sort((a, b) => a.localeCompare(b, "ja"));
}

export async function writeTechnicalTermsAuditReports(params: {
  resolvedRunDir: string;
  projectId: string;
  runId: string;
  plannedEpisodeIds: string[];
  technicalTermsByEpisodeId: Map<string, string[]>;
  episodePackPathByEpisodeId: Map<string, string>;
  scriptPathByEpisodeId: Map<string, string>;
  scriptTextByEpisodeId: Map<string, string>;
  voicevoxTextPathByEpisodeId: Map<string, string>;
  warnings: string[];
  morphTokenizerOverride?: MorphTokenizer | null;
}): Promise<string[]> {
  const reportDir = path.join(
    params.resolvedRunDir,
    "reports",
    "technical_terms",
  );
  await mkdir(reportDir, { recursive: true });
  const userDictPath = path.resolve(
    process.cwd(),
    "configs/voice/voicevox/user-dict.json",
  );
  const userDictSchemaPath = path.resolve(
    process.cwd(),
    "schemas/user-dict.schema.json",
  );
  let userDictSurfaces: string[] = [];
  let userDictCoverageSkipped = false;
  try {
    const userDict = await loadJson<UserDictForCheckRun>(
      userDictPath,
      userDictSchemaPath,
    );
    userDictSurfaces = Array.isArray(userDict.words)
      ? userDict.words
          .map((word) => word.surface)
          .filter((surface): surface is string => typeof surface === "string")
      : [];
  } catch (error) {
    userDictCoverageSkipped = true;
    params.warnings.push(
      `user-dict coverage audit skipped: failed to load ${path.relative(process.cwd(), userDictPath) || "."} — ${(error as Error).message}`,
    );
  }

  const morphTokenizer =
    params.morphTokenizerOverride === undefined
      ? await getJapaneseMorphTokenizer()
      : params.morphTokenizerOverride;

  const reportPaths: string[] = [];

  for (const episodeId of params.plannedEpisodeIds) {
    const technicalTerms =
      params.technicalTermsByEpisodeId.get(episodeId) ?? [];

    const scriptText = params.scriptTextByEpisodeId.get(episodeId) ?? "";
    const scriptPath = params.scriptPathByEpisodeId.get(episodeId);
    const episodePackPath = params.episodePackPathByEpisodeId.get(episodeId);
    if (!scriptPath || !episodePackPath) {
      continue;
    }

    // Load voicevox_text directly for dictionary data
    let dictionarySurfaces: string[] = [];
    let highPriorityDictionarySurfaces: string[] = [];
    let candidatesWithoutReading: string[] = [];
    let dictionaryCoverageSkipped = true;
    let voicevoxTextPath: string | undefined;

    const vvTextFilePath = params.voicevoxTextPathByEpisodeId.get(episodeId);
    if (vvTextFilePath) {
      try {
        const voicevoxText = await loadJson<VoicevoxTextForCheckRun>(
          vvTextFilePath,
          SchemaPaths.voicevoxText,
        );
        dictionaryCoverageSkipped = false;
        voicevoxTextPath = `voicevox_text/${episodeId}_voicevox_text.json`;
        if (Array.isArray(voicevoxText.dictionary_candidates)) {
          dictionarySurfaces = voicevoxText.dictionary_candidates
            .map((c) => c.surface)
            .filter((s): s is string => typeof s === "string");
          highPriorityDictionarySurfaces = voicevoxText.dictionary_candidates
            .filter((c) => c.priority === "HIGH")
            .map((c) => c.surface)
            .filter((s): s is string => typeof s === "string");
          candidatesWithoutReading = voicevoxText.dictionary_candidates
            .filter(
              (c) =>
                (c.priority === "HIGH" || c.priority === "MEDIUM") &&
                typeof c.surface === "string" &&
                String(c.reading_or_empty ?? "").trim().length === 0,
            )
            .map((c) => c.surface)
            .filter((s): s is string => typeof s === "string");
        }
      } catch {
        params.warnings.push(
          `${episodeId}: voicevox_text load failed; dictionary coverage skipped`,
        );
      }
    }

    const report = buildTechnicalTermsAuditReport({
      episodeId,
      projectId: params.projectId,
      runId: params.runId,
      episodePackPath,
      scriptPath,
      voicevoxTextPath,
      technicalTerms,
      scriptText,
      dictionarySurfaces,
      highPriorityDictionarySurfaces,
      candidatesWithoutReading,
      dictionaryCoverageSkipped,
      userDictSurfaces,
      userDictCoverageSkipped,
      morphTokenizer,
    });
    const reportFileName = `${episodeId}_technical_terms_audit.json`;
    const reportPath = path.join(reportDir, reportFileName);
    await writeFile(
      reportPath,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf-8",
    );
    reportPaths.push(reportPath);
    if (report.warnings.length > 0) {
      for (const warning of report.warnings) {
        params.warnings.push(`${episodeId}: ${warning}`);
      }
      params.warnings.push(
        `${episodeId}: technical_terms audit report written to reports/technical_terms/${reportFileName} (coverage=${report.summary.covered_terms}/${report.summary.evaluated_terms})`,
      );
    }
  }

  return reportPaths;
}
