import path from "node:path";

const SCHEMAS_DIR = path.resolve(process.cwd(), "schemas");

export const SchemaPaths = {
  blueprint: path.join(SCHEMAS_DIR, "blueprint.schema.json"),
  episodeMaterial: path.join(SCHEMAS_DIR, "episode-material.schema.json"),
  episodeDigest: path.join(SCHEMAS_DIR, "episode-digest.schema.json"),
  contentStyle: path.join(SCHEMAS_DIR, "content-style.schema.json"),
  character: path.join(SCHEMAS_DIR, "character.schema.json"),
  characterMap: path.join(SCHEMAS_DIR, "character-map.schema.json"),
  projectConfig: path.join(SCHEMAS_DIR, "project-config.schema.json"),
  voicevoxText: path.join(SCHEMAS_DIR, "voicevox-text.schema.json"),
  voicevoxProjectImport: path.join(SCHEMAS_DIR, "voicevox-import.schema.json"),
  voicevoxProjectMeta: path.join(SCHEMAS_DIR, "voicevox-project-meta.schema.json"),
  readingDictionary: path.join(SCHEMAS_DIR, "reading-dictionary.schema.json"),
  speedProfiles: path.join(SCHEMAS_DIR, "speed-profiles.schema.json")
} as const;
