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
    speedScale: requireFiniteNumber(raw.queryDefaults?.speedScale, "queryDefaults.speedScale"),
    pitchScale: requireFiniteNumber(raw.queryDefaults?.pitchScale, "queryDefaults.pitchScale"),
    intonationScale: requireFiniteNumber(
      raw.queryDefaults?.intonationScale,
      "queryDefaults.intonationScale"
    ),
    volumeScale: requireFiniteNumber(raw.queryDefaults?.volumeScale, "queryDefaults.volumeScale"),
    pauseLengthScale: requireFiniteNumber(
      raw.queryDefaults?.pauseLengthScale,
      "queryDefaults.pauseLengthScale"
    ),
    prePhonemeLength: requireFiniteNumber(
      raw.queryDefaults?.prePhonemeLength,
      "queryDefaults.prePhonemeLength"
    ),
    postPhonemeLength: requireFiniteNumber(
      raw.queryDefaults?.postPhonemeLength,
      "queryDefaults.postPhonemeLength"
    ),
    outputSamplingRate: coerceOutputSamplingRate(raw.queryDefaults?.outputSamplingRate),
    outputStereo: raw.queryDefaults?.outputStereo ?? DEFAULT_QUERY_DEFAULTS.outputStereo
  };

  return {
    engineId: raw.engineId,
    speakerId: raw.speakerId,
    styleId: requireFiniteNumber(raw.styleId, "styleId"),
    appVersion: raw.appVersion,
    tpqn: requireFiniteNumber(raw.tpqn, "tpqn"),
    tempoBpm: requireFiniteNumber(raw.tempoBpm, "tempoBpm"),
    timeSignature: {
      beats: requireFiniteNumber(raw.timeSignature?.beats, "timeSignature.beats"),
      beatType: requireFiniteNumber(raw.timeSignature?.beatType, "timeSignature.beatType")
    },
    queryDefaults: normalizedQueryDefaults
  };
}
