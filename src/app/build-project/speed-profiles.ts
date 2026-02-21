import path from "node:path";
import { loadJson } from "../../infra/json.ts";
import { SchemaPaths } from "../../infra/schema-paths.ts";
import type { VoicevoxAudioQuery } from "../../infra/voicevox-engine.ts";

export interface SpeedPreset {
  speedScale: number;
  pauseLengthScale: number;
  postPhonemeLength: number;
}

export interface SpeedProfiles {
  version: number;
  presets: Record<string, SpeedPreset>;
}

export async function loadSpeedProfiles(filePath: string): Promise<SpeedProfiles> {
  const resolvedPath = path.resolve(filePath);
  try {
    return await loadJson<SpeedProfiles>(resolvedPath, SchemaPaths.speedProfiles);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load speed profiles (${resolvedPath}): ${message}`);
  }
}

export function applySpeedPreset(
  query: VoicevoxAudioQuery,
  preset: SpeedPreset | undefined
): VoicevoxAudioQuery {
  if (!preset) {
    return query;
  }

  return {
    ...query,
    speedScale: preset.speedScale,
    pauseLengthScale: preset.pauseLengthScale,
    postPhonemeLength: preset.postPhonemeLength
  };
}
