import type { SpeedPreset } from "@narrative-vox/domain/speed-profiles.ts";
import type { VoicevoxAudioQuery } from "@narrative-vox/infrastructure/voicevox-engine.ts";

export type {
  SpeedPreset,
  SpeedProfiles,
} from "@narrative-vox/domain/speed-profiles.ts";
export { loadSpeedProfiles } from "@narrative-vox/infrastructure/speed-profiles.ts";

export function applySpeedPreset(
  query: VoicevoxAudioQuery,
  preset: SpeedPreset | undefined,
): VoicevoxAudioQuery {
  if (!preset) {
    return query;
  }

  return {
    ...query,
    speedScale: preset.speedScale,
    pauseLengthScale: preset.pauseLengthScale,
    postPhonemeLength: preset.postPhonemeLength,
  };
}
