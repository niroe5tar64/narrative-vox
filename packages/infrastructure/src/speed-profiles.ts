import path from "node:path";
import type { SpeedProfiles } from "@narrative-vox/domain/speed-profiles.ts";
import { loadJson } from "./json.ts";
import { SchemaPaths } from "./schema-paths.ts";

export async function loadSpeedProfiles(
  filePath: string,
): Promise<SpeedProfiles> {
  const resolvedPath = path.resolve(filePath);
  try {
    return await loadJson<SpeedProfiles>(
      resolvedPath,
      SchemaPaths.speedProfiles,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load speed profiles (${resolvedPath}): ${message}`,
    );
  }
}
