import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CharacterMap } from "@narrative-vox/domain/characters.ts";
import {
  normalizeSynthesisDefaults,
  type RawSynthesisDefaults,
  type SynthesisDefaults,
} from "@narrative-vox/domain/synthesis-defaults.ts";
import type { VoicevoxTextData } from "@narrative-vox/domain/types.ts";
import { resolveCharacterMap } from "@narrative-vox/infrastructure/character-map-resolver.ts";
import {
  resolveSpeedProfilesPath,
  resolveSynthesisDefaultsPath,
} from "@narrative-vox/infrastructure/config-resolver.ts";
import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import {
  fetchAudioQueryFromEngine,
  resolveVoicevoxApiUrl,
  type VoicevoxAudioQuery,
} from "@narrative-vox/infrastructure/voicevox-engine.ts";
import { validateAgainstSchema } from "@narrative-vox/quality/schema-validator.ts";
import { applyProsodyAdjustments } from "./build-project/prosody.ts";
import {
  applySpeedPreset,
  loadSpeedProfiles,
  type SpeedPreset,
  type SpeedProfiles,
} from "./build-project/speed-profiles.ts";

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

interface BuildProjectOptions {
  voicevoxTextJsonPath: string;
  runDir?: string;
  synthesisDefaultsPath?: string;
  characterMapPath?: string;
  characterKey?: string;
  engineId?: string;
  speakerId?: string;
  styleId?: number;
  appVersion?: string;
  voicevoxApiUrl?: string;
  speedPreset?: string;
  speedProfilesPath?: string;
  emotion?: string;
  intonationScale?: number;
}

interface BuildProjectResult {
  importJsonPath: string;
  vvprojPath: string;
  projectMetaJsonPath: string;
  audioItemCount: number;
  episodeId: string;
}

const MIN_VOICEVOX_PROJECT_APP_VERSION = "0.25.0";

function toAudioKey(episodeId: string, utteranceId: string): string {
  return `${episodeId}_${utteranceId}`;
}

function inferRunDirFromVoicevoxTextJsonPath(
  voicevoxTextJsonPath: string,
): string | undefined {
  const voicevoxTextDir = path.dirname(path.resolve(voicevoxTextJsonPath));
  if (path.basename(voicevoxTextDir) !== "voicevox_text") {
    return undefined;
  }
  return path.dirname(voicevoxTextDir);
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
  pauseLengthMs?: number,
): number {
  if (typeof pauseLengthMs !== "number" || !Number.isFinite(pauseLengthMs)) {
    return defaultPostPhonemeLength;
  }

  const fromPause = Math.max(0, Math.round(pauseLengthMs) / 1000);
  return Math.max(defaultPostPhonemeLength, fromPause);
}

function applyQueryDefaults(
  query: VoicevoxAudioQuery,
  synthesisDefaults: SynthesisDefaults,
): VoicevoxAudioQuery {
  const defaults = synthesisDefaults.queryDefaults;
  return {
    ...query,
    speedScale: defaults.speedScale,
    pitchScale: defaults.pitchScale,
    intonationScale: defaults.intonationScale,
    volumeScale: defaults.volumeScale,
    pauseLengthScale: defaults.pauseLengthScale,
    prePhonemeLength: defaults.prePhonemeLength,
    postPhonemeLength: defaults.postPhonemeLength,
    outputSamplingRate: defaults.outputSamplingRate,
    outputStereo: defaults.outputStereo,
  };
}

function resolveSpeedPreset(
  speedPreset: string | undefined,
  speedProfiles: SpeedProfiles | undefined,
): SpeedPreset | undefined {
  if (!speedPreset) {
    return undefined;
  }

  if (!speedProfiles) {
    throw new Error(
      `Speed preset "${speedPreset}" was requested but no speed profiles are configured. Set --speed-profiles or add configs/voice/voicevox/speed-profiles.json`,
    );
  }

  const preset = speedProfiles.presets[speedPreset];
  if (!preset) {
    const availablePresets = Object.keys(speedProfiles.presets);
    throw new Error(
      `Unknown speed preset "${speedPreset}". Available presets: ${availablePresets.join(", ")}`,
    );
  }

  return preset;
}

function resolveUtteranceVoice(params: {
  utteranceSpeakerKey?: string;
  forcedCharacterKey?: string;
  characterMap?: CharacterMap;
  emotion?: string;
  cliOverrides: {
    engineId?: string;
    speakerId?: string;
    styleId?: number;
  };
}): ProjectVoice {
  const selectedCharacterKey =
    params.forcedCharacterKey || params.utteranceSpeakerKey;
  let baseVoice: ProjectVoice | undefined;
  if (selectedCharacterKey) {
    if (!params.characterMap) {
      throw new Error(
        `character_key "${selectedCharacterKey}" was requested but no character map is configured. Set --character-map or add configs/voice/voicevox/default_character_map.json`,
      );
    }
    const mapped = params.characterMap.characters[selectedCharacterKey];
    if (!mapped) {
      throw new Error(
        `Unknown character_key "${selectedCharacterKey}". Define it in the character map.`,
      );
    }
    baseVoice = mapped;
  }

  if (params.emotion) {
    if (!selectedCharacterKey) {
      throw new Error(
        `Emotion "${params.emotion}" requires a character voice source. Provide [speaker:<key>] or --character-key with a character map.`,
      );
    }
    if (!params.characterMap) {
      throw new Error(
        `Emotion "${params.emotion}" was requested but no character map is configured. Set --character-map or add configs/voice/voicevox/default_character_map.json`,
      );
    }
    const emotionMap =
      params.characterMap.emotionStyles?.[selectedCharacterKey];
    if (!emotionMap) {
      throw new Error(
        `Character "${selectedCharacterKey}" has no emotionStyles defined`,
      );
    }
    const emotionStyleId = emotionMap[params.emotion];
    if (emotionStyleId === undefined) {
      throw new Error(
        `Emotion "${params.emotion}" not found for character "${selectedCharacterKey}". Available: ${Object.keys(
          emotionMap,
        ).join(", ")}`,
      );
    }
    if (baseVoice) {
      baseVoice = { ...baseVoice, styleId: emotionStyleId };
    }
  }

  if (!baseVoice) {
    const { engineId, speakerId, styleId } = params.cliOverrides;
    if (engineId && speakerId && typeof styleId === "number") {
      return { engineId, speakerId, styleId };
    }
    throw new Error(
      "Voice must be specified explicitly. Provide [speaker:<key>] (or --character-key) with a character map, or pass all of --engine-id/--speaker-id/--style-id.",
    );
  }

  return {
    engineId: params.cliOverrides.engineId || baseVoice.engineId,
    speakerId: params.cliOverrides.speakerId || baseVoice.speakerId,
    styleId: params.cliOverrides.styleId ?? baseVoice.styleId,
  };
}

export async function buildProject({
  voicevoxTextJsonPath,
  runDir,
  synthesisDefaultsPath,
  characterMapPath,
  characterKey,
  engineId,
  speakerId,
  styleId,
  appVersion,
  voicevoxApiUrl,
  speedPreset,
  speedProfilesPath,
  emotion,
  intonationScale,
}: BuildProjectOptions): Promise<BuildProjectResult> {
  const resolvedVoicevoxTextPath = path.resolve(voicevoxTextJsonPath);
  const inferredRunDir = runDir
    ? path.resolve(runDir)
    : inferRunDirFromVoicevoxTextJsonPath(resolvedVoicevoxTextPath);
  if (!inferredRunDir) {
    throw new Error(
      "Could not infer run directory from --voicevox-text-json path. Expected .../voicevox_text/... or pass --run-dir explicitly.",
    );
  }
  const resolvedRunDir = inferredRunDir;
  const resolvedSynthesisDefaultsPath = await resolveSynthesisDefaultsPath(
    synthesisDefaultsPath,
  );
  const resolvedSpeedProfilesPath =
    await resolveSpeedProfilesPath(speedProfilesPath);

  const voicevoxTextData = await loadJson<VoicevoxTextData>(
    resolvedVoicevoxTextPath,
    SchemaPaths.voicevoxText,
  );
  const rawSynthesisDefaults = await loadJson<RawSynthesisDefaults>(
    resolvedSynthesisDefaultsPath,
  );
  const synthesisDefaults = normalizeSynthesisDefaults(rawSynthesisDefaults);
  const { characterMap } = await resolveCharacterMap({
    characterMapPath,
    defaultCharacterKey: characterKey,
  });
  const speedProfiles = resolvedSpeedProfilesPath
    ? await loadSpeedProfiles(resolvedSpeedProfilesPath)
    : undefined;
  const resolvedSpeedPreset = resolveSpeedPreset(speedPreset, speedProfiles);

  const finalAppVersion = normalizeProjectAppVersion(
    appVersion || synthesisDefaults.appVersion,
  );
  const resolvedVoicevoxApiUrl = await resolveVoicevoxApiUrl(voicevoxApiUrl);

  const audioKeys: string[] = [];
  const audioItems: Record<string, ProjectAudioItem> = {};

  for (const utterance of voicevoxTextData.utterances) {
    const key = toAudioKey(
      voicevoxTextData.meta.episode_id,
      utterance.utterance_id,
    );
    audioKeys.push(key);
    const resolvedVoice = resolveUtteranceVoice({
      utteranceSpeakerKey: utterance.speaker_key,
      forcedCharacterKey: characterKey,
      characterMap,
      emotion,
      cliOverrides: { engineId, speakerId, styleId },
    });
    const { query: engineQuery } = await fetchAudioQueryFromEngine({
      voicevoxApiUrl: resolvedVoicevoxApiUrl,
      text: utterance.text,
      styleId: resolvedVoice.styleId,
      audioKey: key,
    });
    let query = applyQueryDefaults(engineQuery, synthesisDefaults);
    query = applySpeedPreset(query, resolvedSpeedPreset);
    query = applyProsodyAdjustments(query, { intonationScale });
    query = {
      ...query,
      postPhonemeLength: toPostPhonemeLength(
        query.postPhonemeLength,
        utterance.pause_length_ms,
      ),
    };
    const audioItem: ProjectAudioItem = {
      text: utterance.text,
      voice: resolvedVoice,
      query,
    };
    audioItems[key] = audioItem;
  }

  const vvproj = {
    appVersion: finalAppVersion,
    talk: {
      audioKeys,
      audioItems,
    },
    song: {
      tpqn: synthesisDefaults.tpqn,
      tempos: [
        {
          position: 0,
          bpm: synthesisDefaults.tempoBpm,
        },
      ],
      timeSignatures: [
        {
          measureNumber: 1,
          beats: synthesisDefaults.timeSignature.beats,
          beatType: synthesisDefaults.timeSignature.beatType,
        },
      ],
      tracks: {},
      trackOrder: [],
    },
  };

  await validateAgainstSchema(vvproj, SchemaPaths.voicevoxProjectImport);

  const projectDir = path.join(resolvedRunDir, "voicevox_project");
  await mkdir(projectDir, { recursive: true });

  const episodeId = voicevoxTextData.meta.episode_id;
  const projectMeta = {
    generated_at: new Date().toISOString(),
    adjustments: {
      ...(speedPreset ? { speed_preset: speedPreset } : {}),
      ...(emotion ? { emotion } : {}),
      ...(typeof intonationScale === "number"
        ? { intonation_scale: intonationScale }
        : {}),
    },
  };
  await validateAgainstSchema(projectMeta, SchemaPaths.voicevoxProjectMeta);

  const importJsonPath = path.join(
    projectDir,
    `${episodeId}_voicevox_import.json`,
  );
  const vvprojPath = path.join(projectDir, `${episodeId}.vvproj`);
  const projectMetaJsonPath = path.join(
    projectDir,
    `${episodeId}_project_meta.json`,
  );

  const serialized = `${JSON.stringify(vvproj, null, 2)}\n`;
  const projectMetaSerialized = `${JSON.stringify(projectMeta, null, 2)}\n`;
  await writeFile(importJsonPath, serialized, "utf-8");
  await writeFile(vvprojPath, serialized, "utf-8");
  await writeFile(projectMetaJsonPath, projectMetaSerialized, "utf-8");

  return {
    importJsonPath,
    vvprojPath,
    projectMetaJsonPath,
    audioItemCount: audioKeys.length,
    episodeId,
  };
}
