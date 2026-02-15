import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateAgainstSchema } from "../quality/schema_validator.ts";
import { SchemaPaths } from "../shared/schema_paths.ts";
import type { VoicevoxTextData } from "../shared/types.ts";
import { loadJson } from "../shared/json.ts";
import { normalizeCharacterMap, type CharacterMap } from "../shared/characters.ts";
import {
  RawVoiceProfile,
  VoiceProfile,
  normalizeVoiceProfile
} from "../shared/voice_profile.ts";
import {
  fetchAudioQueryFromEngine,
  resolveVoicevoxApiUrl,
  type VoicevoxAudioQuery
} from "./voicevox_engine.ts";

interface ProjectAudioItem {
  text: string;
  voice: {
    engineId: string;
    speakerId: string;
    styleId: number;
  };
  query?: VoicevoxAudioQuery;
}

interface ProjectVoice {
  engineId: string;
  speakerId: string;
  styleId: number;
}

type QueryPrefillMode = "none" | "minimal" | "engine";

interface BuildProjectOptions {
  voicevoxTextJsonPath: string;
  runDir?: string;
  profilePath?: string;
  characterMapPath?: string;
  characterKey?: string;
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

async function resolveCharacterMapPath(characterMapPath?: string): Promise<string | undefined> {
  if (characterMapPath) {
    return path.resolve(characterMapPath);
  }

  const localDefault = path.resolve("configs/voicevox/default_character_map.json");
  try {
    await access(localDefault);
    return localDefault;
  } catch {
    return undefined;
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

function buildMinimalQuery(profile: VoiceProfile, pauseLengthMs?: number): VoicevoxAudioQuery {
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
  query: VoicevoxAudioQuery,
  profile: VoiceProfile,
  pauseLengthMs?: number
): VoicevoxAudioQuery {
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

function resolveUtteranceVoice(params: {
  utteranceSpeakerKey?: string;
  forcedCharacterKey?: string;
  characterMap?: CharacterMap;
  profileVoice: ProjectVoice;
  cliOverrides: {
    engineId?: string;
    speakerId?: string;
    styleId?: number;
  };
}): ProjectVoice {
  const selectedCharacterKey =
    params.forcedCharacterKey ||
    params.utteranceSpeakerKey ||
    params.characterMap?.defaultCharacterKey;

  let baseVoice: ProjectVoice = params.profileVoice;
  if (selectedCharacterKey) {
    if (!params.characterMap) {
      throw new Error(
        `character_key "${selectedCharacterKey}" was requested but no character map is configured. Set --character-map or add configs/voicevox/default_character_map.json`
      );
    }
    const mapped = params.characterMap.characters[selectedCharacterKey];
    if (!mapped) {
      throw new Error(
        `Unknown character_key "${selectedCharacterKey}". Define it in the character map.`
      );
    }
    baseVoice = mapped;
  }

  return {
    engineId: params.cliOverrides.engineId || baseVoice.engineId,
    speakerId: params.cliOverrides.speakerId || baseVoice.speakerId,
    styleId: params.cliOverrides.styleId ?? baseVoice.styleId
  };
}

export async function buildProject({
  voicevoxTextJsonPath,
  runDir,
  profilePath,
  characterMapPath,
  characterKey,
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
      "Could not infer run directory from --voicevox-text-json path. Expected .../voicevox_text/... or pass --run-dir explicitly."
    );
  }
  const resolvedRunDir = inferredRunDir;
  const resolvedProfilePath = await resolveProfilePath(profilePath);
  const resolvedCharacterMapPath = await resolveCharacterMapPath(characterMapPath);

  const voicevoxTextData = await loadJson<VoicevoxTextData>(
    resolvedVoicevoxTextPath,
    SchemaPaths.voicevoxText
  );
  const rawProfile = await loadJson<RawVoiceProfile>(resolvedProfilePath);
  const profile = normalizeVoiceProfile(rawProfile);
  const characterMap = resolvedCharacterMapPath
    ? normalizeCharacterMap(await loadJson<unknown>(resolvedCharacterMapPath))
    : undefined;

  const profileVoice: ProjectVoice = {
    engineId: profile.engineId,
    speakerId: profile.speakerId,
    styleId: profile.styleId
  };
  const finalAppVersion = normalizeProjectAppVersion(appVersion || profile.appVersion);
  const queryPrefillMode = normalizeQueryPrefillMode(prefillQuery);
  const resolvedVoicevoxApiUrl = await resolveVoicevoxApiUrl(voicevoxApiUrl);

  const audioKeys: string[] = [];
  const audioItems: Record<string, ProjectAudioItem> = {};

  for (const utterance of voicevoxTextData.utterances) {
    const key = toAudioKey(voicevoxTextData.meta.episode_id, utterance.utterance_id);
    audioKeys.push(key);
    const resolvedVoice = resolveUtteranceVoice({
      utteranceSpeakerKey: utterance.speaker_key,
      forcedCharacterKey: characterKey,
      characterMap,
      profileVoice,
      cliOverrides: { engineId, speakerId, styleId }
    });
    const audioItem: ProjectAudioItem = {
      text: utterance.text,
      voice: resolvedVoice
    };
    if (queryPrefillMode === "minimal") {
      audioItem.query = buildMinimalQuery(profile, utterance.pause_length_ms);
    }
    if (queryPrefillMode === "engine") {
      const { query: engineQuery } = await fetchAudioQueryFromEngine({
        voicevoxApiUrl: resolvedVoicevoxApiUrl,
        text: utterance.text,
        styleId: resolvedVoice.styleId,
        audioKey: key
      });
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
