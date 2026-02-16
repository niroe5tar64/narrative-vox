import type { VoicevoxAudioQuery } from "../voicevox_engine.ts";

export interface ProsodyAdjustments {
  intonationScaleDelta?: number;
}

export function applyProsodyAdjustments(
  query: VoicevoxAudioQuery,
  adjustments: ProsodyAdjustments | undefined
): VoicevoxAudioQuery {
  const intonationScaleDelta = adjustments?.intonationScaleDelta;
  if (typeof intonationScaleDelta !== "number") {
    return query;
  }

  return {
    ...query,
    intonationScale: Math.max(0, query.intonationScale + intonationScaleDelta)
  };
}
