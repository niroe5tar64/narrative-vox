import type { VoicevoxAudioQuery } from "@narrative-vox/infrastructure/voicevox-engine.ts";

export interface ProsodyAdjustments {
  intonationScale?: number;
}

export function applyProsodyAdjustments(
  query: VoicevoxAudioQuery,
  adjustments: ProsodyAdjustments | undefined,
): VoicevoxAudioQuery {
  const intonationScale = adjustments?.intonationScale;
  if (typeof intonationScale !== "number") {
    return query;
  }

  return {
    ...query,
    intonationScale: Math.max(0, intonationScale),
  };
}
