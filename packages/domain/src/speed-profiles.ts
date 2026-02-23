export interface SpeedPreset {
  speedScale: number;
  pauseLengthScale: number;
  postPhonemeLength: number;
}

export interface SpeedProfiles {
  version: number;
  presets: Record<string, SpeedPreset>;
}
