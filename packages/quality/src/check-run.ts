import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseSectionHeader } from "@narrative-vox/domain/script-structure.ts";
import {
  hasSpeakerTagPrefix,
  parseSpeakerTag,
} from "@narrative-vox/domain/speaker-tag.ts";
import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { loadRunContract } from "@narrative-vox/infrastructure/run-contract-io.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import { validateBuildPrerequisites } from "./build-prerequisites.ts";

const MATERIAL_FILE_RE = /^(E[0-9]{2})_material\.json$/;
const SCRIPT_FILE_RE = /^(E[0-9]{2})_script\.md$/;
const DIGEST_FILE_RE = /^(E[0-9]{2})_episode_digest\.json$/;

type SpeakerMode = "monologue" | "dialogue" | "panel";

export interface CheckRunOptions {
  runDir: string;
  synthesisDefaultsPath?: string;
  characterMapPath?: string;
  characterKey?: string;
  engineId?: string;
  speakerId?: string;
  styleId?: number;
  emotion?: string;
  voicevoxApiUrl?: string;
  speedPreset?: string;
  speedProfilesPath?: string;
}

export interface CheckRunResult {
  runDir: string;
  materialEpisodeCount: number;
  scriptEpisodeCount: number;
  validatedEpisodeIds: string[];
  warnings: string[];
}

interface BlueprintEpisodePlanItem {
  episode_id: string;
  prerequisite_episodes?: string[];
}

interface BlueprintForCheckRun {
  episode_plan: BlueprintEpisodePlanItem[];
}

interface EpisodeMaterialForCheckRun {
  meta: {
    project_id: string;
  };
  technical_terms?: Array<{
    term?: string;
    note?: string;
  }>;
}

interface ProjectConfigForCheckRun {
  STYLE_ID: string;
}

interface ContentStyleForCheckRun {
  style_id: string;
  format: {
    speaker_mode: SpeakerMode;
    speaker_count: number;
  };
}

interface VoicevoxTextForCheckRun {
  dictionary_candidates?: Array<{
    surface?: string;
  }>;
}

interface TechnicalTermsAuditDetail {
  term: string;
  variants: string[];
}

interface TechnicalTermsAuditReport {
  schema_version: "1.0";
  meta: {
    project_id: string;
    run_id: string;
    episode_id: string;
    generated_at: string;
    source_material_path: string;
    source_script_path: string;
    source_voicevox_text_path?: string;
  };
  summary: {
    total_terms: number;
    covered_terms: number;
    coverage_ratio: number;
    unresolved_high_risk_count: number;
    notation_inconsistency_count: number;
    warnings_count: number;
  };
  warnings: string[];
  details: {
    missing_in_script: string[];
    missing_in_dictionary_candidates: string[];
    unresolved_high_risk_terms: string[];
    notation_inconsistencies: TechnicalTermsAuditDetail[];
  };
}

function toRelativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || ".";
}

function collectEpisodeIds(fileNames: string[], pattern: RegExp): string[] {
  const episodeIds: string[] = [];
  for (const name of fileNames) {
    const match = name.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    episodeIds.push(match[1]);
  }
  return episodeIds.sort();
}

function diffEpisodes(baseIds: string[], compareIds: string[]): string[] {
  const compareSet = new Set(compareIds);
  return baseIds.filter((id) => !compareSet.has(id));
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath);
    return true;
  } catch {
    return false;
  }
}

// For token-level matching and dictionary surface comparison.
function normalizeTechnicalTermToken(term: string): string {
  return term
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[_./+\-]/g, " ")
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
    .replace(/[_./+\-]/g, " ")
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

interface NormalizedTextIndexMap {
  normalizedText: string;
  rawStartByNormalizedIndex: number[];
  rawEndByNormalizedIndex: number[];
}

const TECHNICAL_TOKEN_PATTERN =
  /[A-Za-z0-9Ａ-Ｚａ-ｚ０-９][A-Za-z0-9Ａ-Ｚａ-ｚ０-９_./+\-]*/g;
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

function normalizeTechnicalTextChar(char: string): string {
  if (TECHNICAL_TO_SPACE_CHARS.has(char) || /\s/.test(char)) {
    return " ";
  }
  return char;
}

function buildNormalizedTextIndexMap(scriptText: string): NormalizedTextIndexMap {
  const normalizedChars: string[] = [];
  const rawStartByNormalizedIndex: number[] = [];
  const rawEndByNormalizedIndex: number[] = [];
  let previousWasSpace = false;

  const clusters: Array<{ rawStart: number; rawEnd: number; text: string }> = [];
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

  while (normalizedChars.length > 0 && normalizedChars[normalizedChars.length - 1] === " ") {
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

function normalizedTokensFromSpans(scriptTokenSpans: ScriptTokenSpan[]): string[] {
  return scriptTokenSpans.map((token) => token.normalized);
}

function hasAsciiAlphaNum(value: string): boolean {
  return /[A-Za-z0-9]/.test(value.normalize("NFKC"));
}

function hasNonAsciiChar(value: string): boolean {
  return /[^\x00-\x7F]/.test(value.normalize("NFKC"));
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

function isTechnicalTermCoveredInScript(
  scriptTokens: string[],
  normalizedScriptText: string,
  term: string,
): boolean {
  if (isMixedTechnicalTerm(term)) {
    const normalizedTermText = normalizeTechnicalTermText(term);
    return normalizedTermText.length > 0 && normalizedScriptText.includes(normalizedTermText);
  }

  if (!hasAsciiAlphaNum(term)) {
    const normalizedTermText = normalizeTechnicalTermText(term);
    return normalizedTermText.length > 0 && normalizedScriptText.includes(normalizedTermText);
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
  // Allow joined notation for multi-word terms while keeping single-word terms strict.
  return scriptTokens.includes(normalizedTermToken);
}

function collectTechnicalTerms(
  material: EpisodeMaterialForCheckRun,
  episodeId: string,
  materialRef: string,
  warnings: string[],
): string[] {
  const terms = material.technical_terms;
  if (!Array.isArray(terms)) {
    return [];
  }

  const unique = new Set<string>();
  for (const entry of terms) {
    const raw = entry?.term;
    const term = typeof raw === "string" ? raw.trim() : "";
    if (!term) {
      warnings.push(
        `${episodeId}: ${materialRef} has empty technical_terms entry; skipped`,
      );
      continue;
    }
    unique.add(term);
  }
  return [...unique].sort((a, b) => a.localeCompare(b, "ja"));
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
}): string[] {
  if (!params.normalizedTermText) {
    return [];
  }

  const variants = new Set<string>();
  let searchFrom = 0;
  for (;;) {
    const index = params.normalizedScriptText.indexOf(params.normalizedTermText, searchFrom);
    if (index < 0) {
      break;
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

  if (isMixedTechnicalTerm(params.term) || !hasAsciiAlphaNum(params.term)) {
    return findTextNotationVariants({
      scriptText: params.scriptText,
      normalizedScriptText: params.normalizedScriptText,
      rawStartByNormalizedIndex: params.rawStartByNormalizedIndex,
      rawEndByNormalizedIndex: params.rawEndByNormalizedIndex,
      normalizedTermText: normalizeTechnicalTermText(params.term),
    });
  }

  const termWords = splitTechnicalTermWords(params.term);
  if (termWords.length >= 2) {
    for (let i = 0; i <= params.scriptTokenSpans.length - termWords.length; i++) {
      let matched = true;
      for (let j = 0; j < termWords.length; j++) {
        if (params.scriptTokenSpans[i + j]?.normalized !== termWords[j]) {
          matched = false;
          break;
        }
      }
      if (!matched) {
        continue;
      }
      const start = params.scriptTokenSpans[i]?.start;
      const end = params.scriptTokenSpans[i + termWords.length - 1]?.end;
      if (start === undefined || end === undefined || end <= start) {
        continue;
      }
      const rawVariant = params.scriptText.slice(start, end).trim();
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

function buildTechnicalTermsAuditReport(params: {
  episodeId: string;
  projectId: string;
  runId: string;
  materialPath: string;
  scriptPath: string;
  voicevoxTextPath?: string;
  technicalTerms: string[];
  scriptText: string;
  dictionarySurfaces: string[];
  dictionaryCoverageSkipped: boolean;
}): TechnicalTermsAuditReport {
  const scriptTokenSpans = tokenizeTechnicalMatchScript(params.scriptText);
  const scriptTokens = normalizedTokensFromSpans(scriptTokenSpans);
  const normalizedTextIndexMap = buildNormalizedTextIndexMap(params.scriptText);
  const normalizedScriptText = normalizedTextIndexMap.normalizedText;
  const normalizedDictionary = new Set(
    params.dictionarySurfaces.map((surface) =>
      normalizeTechnicalTermToken(surface),
    ),
  );
  const dictionaryCoverageSkipped = params.dictionaryCoverageSkipped;
  const missingInScript: string[] = [];
  const missingInDictionaryCandidates: string[] = [];
  const unresolvedHighRiskTerms: string[] = [];
  const notationInconsistencies: TechnicalTermsAuditDetail[] = [];
  const warnings: string[] = [];
  let coveredTerms = 0;

  for (const term of params.technicalTerms) {
    const normalized = normalizeTechnicalTermToken(term);
    if (!normalized) {
      warnings.push(`Invalid technical term skipped: "${term}"`);
      continue;
    }

    const inScript = isTechnicalTermCoveredInScript(
      scriptTokens,
      normalizedScriptText,
      term,
    );
    if (!inScript) {
      missingInScript.push(term);
    } else {
      coveredTerms += 1;
      const variants = findNotationVariants({
        scriptText: params.scriptText,
        term,
        scriptTokenSpans,
        normalizedScriptText,
        rawStartByNormalizedIndex:
          normalizedTextIndexMap.rawStartByNormalizedIndex,
        rawEndByNormalizedIndex: normalizedTextIndexMap.rawEndByNormalizedIndex,
      });
      if (variants.length === 0) {
        warnings.push(`covered technical term has no notation variants: ${term}`);
      }
      if (variants.length >= 2) {
        notationInconsistencies.push({ term, variants });
      }
    }

    if (!dictionaryCoverageSkipped) {
      const inDictionary = normalizedDictionary.has(normalized);
      if (!inDictionary) {
        missingInDictionaryCandidates.push(term);
      }
    }

    if (isHighRiskTechnicalTerm(term)) {
      const resolvedByRuby = hasRubyReadingForTerm(params.scriptText, term);
      const resolvedByDictionary =
        !dictionaryCoverageSkipped && normalizedDictionary.has(normalized);
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
  if (!dictionaryCoverageSkipped && missingInDictionaryCandidates.length > 0) {
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
  if (dictionaryCoverageSkipped) {
    warnings.push(
      "dictionary_candidates audit skipped because voicevox_text is missing or invalid",
    );
  }

  const totalTerms = params.technicalTerms.length;
  const coverageRatio = totalTerms > 0 ? coveredTerms / totalTerms : 1;
  return {
    schema_version: "1.0",
    meta: {
      project_id: params.projectId,
      run_id: params.runId,
      episode_id: params.episodeId,
      generated_at: new Date().toISOString(),
      source_material_path: params.materialPath,
      source_script_path: params.scriptPath,
      ...(params.voicevoxTextPath
        ? { source_voicevox_text_path: params.voicevoxTextPath }
        : {}),
    },
    summary: {
      total_terms: totalTerms,
      covered_terms: coveredTerms,
      coverage_ratio: Number(coverageRatio.toFixed(4)),
      unresolved_high_risk_count: unresolvedHighRiskTerms.length,
      notation_inconsistency_count: notationInconsistencies.length,
      warnings_count: warnings.length,
    },
    warnings,
    details: {
      missing_in_script: missingInScript,
      missing_in_dictionary_candidates: missingInDictionaryCandidates,
      unresolved_high_risk_terms: unresolvedHighRiskTerms,
      notation_inconsistencies: notationInconsistencies,
    },
  };
}

function ensureMinimalScriptStructure(
  scriptText: string,
  scriptPath: string,
  episodeId: string,
): void {
  const scriptRef = `${toRelativePath(scriptPath)} (episode: ${episodeId})`;
  if (scriptText.trim().length === 0) {
    throw new Error(`${scriptRef} is empty`);
  }
  let hasSectionHeading = false;
  for (const line of scriptText.split(/\r?\n/)) {
    if (parseSectionHeader(line)) {
      hasSectionHeading = true;
      break;
    }
  }
  if (!hasSectionHeading) {
    throw new Error(
      `${scriptRef} has no section headings (expected "## N. Title" format)`,
    );
  }
}

function validateScriptSpeakerStructure(
  scriptText: string,
  scriptPath: string,
  episodeId: string,
  contentStyle: ContentStyleForCheckRun,
): void {
  const scriptRef = `${toRelativePath(scriptPath)} (episode: ${episodeId})`;
  const speakerKeys = new Set<string>();
  const lines = scriptText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim().length === 0) {
      continue;
    }
    if (parseSectionHeader(line)) {
      continue;
    }

    const speakerTag = parseSpeakerTag(line);
    if (!speakerTag) {
      if (hasSpeakerTagPrefix(line)) {
        throw new Error(
          `${scriptRef}:${i + 1} has invalid [speaker:<key>] format for style "${contentStyle.style_id}" (${contentStyle.format.speaker_mode})`,
        );
      }
      throw new Error(
        `${scriptRef}:${i + 1} requires [speaker:<key>] at line start for style "${contentStyle.style_id}" (${contentStyle.format.speaker_mode})`,
      );
    }

    speakerKeys.add(speakerTag.speakerKey);
  }

  const mode = contentStyle.format.speaker_mode;
  const count = contentStyle.format.speaker_count;
  if (mode === "panel") {
    if (speakerKeys.size < 2 || speakerKeys.size > count) {
      const speakerList = [...speakerKeys].sort().join(", ") || "(none)";
      throw new Error(
        `${scriptRef} has ${speakerKeys.size} unique speaker keys (${speakerList}), but style "${contentStyle.style_id}" (panel) requires 2..${count} speakers for panel mode`,
      );
    }
  } else {
    if (speakerKeys.size !== count) {
      const speakerList = [...speakerKeys].sort().join(", ") || "(none)";
      throw new Error(
        `${scriptRef} has ${speakerKeys.size} unique speaker keys (${speakerList}), but style "${contentStyle.style_id}" (${mode}) requires speaker_count=${count}`,
      );
    }
  }
}

function findEpisodeDependencyCycle(
  dependencies: Map<string, string[]>,
): string[] | undefined {
  const visitState = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (episodeId: string): string[] | undefined => {
    const state = visitState.get(episodeId) ?? 0;
    if (state === 1) {
      const cycleStart = stack.indexOf(episodeId);
      if (cycleStart >= 0) {
        return [...stack.slice(cycleStart), episodeId];
      }
      return [episodeId, episodeId];
    }
    if (state === 2) {
      return undefined;
    }

    visitState.set(episodeId, 1);
    stack.push(episodeId);

    for (const dependencyId of dependencies.get(episodeId) ?? []) {
      const cycle = visit(dependencyId);
      if (cycle) {
        return cycle;
      }
    }

    stack.pop();
    visitState.set(episodeId, 2);
    return undefined;
  };

  for (const episodeId of dependencies.keys()) {
    const cycle = visit(episodeId);
    if (cycle) {
      return cycle;
    }
  }

  return undefined;
}

function validateEpisodePrerequisites(
  blueprint: BlueprintForCheckRun,
  blueprintPath: string,
): void {
  const episodeIds = blueprint.episode_plan.map(
    (episode) => episode.episode_id,
  );
  const episodeIdSet = new Set(episodeIds);
  const dependencies = new Map<string, string[]>();

  for (const episode of blueprint.episode_plan) {
    const prerequisites = episode.prerequisite_episodes ?? [];
    const seen = new Set<string>();
    const duplicatePrerequisites: string[] = [];
    const missingEpisodeIds: string[] = [];

    for (const prerequisiteEpisodeId of prerequisites) {
      if (seen.has(prerequisiteEpisodeId)) {
        duplicatePrerequisites.push(prerequisiteEpisodeId);
      } else {
        seen.add(prerequisiteEpisodeId);
      }

      if (prerequisiteEpisodeId === episode.episode_id) {
        throw new Error(
          `${toRelativePath(
            blueprintPath,
          )}: episode_plan "${episode.episode_id}" cannot list itself in prerequisite_episodes`,
        );
      }

      if (!episodeIdSet.has(prerequisiteEpisodeId)) {
        missingEpisodeIds.push(prerequisiteEpisodeId);
      }
    }

    if (duplicatePrerequisites.length > 0) {
      const duplicateList = [...new Set(duplicatePrerequisites)].join(", ");
      throw new Error(
        `${toRelativePath(
          blueprintPath,
        )}: episode_plan "${episode.episode_id}" has duplicate prerequisite_episodes: ${duplicateList}`,
      );
    }

    if (missingEpisodeIds.length > 0) {
      const missingList = [...new Set(missingEpisodeIds)].join(", ");
      throw new Error(
        `${toRelativePath(
          blueprintPath,
        )}: episode_plan "${episode.episode_id}" references missing prerequisite_episodes: ${missingList}`,
      );
    }

    dependencies.set(episode.episode_id, prerequisites);
  }

  const cycle = findEpisodeDependencyCycle(dependencies);
  if (cycle) {
    throw new Error(
      `${toRelativePath(blueprintPath)}: episode_plan prerequisite_episodes has a cycle: ${cycle.join(" -> ")}`,
    );
  }
}

export async function checkRun({
  runDir,
  synthesisDefaultsPath,
  characterMapPath,
  characterKey,
  engineId,
  speakerId,
  styleId,
  emotion,
  voicevoxApiUrl,
  speedPreset,
  speedProfilesPath,
}: CheckRunOptions): Promise<CheckRunResult> {
  const resolvedRunDir = path.resolve(runDir);
  const runId = path.basename(resolvedRunDir);
  const warnings: string[] = [];

  // 0. RunContract validation (warn if missing, error if invalid)
  const runContractPath = path.join(resolvedRunDir, "run-contract.json");
  if (await dirExists(runContractPath)) {
    await loadRunContract(resolvedRunDir); // throws on schema error
  } else {
    warnings.push(
      "run-contract.json not found (run may predate RunContract support)",
    );
  }

  // 1. Blueprint validation
  const blueprintPath = path.join(
    resolvedRunDir,
    "blueprint",
    "project_blueprint.json",
  );
  const blueprint = await loadJson<BlueprintForCheckRun>(
    blueprintPath,
    SchemaPaths.blueprint,
  );
  validateEpisodePrerequisites(blueprint, blueprintPath);

  // 2. Material validation
  const materialDir = path.join(resolvedRunDir, "material");
  const materialFiles = (await readdir(materialDir))
    .filter((name) => MATERIAL_FILE_RE.test(name))
    .sort();
  if (materialFiles.length === 0) {
    throw new Error(
      `${toRelativePath(materialDir)} has no E##_material.json files`,
    );
  }
  const materialEpisodeIds = collectEpisodeIds(materialFiles, MATERIAL_FILE_RE);
  const materialProjectIds = new Set<string>();
  const materialPathByEpisodeId = new Map<string, string>();
  const technicalTermsByEpisodeId = new Map<string, string[]>();
  for (const fileName of materialFiles) {
    const filePath = path.join(materialDir, fileName);
    const episodeId = fileName.replace("_material.json", "");
    const material = await loadJson<EpisodeMaterialForCheckRun>(
      filePath,
      SchemaPaths.episodeMaterial,
    );
    const materialRef = `material/${fileName}`;
    materialPathByEpisodeId.set(episodeId, materialRef);
    technicalTermsByEpisodeId.set(
      episodeId,
      collectTechnicalTerms(material, episodeId, materialRef, warnings),
    );
    materialProjectIds.add(material.meta.project_id);
  }

  if (materialProjectIds.size !== 1) {
    throw new Error(
      `${toRelativePath(materialDir)} has inconsistent project_id values: ${[
        ...materialProjectIds,
      ].join(", ")}`,
    );
  }
  const [projectId] = [...materialProjectIds];
  if (!projectId) {
    throw new Error(
      `${toRelativePath(materialDir)} has no project_id in material metadata`,
    );
  }

  // 2.5 Project config + content style validation
  const projectConfigPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.json`,
  );
  if (!(await dirExists(projectConfigPath))) {
    throw new Error(
      `Project config not found for project_id "${projectId}": ${toRelativePath(
        projectConfigPath,
      )}`,
    );
  }
  const projectConfig = await loadJson<ProjectConfigForCheckRun>(
    projectConfigPath,
    SchemaPaths.projectConfig,
  );
  const styleConfigId = projectConfig.STYLE_ID;
  const stylePath = path.resolve(
    "configs",
    "content",
    "styles",
    `${styleConfigId}.json`,
  );
  if (!(await dirExists(stylePath))) {
    throw new Error(
      `Style definition not found for STYLE_ID "${styleConfigId}": ${toRelativePath(
        stylePath,
      )}`,
    );
  }
  const contentStyle = await loadJson<ContentStyleForCheckRun>(
    stylePath,
    SchemaPaths.contentStyle,
  );
  if (contentStyle.style_id !== styleConfigId) {
    throw new Error(
      `${toRelativePath(
        stylePath,
      )}: style_id "${contentStyle.style_id}" does not match STYLE_ID "${styleConfigId}"`,
    );
  }

  // 3. Script validation (minimal structure)
  const scriptDir = path.join(resolvedRunDir, "script");
  const scriptFiles = (await readdir(scriptDir))
    .filter((name) => SCRIPT_FILE_RE.test(name))
    .sort();
  if (scriptFiles.length === 0) {
    throw new Error(`${toRelativePath(scriptDir)} has no E##_script.md files`);
  }
  const scriptPaths: string[] = [];
  const scriptPathByEpisodeId = new Map<string, string>();
  const scriptTextByEpisodeId = new Map<string, string>();
  const scriptEpisodeIds = collectEpisodeIds(scriptFiles, SCRIPT_FILE_RE);
  for (const fileName of scriptFiles) {
    const match = fileName.match(SCRIPT_FILE_RE);
    const episodeId = match?.[1];
    if (!episodeId) {
      continue;
    }
    const filePath = path.join(scriptDir, fileName);
    scriptPaths.push(filePath);
    const scriptText = await readFile(filePath, "utf-8");
    scriptPathByEpisodeId.set(episodeId, `script/${fileName}`);
    scriptTextByEpisodeId.set(episodeId, scriptText);
    ensureMinimalScriptStructure(scriptText, filePath, episodeId);
    validateScriptSpeakerStructure(
      scriptText,
      filePath,
      episodeId,
      contentStyle,
    );
  }

  // 4. Material ↔ Script episode matching
  const missingInScript = diffEpisodes(materialEpisodeIds, scriptEpisodeIds);
  if (missingInScript.length > 0) {
    throw new Error(
      `script is missing scripts for episodes: ${missingInScript.join(", ")}`,
    );
  }

  const extraInScript = diffEpisodes(scriptEpisodeIds, materialEpisodeIds);
  if (extraInScript.length > 0) {
    throw new Error(
      `script has episodes not in material: ${extraInScript.join(", ")}`,
    );
  }

  // 5. Digest validation (optional — exists → validate)
  const contextDir = path.join(resolvedRunDir, "context");
  if (await dirExists(contextDir)) {
    const contextFiles = (await readdir(contextDir))
      .filter((name) => DIGEST_FILE_RE.test(name))
      .sort();
    for (const fileName of contextFiles) {
      const filePath = path.join(contextDir, fileName);
      const digest = await loadJson<{ episode_id?: string }>(
        filePath,
        SchemaPaths.episodeDigest,
      );
      const match = fileName.match(DIGEST_FILE_RE);
      const fileEpisodeId = match?.[1];
      if (
        fileEpisodeId &&
        digest.episode_id &&
        digest.episode_id !== fileEpisodeId
      ) {
        throw new Error(
          `${toRelativePath(filePath)}: episode_id "${digest.episode_id}" does not match filename "${fileEpisodeId}"`,
        );
      }
    }

    // Warn if E(N≥2) is missing E(N-1) digest
    for (const episodeId of materialEpisodeIds) {
      const episodeNum = Number.parseInt(episodeId.slice(1), 10);
      if (episodeNum >= 2) {
        const prevEpisodeId = `E${String(episodeNum - 1).padStart(2, "0")}`;
        const prevDigestFile = `${prevEpisodeId}_episode_digest.json`;
        const prevDigestPath = path.join(contextDir, prevDigestFile);
        if (!(await dirExists(prevDigestPath))) {
          warnings.push(
            `${episodeId}: prior digest ${prevDigestFile} not found (continuity may be limited)`,
          );
        }
      }
    }
  }

  // 6. Build prerequisites
  await validateBuildPrerequisites({
    scriptPaths,
    synthesisDefaultsPath,
    characterMapPath,
    characterKey,
    engineId,
    speakerId,
    styleId,
    emotion,
    voicevoxApiUrl,
    speedPreset,
    speedProfilesPath,
  });

  // 7. Layer 2 validation (warn-only — files may not exist yet)
  const VOICEVOX_TEXT_FILE_RE = /^(E[0-9]{2})_voicevox_text\.json$/;
  const voicevoxTextDir = path.join(resolvedRunDir, "voicevox_text");
  const dictionarySurfacesByEpisodeId = new Map<string, string[]>();
  const validVoicevoxTextByEpisodeId = new Set<string>();
  if (await dirExists(voicevoxTextDir)) {
    const textFiles = (await readdir(voicevoxTextDir))
      .filter((name) => VOICEVOX_TEXT_FILE_RE.test(name))
      .sort();
    for (const fileName of textFiles) {
      const filePath = path.join(voicevoxTextDir, fileName);
      const episodeId = fileName.replace("_voicevox_text.json", "");
      try {
        const voicevoxText = await loadJson<VoicevoxTextForCheckRun>(
          filePath,
          SchemaPaths.voicevoxText,
        );
        const surfaces = Array.isArray(voicevoxText.dictionary_candidates)
          ? voicevoxText.dictionary_candidates
              .map((candidate) => candidate.surface)
              .filter((surface): surface is string => typeof surface === "string")
          : [];
        dictionarySurfacesByEpisodeId.set(episodeId, surfaces);
        validVoicevoxTextByEpisodeId.add(episodeId);
      } catch (e) {
        warnings.push(
          `voicevox_text/${fileName}: schema validation failed — ${(e as Error).message}`,
        );
      }
    }
  }

  const VVPROJ_META_RE = /^(E[0-9]{2})_voicevox_project_meta\.json$/;
  const voicevoxProjectDir = path.join(resolvedRunDir, "voicevox_project");
  if (await dirExists(voicevoxProjectDir)) {
    const metaFiles = (await readdir(voicevoxProjectDir))
      .filter((name) => VVPROJ_META_RE.test(name))
      .sort();
    for (const fileName of metaFiles) {
      const filePath = path.join(voicevoxProjectDir, fileName);
      try {
        await loadJson(filePath, SchemaPaths.voicevoxProjectMeta);
      } catch (e) {
        warnings.push(
          `voicevox_project/${fileName}: schema validation failed — ${(e as Error).message}`,
        );
      }
    }
  }

  // 8. technical_terms audit (warn-only)
  const contextDirForAudit = path.join(resolvedRunDir, "context");
  await mkdir(contextDirForAudit, { recursive: true });
  for (const episodeId of materialEpisodeIds) {
    const technicalTerms = technicalTermsByEpisodeId.get(episodeId) ?? [];
    if (technicalTerms.length === 0) {
      continue;
    }

    const scriptText = scriptTextByEpisodeId.get(episodeId) ?? "";
    const scriptPath = scriptPathByEpisodeId.get(episodeId);
    const materialPath = materialPathByEpisodeId.get(episodeId);
    if (!scriptPath || !materialPath) {
      continue;
    }

    const dictionarySurfaces = dictionarySurfacesByEpisodeId.get(episodeId) ?? [];
    const hasValidVoicevoxText = validVoicevoxTextByEpisodeId.has(episodeId);
    const voicevoxTextPath = hasValidVoicevoxText
      ? `voicevox_text/${episodeId}_voicevox_text.json`
      : undefined;
    const report = buildTechnicalTermsAuditReport({
      episodeId,
      projectId,
      runId,
      materialPath,
      scriptPath,
      voicevoxTextPath,
      technicalTerms,
      scriptText,
      dictionarySurfaces,
      dictionaryCoverageSkipped: !hasValidVoicevoxText,
    });
    const reportFileName = `${episodeId}_technical_terms_audit.json`;
    const reportPath = path.join(contextDirForAudit, reportFileName);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
    if (report.warnings.length > 0) {
      for (const warning of report.warnings) {
        warnings.push(`${episodeId}: ${warning}`);
      }
      warnings.push(
        `${episodeId}: technical_terms audit report written to context/${reportFileName} (coverage=${report.summary.covered_terms}/${report.summary.total_terms})`,
      );
    }
  }

  return {
    runDir: resolvedRunDir,
    materialEpisodeCount: materialEpisodeIds.length,
    scriptEpisodeCount: scriptEpisodeIds.length,
    validatedEpisodeIds: materialEpisodeIds,
    warnings,
  };
}
