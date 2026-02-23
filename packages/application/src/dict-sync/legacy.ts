import type { UserDictWordEntry } from "@narrative-vox/infrastructure/voicevox-user-dict.ts";
import {
  addUserDictWord,
  deleteUserDictWord,
  fetchUserDict,
} from "@narrative-vox/infrastructure/voicevox-user-dict.ts";

export interface LegacySyncResult {
  deleted: number;
  added: number;
  errors: string[];
}

export async function syncLegacy(
  apiUrl: string,
  words: UserDictWordEntry[],
): Promise<LegacySyncResult> {
  const currentDict = await fetchUserDict(apiUrl);
  const existingUuids = Object.keys(currentDict);

  const errors: string[] = [];
  let deleted = 0;

  for (const uuid of existingUuids) {
    try {
      await deleteUserDictWord(apiUrl, uuid);
      deleted++;
    } catch (err) {
      errors.push(
        `DELETE ${uuid}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  let added = 0;
  for (const word of words) {
    try {
      await addUserDictWord(apiUrl, word);
      added++;
    } catch (err) {
      errors.push(
        `ADD "${word.surface}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { deleted, added, errors };
}
