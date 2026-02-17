import path from "node:path";
import { pathExists } from "./fs_utils.ts";

export async function resolveProfilePath(profilePath?: string): Promise<string> {
  if (profilePath) {
    return path.resolve(profilePath);
  }

  const localDefault = path.resolve("configs/voicevox/default_profile.json");
  if (await pathExists(localDefault)) {
    return localDefault;
  }

  throw new Error(
    `Voice profile not found: ${localDefault}. Create configs/voicevox/default_profile.json or pass --profile.`
  );
}

export async function resolveSpeedProfilesPath(speedProfilesPath?: string): Promise<string | undefined> {
  if (speedProfilesPath) {
    return path.resolve(speedProfilesPath);
  }

  const localDefault = path.resolve("configs/voicevox/speed_profiles.json");
  if (await pathExists(localDefault)) {
    return localDefault;
  }
  return undefined;
}
