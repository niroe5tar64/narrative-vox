import path from "node:path";

const SCHEMAS_DIR = path.resolve(process.cwd(), "schemas");

export const SchemaPaths = {
  blueprint: path.join(SCHEMAS_DIR, "blueprint.schema.json"),
  episodeVariables: path.join(SCHEMAS_DIR, "episode-variables.schema.json"),
  voicevoxText: path.join(SCHEMAS_DIR, "voicevox-text.schema.json"),
  voicevoxProjectImport: path.join(SCHEMAS_DIR, "voicevox-import.schema.json"),
  readingDictionary: path.join(SCHEMAS_DIR, "reading-dictionary.schema.json"),
  speedProfiles: path.join(SCHEMAS_DIR, "speed-profiles.schema.json")
} as const;
