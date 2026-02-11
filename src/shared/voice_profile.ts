export interface RawVoiceProfile {
  engineId: string;
  speakerId: string;
  styleId: number | string;
  appVersion?: string;
  tpqn?: number | string;
  tempoBpm?: number | string;
  timeSignature?: {
    beats?: number | string;
    beatType?: number | string;
  };
  queryDefaults?: RawVoiceProfileQueryDefaults;
}

export interface RawVoiceProfileQueryDefaults {
  speedScale?: number | string;
  pitchScale?: number | string;
  intonationScale?: number | string;
  volumeScale?: number | string;
  pauseLengthScale?: number | string;
  prePhonemeLength?: number | string;
  postPhonemeLength?: number | string;
  outputSamplingRate?: number | string;
  outputStereo?: boolean;
}

export interface VoiceProfile {
  engineId: string;
  speakerId: string;
  styleId: number;
  appVersion?: string;
  tpqn: number;
  tempoBpm: number;
  timeSignature: {
    beats: number;
    beatType: number;
  };
  queryDefaults: VoiceProfileQueryDefaults;
}

export interface VoiceProfileQueryDefaults {
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  pauseLengthScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number | "engineDefault";
  outputStereo: boolean;
}

const DEFAULT_TPQN = 480;
const DEFAULT_TEMPO_BPM = 120;
const DEFAULT_TIME_SIGNATURE = { beats: 4, beatType: 4 };
const DEFAULT_QUERY_DEFAULTS: VoiceProfileQueryDefaults = {
  speedScale: 1,
  pitchScale: 0,
  intonationScale: 1,
  volumeScale: 1,
  pauseLengthScale: 1,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.1,
  outputSamplingRate: "engineDefault",
  outputStereo: false
};

function coerceNumber(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requireFiniteNumber(value: number | string | undefined, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Voice profile ${fieldName} must be a valid number`);
  }
  return parsed;
}

function coerceOutputSamplingRate(value: number | string | undefined): number | "engineDefault" {
  if (value === "engineDefault") {
    return "engineDefault";
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.trunc(parsed);
  }
  return DEFAULT_QUERY_DEFAULTS.outputSamplingRate;
}

export function normalizeVoiceProfile(raw: RawVoiceProfile): VoiceProfile {
  const normalizedQueryDefaults: VoiceProfileQueryDefaults = {
    speedScale: coerceNumber(raw.queryDefaults?.speedScale, DEFAULT_QUERY_DEFAULTS.speedScale),
    pitchScale: coerceNumber(raw.queryDefaults?.pitchScale, DEFAULT_QUERY_DEFAULTS.pitchScale),
    intonationScale: coerceNumber(
      raw.queryDefaults?.intonationScale,
      DEFAULT_QUERY_DEFAULTS.intonationScale
    ),
    volumeScale: coerceNumber(raw.queryDefaults?.volumeScale, DEFAULT_QUERY_DEFAULTS.volumeScale),
    pauseLengthScale: coerceNumber(
      raw.queryDefaults?.pauseLengthScale,
      DEFAULT_QUERY_DEFAULTS.pauseLengthScale
    ),
    prePhonemeLength: coerceNumber(
      raw.queryDefaults?.prePhonemeLength,
      DEFAULT_QUERY_DEFAULTS.prePhonemeLength
    ),
    postPhonemeLength: coerceNumber(
      raw.queryDefaults?.postPhonemeLength,
      DEFAULT_QUERY_DEFAULTS.postPhonemeLength
    ),
    outputSamplingRate: coerceOutputSamplingRate(raw.queryDefaults?.outputSamplingRate),
    outputStereo: raw.queryDefaults?.outputStereo ?? DEFAULT_QUERY_DEFAULTS.outputStereo
  };

  return {
    engineId: raw.engineId,
    speakerId: raw.speakerId,
    styleId: requireFiniteNumber(raw.styleId, "styleId"),
    appVersion: raw.appVersion,
    tpqn: coerceNumber(raw.tpqn, DEFAULT_TPQN),
    tempoBpm: coerceNumber(raw.tempoBpm, DEFAULT_TEMPO_BPM),
    timeSignature: {
      beats: coerceNumber(raw.timeSignature?.beats, DEFAULT_TIME_SIGNATURE.beats),
      beatType: coerceNumber(raw.timeSignature?.beatType, DEFAULT_TIME_SIGNATURE.beatType)
    },
    queryDefaults: normalizedQueryDefaults
  };
}
