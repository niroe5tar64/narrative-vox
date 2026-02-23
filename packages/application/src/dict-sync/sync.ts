import {
  addUserDictWord,
  deleteUserDictWord,
  updateUserDictWord,
} from "@narrative-vox/infrastructure/voicevox-user-dict.ts";
import type { DictDiff, DictSyncError, DictSyncResult } from "./types.ts";
import { DictSyncAbortError } from "./types.ts";

const ERROR_THRESHOLD = 3;

export async function executeDictSync(
  diff: DictDiff,
  apiUrl: string,
  options: { dryRun: boolean },
): Promise<DictSyncResult> {
  const errors: DictSyncError[] = [];
  let consecutiveErrors = 0;
  const applied = { updated: 0, added: 0, deleted: 0 };

  function checkAbort() {
    if (consecutiveErrors >= ERROR_THRESHOLD) {
      throw new DictSyncAbortError(
        `dict-sync aborted: ${consecutiveErrors} consecutive errors`,
      );
    }
  }

  // UPDATE
  for (const { uuid, word } of diff.toUpdate) {
    if (options.dryRun) {
      console.log(`[dry-run] UPDATE "${word.surface}" (${uuid})`);
      applied.updated++;
      consecutiveErrors = 0;
      continue;
    }
    try {
      await updateUserDictWord(apiUrl, uuid, word);
      applied.updated++;
      consecutiveErrors = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ op: "UPDATE", surface: word.surface, error: message });
      consecutiveErrors++;
      checkAbort();
    }
  }

  // ADD
  for (const word of diff.toAdd) {
    if (options.dryRun) {
      console.log(`[dry-run] ADD "${word.surface}"`);
      applied.added++;
      consecutiveErrors = 0;
      continue;
    }
    try {
      await addUserDictWord(apiUrl, word);
      applied.added++;
      consecutiveErrors = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ op: "ADD", surface: word.surface, error: message });
      consecutiveErrors++;
      checkAbort();
    }
  }

  // DELETE
  for (const uuid of diff.toDelete) {
    if (options.dryRun) {
      console.log(`[dry-run] DELETE ${uuid}`);
      applied.deleted++;
      consecutiveErrors = 0;
      continue;
    }
    try {
      await deleteUserDictWord(apiUrl, uuid);
      applied.deleted++;
      consecutiveErrors = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ op: "DELETE", surface: uuid, error: message });
      consecutiveErrors++;
      checkAbort();
    }
  }

  return { diff, applied, errors, aborted: false };
}
