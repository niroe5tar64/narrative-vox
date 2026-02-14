import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateAgainstSchema } from "../quality/schema_validator.ts";
import { SchemaPaths } from "../shared/schema_paths.ts";
import type { VoicevoxTextData } from "../shared/types.ts";
import { loadJson } from "../shared/json.ts";
import {
  RawVoiceProfile,
  VoiceProfile,
  normalizeVoiceProfile
} from "../shared/voice_profile.ts";

interface ProjectMora {
  text: string;
  vowel: string;
  vowelLength: number;
  pitch: number;
  consonant?: string;
  consonantLength?: number;
}

interface ProjectAccentPhrase {
  moras: ProjectMora[];
  accent: number;
  pauseMora?: ProjectMora;
  isInterrogative?: boolean;
}

interface ProjectAudioQuery {
  accentPhrases: ProjectAccentPhrase[];
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  pauseLengthScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number | "engineDefault";
  outputStereo: boolean;
  kana?: string;
}

interface ProjectAudioItem {
  text: string;
  voice: {
    engineId: string;
    speakerId: string;
    styleId: number;
  };
  query?: ProjectAudioQuery;
}

interface EngineMoraLike {
  text?: unknown;
  vowel?: unknown;
  vowelLength?: unknown;
  vowel_length?: unknown;
  pitch?: unknown;
  consonant?: unknown;
  consonantLength?: unknown;
  consonant_length?: unknown;
}

interface EngineAccentPhraseLike {
  moras?: unknown;
  accent?: unknown;
  pauseMora?: unknown;
  pause_mora?: unknown;
  isInterrogative?: unknown;
  is_interrogative?: unknown;
}

interface EngineAudioQueryLike {
  accentPhrases?: unknown;
  accent_phrases?: unknown;
  speedScale?: unknown;
  pitchScale?: unknown;
  intonationScale?: unknown;
  volumeScale?: unknown;
  pauseLengthScale?: unknown;
  prePhonemeLength?: unknown;
  postPhonemeLength?: unknown;
  outputSamplingRate?: unknown;
  outputStereo?: unknown;
  kana?: unknown;
}

type QueryPrefillMode = "none" | "minimal" | "engine";
const DEFAULT_VOICEVOX_API_URL = "http://127.0.0.1:50021";

interface BuildProjectOptions {
  voicevoxTextJsonPath: string;
  runDir?: string;
  profilePath?: string;
  engineId?: string;
  speakerId?: string;
  styleId?: number;
  appVersion?: string;
  prefillQuery?: string;
  voicevoxApiUrl?: string;
}

interface BuildProjectResult {
  importJsonPath: string;
  vvprojPath: string;
  audioItemCount: number;
  episodeId: string;
}

const MIN_VOICEVOX_PROJECT_APP_VERSION = "0.25.0";

function toAudioKey(episodeId: string, utteranceId: string): string {
  return `${episodeId}_${utteranceId}`;
}

async function resolveProfilePath(profilePath?: string): Promise<string> {
  if (profilePath) {
    return path.resolve(profilePath);
  }

  const localDefault = path.resolve("configs/voicevox/default_profile.json");
  try {
    await access(localDefault);
    return localDefault;
  } catch {
    return path.resolve("configs/voicevox/default_profile.example.json");
  }
}

function inferRunDirFromVoicevoxTextJsonPath(voicevoxTextJsonPath: string): string | undefined {
  const voicevoxTextDir = path.dirname(path.resolve(voicevoxTextJsonPath));
  if (path.basename(voicevoxTextDir) !== "voicevox_text") {
    return undefined;
  }
  return path.dirname(voicevoxTextDir);
}

function normalizeQueryPrefillMode(mode?: string): QueryPrefillMode {
  if (!mode || mode === "none") {
    return "none";
  }
  if (mode === "minimal") {
    return "minimal";
  }
  if (mode === "engine") {
    return "engine";
  }
  throw new Error(`Invalid --prefill-query: ${mode}. Expected one of: none, minimal, engine`);
}

function normalizeVoicevoxApiUrl(value?: string): string {
  const url = (value || DEFAULT_VOICEVOX_API_URL).trim();
  if (!url) {
    return DEFAULT_VOICEVOX_API_URL;
  }
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function parseSemver(value: string): [number, number, number] | undefined {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(a: string, b: string): number {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);
  if (!parsedA || !parsedB) {
    return 0;
  }

  for (let i = 0; i < 3; i += 1) {
    if (parsedA[i] !== parsedB[i]) {
      return parsedA[i] - parsedB[i];
    }
  }
  return 0;
}

function normalizeProjectAppVersion(value?: string): string {
  if (!value) {
    return MIN_VOICEVOX_PROJECT_APP_VERSION;
  }
  if (compareSemver(value, MIN_VOICEVOX_PROJECT_APP_VERSION) < 0) {
    return MIN_VOICEVOX_PROJECT_APP_VERSION;
  }
  return value;
}

function toPostPhonemeLength(
  defaultPostPhonemeLength: number,
  pauseLengthMs?: number
): number {
  if (typeof pauseLengthMs !== "number" || !Number.isFinite(pauseLengthMs)) {
    return defaultPostPhonemeLength;
  }

  const fromPause = Math.max(0, Math.round(pauseLengthMs) / 1000);
  return Math.max(defaultPostPhonemeLength, fromPause);
}

function buildMinimalQuery(profile: VoiceProfile, pauseLengthMs?: number): ProjectAudioQuery {
  const defaults = profile.queryDefaults;
  return {
    accentPhrases: [],
    speedScale: defaults.speedScale,
    pitchScale: defaults.pitchScale,
    intonationScale: defaults.intonationScale,
    volumeScale: defaults.volumeScale,
    pauseLengthScale: defaults.pauseLengthScale,
    prePhonemeLength: defaults.prePhonemeLength,
    postPhonemeLength: toPostPhonemeLength(defaults.postPhonemeLength, pauseLengthMs),
    outputSamplingRate: defaults.outputSamplingRate,
    outputStereo: defaults.outputStereo
  };
}

function applyQueryDefaults(
  query: ProjectAudioQuery,
  profile: VoiceProfile,
  pauseLengthMs?: number
): ProjectAudioQuery {
  const defaults = profile.queryDefaults;
  return {
    ...query,
    speedScale: defaults.speedScale,
    pitchScale: defaults.pitchScale,
    intonationScale: defaults.intonationScale,
    volumeScale: defaults.volumeScale,
    pauseLengthScale: defaults.pauseLengthScale,
    prePhonemeLength: defaults.prePhonemeLength,
    postPhonemeLength: toPostPhonemeLength(defaults.postPhonemeLength, pauseLengthMs),
    outputSamplingRate: defaults.outputSamplingRate,
    outputStereo: defaults.outputStereo
  };
}

function normalizeEngineMora(raw: EngineMoraLike): ProjectMora {
  const vowelLength = raw.vowelLength ?? raw.vowel_length;
  const consonantLength = raw.consonantLength ?? raw.consonant_length;
  return {
    text: String(raw.text ?? ""),
    vowel: String(raw.vowel ?? ""),
    vowelLength: typeof vowelLength === "number" ? vowelLength : 0,
    pitch: typeof raw.pitch === "number" ? raw.pitch : 0,
    ...(typeof raw.consonant === "string" ? { consonant: raw.consonant } : {}),
    ...(typeof consonantLength === "number" ? { consonantLength } : {})
  };
}

function normalizeEngineAccentPhrase(raw: EngineAccentPhraseLike): ProjectAccentPhrase {
  const pauseMora = raw.pauseMora ?? raw.pause_mora;
  const mapped: ProjectAccentPhrase = {
    moras: Array.isArray(raw.moras)
      ? raw.moras.map((mora) => normalizeEngineMora((mora ?? {}) as EngineMoraLike))
      : [],
    accent: typeof raw.accent === "number" ? raw.accent : 1,
    ...(typeof raw.isInterrogative === "boolean"
      ? { isInterrogative: raw.isInterrogative }
      : typeof raw.is_interrogative === "boolean"
        ? { isInterrogative: raw.is_interrogative }
        : {})
  };
  if (pauseMora && typeof pauseMora === "object") {
    mapped.pauseMora = normalizeEngineMora(pauseMora as EngineMoraLike);
  }
  return mapped;
}

function normalizeAudioQueryResponse(raw: EngineAudioQueryLike): ProjectAudioQuery {
  const accentSource = raw.accentPhrases ?? raw.accent_phrases;
  const accentPhrases = Array.isArray(accentSource)
    ? accentSource.map((phrase) =>
        normalizeEngineAccentPhrase((phrase ?? {}) as EngineAccentPhraseLike)
      )
    : [];
  return {
    accentPhrases,
    speedScale: typeof raw.speedScale === "number" ? raw.speedScale : 1,
    pitchScale: typeof raw.pitchScale === "number" ? raw.pitchScale : 0,
    intonationScale: typeof raw.intonationScale === "number" ? raw.intonationScale : 1,
    volumeScale: typeof raw.volumeScale === "number" ? raw.volumeScale : 1,
    pauseLengthScale: typeof raw.pauseLengthScale === "number" ? raw.pauseLengthScale : 1,
    prePhonemeLength: typeof raw.prePhonemeLength === "number" ? raw.prePhonemeLength : 0.1,
    postPhonemeLength: typeof raw.postPhonemeLength === "number" ? raw.postPhonemeLength : 0.1,
    outputSamplingRate:
      typeof raw.outputSamplingRate === "number" || raw.outputSamplingRate === "engineDefault"
        ? raw.outputSamplingRate
        : "engineDefault",
    outputStereo: typeof raw.outputStereo === "boolean" ? raw.outputStereo : false,
    ...(typeof raw.kana === "string" ? { kana: raw.kana } : {})
  };
}

async function fetchAudioQueryFromEngine(
  voicevoxApiUrl: string,
  text: string,
  styleId: number,
  audioKey: string
): Promise<ProjectAudioQuery> {
  const endpoint = new URL("/audio_query", normalizeVoicevoxApiUrl(voicevoxApiUrl));
  endpoint.searchParams.set("text", text);
  endpoint.searchParams.set("speaker", String(styleId));

  let response: Response;
  try {
    response = await fetch(endpoint, { method: "POST" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to call VOICEVOX audio_query for ${audioKey} at ${endpoint.toString()}: ${reason}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `VOICEVOX audio_query returned ${response.status} ${response.statusText} for ${audioKey} at ${endpoint.toString()}`
    );
  }

  const raw = (await response.json()) as EngineAudioQueryLike;
  const query = normalizeAudioQueryResponse(raw);
  if (!Array.isArray(query.accentPhrases) || query.accentPhrases.length === 0) {
    throw new Error(`VOICEVOX audio_query produced empty accentPhrases for ${audioKey}`);
  }

  return query;
}

export async function buildProject({
  voicevoxTextJsonPath,
  runDir,
  profilePath,
  engineId,
  speakerId,
  styleId,
  appVersion,
  prefillQuery,
  voicevoxApiUrl
}: BuildProjectOptions): Promise<BuildProjectResult> {
  const resolvedVoicevoxTextPath = path.resolve(voicevoxTextJsonPath);
  const inferredRunDir = runDir
    ? path.resolve(runDir)
    : inferRunDirFromVoicevoxTextJsonPath(resolvedVoicevoxTextPath);
  if (!inferredRunDir) {
    throw new Error(
      "Could not infer run directory from --stage4-json path. Expected .../voicevox_text/... or pass --run-dir explicitly."
    );
  }
  const resolvedRunDir = inferredRunDir;
  const resolvedProfilePath = await resolveProfilePath(profilePath);

  const voicevoxTextData = await loadJson<VoicevoxTextData>(
    resolvedVoicevoxTextPath,
    SchemaPaths.voicevoxText
  );
  const rawProfile = await loadJson<RawVoiceProfile>(resolvedProfilePath);
  const profile = normalizeVoiceProfile(rawProfile);

  const finalEngineId = engineId || profile.engineId;
  const finalSpeakerId = speakerId || profile.speakerId;
  const finalStyleId = styleId ?? profile.styleId;
  const finalAppVersion = normalizeProjectAppVersion(appVersion || profile.appVersion);
  const queryPrefillMode = normalizeQueryPrefillMode(prefillQuery);
  const resolvedVoicevoxApiUrl = normalizeVoicevoxApiUrl(voicevoxApiUrl);

  const audioKeys: string[] = [];
  const audioItems: Record<string, ProjectAudioItem> = {};

  for (const utterance of voicevoxTextData.utterances) {
    const key = toAudioKey(voicevoxTextData.meta.episode_id, utterance.utterance_id);
    audioKeys.push(key);
    const audioItem: ProjectAudioItem = {
      text: utterance.text,
      voice: {
        engineId: finalEngineId,
        speakerId: finalSpeakerId,
        styleId: finalStyleId
      }
    };
    if (queryPrefillMode === "minimal") {
      audioItem.query = buildMinimalQuery(profile, utterance.pause_length_ms);
    }
    if (queryPrefillMode === "engine") {
      const engineQuery = await fetchAudioQueryFromEngine(
        resolvedVoicevoxApiUrl,
        utterance.text,
        finalStyleId,
        key
      );
      audioItem.query = applyQueryDefaults(engineQuery, profile, utterance.pause_length_ms);
    }
    audioItems[key] = audioItem;
  }

  const vvproj = {
    appVersion: finalAppVersion,
    talk: {
      audioKeys,
      audioItems
    },
    song: {
      tpqn: profile.tpqn,
      tempos: [
        {
          position: 0,
          bpm: profile.tempoBpm
        }
      ],
      timeSignatures: [
        {
          measureNumber: 1,
          beats: profile.timeSignature.beats,
          beatType: profile.timeSignature.beatType
        }
      ],
      tracks: {},
      trackOrder: []
    }
  };

  await validateAgainstSchema(vvproj, SchemaPaths.voicevoxProjectImport);

  const projectDir = path.join(resolvedRunDir, "voicevox_project");
  await mkdir(projectDir, { recursive: true });

  const episodeId = voicevoxTextData.meta.episode_id;
  const importJsonPath = path.join(projectDir, `${episodeId}_voicevox_import.json`);
  const vvprojPath = path.join(projectDir, `${episodeId}.vvproj`);

  const serialized = `${JSON.stringify(vvproj, null, 2)}\n`;
  await writeFile(importJsonPath, serialized, "utf-8");
  await writeFile(vvprojPath, serialized, "utf-8");

  return {
    importJsonPath,
    vvprojPath,
    audioItemCount: audioKeys.length,
    episodeId
  };
}
