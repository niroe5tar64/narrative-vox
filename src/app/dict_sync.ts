import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateAgainstSchema } from "../quality/schema_validator.ts";
import {
  fetchUserDict,
  deleteUserDictWord,
  addUserDictWord
} from "../infra/voicevox_user_dict.ts";
import type { UserDictWordEntry } from "../infra/voicevox_user_dict.ts";

const DEFAULT_DICT_PATH = "configs/voicevox/user_dict.json";
const SCHEMA_PATH = "schemas/user-dict.schema.json";

interface UserDictFile {
  version: number;
  words: UserDictWordEntry[];
}

export interface DictSyncResult {
  deleted: number;
  added: number;
  errors: string[];
}

export async function syncUserDict(options: {
  apiUrl: string;
  dictPath?: string;
}): Promise<DictSyncResult> {
  const dictPath = path.resolve(options.dictPath ?? DEFAULT_DICT_PATH);
  const schemaPath = path.resolve(SCHEMA_PATH);

  const raw = await readFile(dictPath, "utf-8");
  const dictData: UserDictFile = JSON.parse(raw);
  await validateAgainstSchema(dictData, schemaPath);

  const currentDict = await fetchUserDict(options.apiUrl);
  const existingUuids = Object.keys(currentDict);

  const errors: string[] = [];
  let deleted = 0;

  for (const uuid of existingUuids) {
    try {
      await deleteUserDictWord(options.apiUrl, uuid);
      deleted++;
    } catch (err) {
      errors.push(`DELETE ${uuid}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  let added = 0;
  for (const word of dictData.words) {
    try {
      await addUserDictWord(options.apiUrl, word);
      added++;
    } catch (err) {
      errors.push(
        `ADD "${word.surface}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { deleted, added, errors };
}
