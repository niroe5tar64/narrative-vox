import path from "node:path";

const SCHEMAS_DIR = path.resolve(process.cwd(), "schemas");

export const SchemaPaths = {
  blueprint: path.join(SCHEMAS_DIR, "blueprint.schema.json"),
  contentStyle: path.join(SCHEMAS_DIR, "content-style.schema.json"),
  character: path.join(SCHEMAS_DIR, "character.schema.json"),
  characterMap: path.join(SCHEMAS_DIR, "character-map.schema.json"),
  projectConfig: path.join(SCHEMAS_DIR, "project-config.schema.json"),
  voicevoxText: path.join(SCHEMAS_DIR, "voicevox-text.schema.json"),
  voicevoxProjectImport: path.join(SCHEMAS_DIR, "voicevox-import.schema.json"),
  voicevoxProjectMeta: path.join(
    SCHEMAS_DIR,
    "voicevox-project-meta.schema.json",
  ),
  speedProfiles: path.join(SCHEMAS_DIR, "speed-profiles.schema.json"),
  buildTextConfig: path.join(SCHEMAS_DIR, "build-text-config.schema.json"),
  voicevoxTextPatchConfig: path.join(
    SCHEMAS_DIR,
    "voicevox-text-patch-config.schema.json",
  ),
  runContract: path.join(SCHEMAS_DIR, "run-contract.schema.json"),
  sourceIndex: path.join(SCHEMAS_DIR, "source-index.schema.json"),
  episodePack: path.join(SCHEMAS_DIR, "episode-pack.schema.json"),
  seriesContext: path.join(SCHEMAS_DIR, "series-context.schema.json"),
} as const;
