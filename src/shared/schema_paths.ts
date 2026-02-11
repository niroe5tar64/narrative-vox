import path from "node:path";

const SCHEMAS_DIR = path.resolve(process.cwd(), "schemas");

export const SchemaPaths = {
  stage1BookBlueprint: path.join(SCHEMAS_DIR, "stage1.book-blueprint.schema.json"),
  stage2EpisodeVariables: path.join(SCHEMAS_DIR, "stage2.episode-variables.schema.json"),
  stage4VoicevoxText: path.join(SCHEMAS_DIR, "stage4.voicevox-text.schema.json"),
  stage5VoicevoxImport: path.join(SCHEMAS_DIR, "stage5.voicevox-import.schema.json")
} as const;
