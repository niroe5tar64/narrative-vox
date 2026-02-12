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

type QueryPrefillMode = "none" | "minimal";

interface BuildProjectOptions {
  voicevoxTextJsonPath: string;
  runDir?: string;
  profilePath?: string;
  engineId?: string;
  speakerId?: string;
  styleId?: number;
  appVersion?: string;
  prefillQuery?: string;
}

interface BuildProjectResult {
  importJsonPath: string;
  vvprojPath: string;
  audioItemCount: number;
  episodeId: string;
}

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
  throw new Error(`Invalid --prefill-query: ${mode}. Expected one of: none, minimal`);
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

export async function buildProject({
  voicevoxTextJsonPath,
  runDir,
  profilePath,
  engineId,
  speakerId,
  styleId,
  appVersion,
  prefillQuery
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
  const finalAppVersion = appVersion || profile.appVersion || "0.0.0";
  const queryPrefillMode = normalizeQueryPrefillMode(prefillQuery);

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
