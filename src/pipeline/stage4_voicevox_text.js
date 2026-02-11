import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateAgainstSchema } from "../quality/schema_validator.js";

const SECTION_RE = /^\s*([1-8])\.\s+(.+)$/;
const TOTAL_TIME_RE = /^\s*合計想定時間\s*:/;
const DURATION_SUFFIX_RE = /\(想定:\s*[0-9.]+分\)\s*$/;
const SILENCE_TAG_RE = /\[[0-9]+秒沈黙\]/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const RUBY_RE = /\{([^|{}]+)\|([^{}]+)\}/g;
const RUN_ID_RE = /^run-\d{8}-\d{4}$/;

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
      map.set(surface, { reading, occurrences: 1, source: "ruby" });
      continue;
    }

    current.occurrences += 1;
    if (!current.reading) {
      current.reading = reading;
    }
  }
}

export function replaceRubyWithReading(text) {
  return text.replace(RUBY_RE, (_, _surface, reading) => reading);
}

export function collectTermCandidates(text, map) {
  const tokenSets = [
    text.match(/\b[A-Za-z][A-Za-z0-9_.+-]{1,}\b/g) ?? [],
    text.match(/[ァ-ヴー]{4,}/g) ?? []
  ];

  for (const token of tokenSets.flat()) {
    const surface = token.trim();
    if (surface.length < 2) {
      continue;
    }

    const current = map.get(surface);
    if (!current) {
      map.set(surface, { reading: "", occurrences: 1, source: "token" });
      continue;
    }

    current.occurrences += 1;
  }
}

export function priorityForCandidate(candidate) {
  if (candidate.reading) {
    return "HIGH";
  }
  if (candidate.occurrences >= 3) {
    return "HIGH";
  }
  if (candidate.occurrences >= 2) {
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
      note: info.reading ? "ruby_from_script" : "auto_detected"
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
      collectTermCandidates(sentence, termCandidates);
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
