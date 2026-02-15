export interface RawSpeakerMap {
  defaultSpeakerKey?: unknown;
  speakers?: unknown;
}

export interface SpeakerMapVoice {
  engineId: string;
  speakerId: string;
  styleId: number;
}

export interface SpeakerMap {
  defaultSpeakerKey?: string;
  speakers: Record<string, SpeakerMapVoice>;
}

const SPEAKER_KEY_RE = /^[a-z][a-z0-9_-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Speaker map ${fieldName} must be a non-empty string`);
  }
  return value;
}

function requireStyleId(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Speaker map ${fieldName} must be a non-negative number`);
  }
  return Math.trunc(parsed);
}

function normalizeSpeakerKey(value: string, fieldName: string): string {
  if (!SPEAKER_KEY_RE.test(value)) {
    throw new Error(
      `Speaker map ${fieldName} must match ${SPEAKER_KEY_RE.toString()} (received: ${value})`
    );
  }
  return value;
}

export function normalizeSpeakerMap(raw: unknown): SpeakerMap {
  if (!isRecord(raw)) {
    throw new Error("Speaker map root must be an object");
  }

  const defaultSpeakerKeyRaw = raw.defaultSpeakerKey;
  const speakersRaw = raw.speakers;

  const speakersRecord = isRecord(speakersRaw) ? speakersRaw : {};
  const speakers: Record<string, SpeakerMapVoice> = {};

  for (const [rawKey, rawVoice] of Object.entries(speakersRecord)) {
    const speakerKey = normalizeSpeakerKey(rawKey, `speakers.${rawKey}`);
    if (!isRecord(rawVoice)) {
      throw new Error(`Speaker map speakers.${speakerKey} must be an object`);
    }
    speakers[speakerKey] = {
      engineId: requireString(rawVoice.engineId, `speakers.${speakerKey}.engineId`),
      speakerId: requireString(rawVoice.speakerId, `speakers.${speakerKey}.speakerId`),
      styleId: requireStyleId(rawVoice.styleId, `speakers.${speakerKey}.styleId`)
    };
  }

  const defaultSpeakerKey =
    typeof defaultSpeakerKeyRaw === "string" && defaultSpeakerKeyRaw.trim().length > 0
      ? normalizeSpeakerKey(defaultSpeakerKeyRaw.trim(), "defaultSpeakerKey")
      : undefined;
  if (defaultSpeakerKey && !speakers[defaultSpeakerKey]) {
    throw new Error(
      `Speaker map defaultSpeakerKey "${defaultSpeakerKey}" is not defined in speakers`
    );
  }

  return {
    ...(defaultSpeakerKey ? { defaultSpeakerKey } : {}),
    speakers
  };
}
