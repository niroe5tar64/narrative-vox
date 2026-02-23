import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import type { PatchConfig } from "@narrative-vox/domain/types.ts";

export type { PatchConfig };

export const DEFAULT_PATCH_CONFIG: PatchConfig = {
  version: 1,
  text_normalization: {
    enabled: false,
    rules: [],
  },
  dict_patch: {
    enabled: false,
    force_readings: [],
    suppress_surfaces: [],
  },
};

export async function loadPatchConfig(filePath: string): Promise<PatchConfig> {
  return await loadJson<PatchConfig>(filePath, SchemaPaths.voicevoxTextPatchConfig);
}
