import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateAgainstSchema } from "../quality/schema_validator.ts";
import { loadJson } from "../shared/json.ts";
import {
  RawVoiceProfile,
  VoiceProfile,
  normalizeVoiceProfile
} from "../shared/voice_profile.ts";

interface Stage4Utterance {
  utterance_id: string;
  text: string;
}

interface Stage4Data {
  meta: {
    episode_id: string;
  };
  utterances: Stage4Utterance[];
}

interface Stage5Mora {
  text: string;
  vowel: string;
  vowelLength: number;
  pitch: number;
  consonant?: string;
  consonantLength?: number;
}

interface Stage5AccentPhrase {
  moras: Stage5Mora[];
  accent: number;
  pauseMora?: Stage5Mora;
  isInterrogative?: boolean;
}

interface Stage5AudioQuery {
  accentPhrases: Stage5AccentPhrase[];
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

interface Stage5AudioItem {
  text: string;
  voice: {
    engineId: string;
    speakerId: string;
    styleId: number;
  };
  query?: Stage5AudioQuery;
}

type QueryPrefillMode = "none" | "minimal";

interface RunStage5Options {
  stage4JsonPath: string;
  runDir?: string;
  profilePath?: string;
  engineId?: string;
  speakerId?: string;
  styleId?: number;
  appVersion?: string;
  prefillQuery?: string;
}

interface RunStage5Result {
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

function inferRunDirFromStage4JsonPath(stage4JsonPath: string): string | undefined {
  const stage4Dir = path.dirname(path.resolve(stage4JsonPath));
  if (path.basename(stage4Dir) !== "stage4") {
    return undefined;
  }
  return path.dirname(stage4Dir);
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

function buildMinimalQuery(profile: VoiceProfile): Stage5AudioQuery {
  const defaults = profile.queryDefaults;
  return {
    accentPhrases: [],
    speedScale: defaults.speedScale,
    pitchScale: defaults.pitchScale,
    intonationScale: defaults.intonationScale,
    volumeScale: defaults.volumeScale,
    pauseLengthScale: defaults.pauseLengthScale,
    prePhonemeLength: defaults.prePhonemeLength,
    postPhonemeLength: defaults.postPhonemeLength,
    outputSamplingRate: defaults.outputSamplingRate,
    outputStereo: defaults.outputStereo
  };
}

export async function runStage5({
  stage4JsonPath,
  runDir,
  profilePath,
  engineId,
  speakerId,
  styleId,
  appVersion,
  prefillQuery
}: RunStage5Options): Promise<RunStage5Result> {
  const resolvedStage4Path = path.resolve(stage4JsonPath);
  const inferredRunDir = runDir
    ? path.resolve(runDir)
    : inferRunDirFromStage4JsonPath(resolvedStage4Path);
  if (!inferredRunDir) {
    throw new Error(
      "Could not infer run directory from --stage4-json path. Pass --run-dir explicitly."
    );
  }
  const resolvedRunDir = inferredRunDir;
  const resolvedProfilePath = await resolveProfilePath(profilePath);

  const stage4Data = await loadJson<Stage4Data>(
    resolvedStage4Path,
    path.resolve(process.cwd(), "schemas/stage4.voicevox-text.schema.json")
  );
  const rawProfile = await loadJson<RawVoiceProfile>(resolvedProfilePath);
  const profile = normalizeVoiceProfile(rawProfile);

  const finalEngineId = engineId || profile.engineId;
  const finalSpeakerId = speakerId || profile.speakerId;
  const finalStyleId = styleId ?? profile.styleId;
  const finalAppVersion = appVersion || profile.appVersion || "0.0.0";
  const queryPrefillMode = normalizeQueryPrefillMode(prefillQuery);

  const audioKeys: string[] = [];
  const audioItems: Record<string, Stage5AudioItem> = {};

  for (const utterance of stage4Data.utterances) {
    const key = toAudioKey(stage4Data.meta.episode_id, utterance.utterance_id);
    audioKeys.push(key);
    const audioItem: Stage5AudioItem = {
      text: utterance.text,
      voice: {
        engineId: finalEngineId,
        speakerId: finalSpeakerId,
        styleId: finalStyleId
      }
    };
    if (queryPrefillMode === "minimal") {
      audioItem.query = buildMinimalQuery(profile);
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

  await validateAgainstSchema(
    vvproj,
    path.resolve(process.cwd(), "schemas/stage5.voicevox-import.schema.json")
  );

  const stage5Dir = path.join(resolvedRunDir, "stage5");
  await mkdir(stage5Dir, { recursive: true });

  const episodeId = stage4Data.meta.episode_id;
  const importJsonPath = path.join(stage5Dir, `${episodeId}_voicevox_import.json`);
  const vvprojPath = path.join(stage5Dir, `${episodeId}.vvproj`);

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
