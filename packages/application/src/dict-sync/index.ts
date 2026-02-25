import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateAgainstSchema } from "@narrative-vox/infrastructure/schema-validator.ts";
import type { UserDictWordEntry } from "@narrative-vox/infrastructure/voicevox-user-dict.ts";
import { fetchUserDict } from "@narrative-vox/infrastructure/voicevox-user-dict.ts";
import { computeDictDiff } from "./diff.ts";
import { syncLegacy } from "./legacy.ts";
import { executeDictSync } from "./sync.ts";
import type { DictSyncResult } from "./types.ts";

export type {
  DictDiff,
  DictSyncError,
  DictSyncResult,
  DictUpdate,
} from "./types.ts";
export { DictSyncAbortError } from "./types.ts";

const DEFAULT_DICT_PATH = "configs/voice/voicevox/user-dict.json";
const SCHEMA_PATH = "schemas/user-dict.schema.json";

interface UserDictFile {
  version: number;
  words: UserDictWordEntry[];
}

export async function syncUserDict(options: {
  apiUrl: string;
  dictPath?: string;
  dryRun?: boolean;
  legacySync?: boolean;
}): Promise<DictSyncResult> {
  const dictPath = path.resolve(options.dictPath ?? DEFAULT_DICT_PATH);
  const schemaPath = path.resolve(SCHEMA_PATH);

  const raw = await readFile(dictPath, "utf-8");
  const dictData: UserDictFile = JSON.parse(raw);
  await validateAgainstSchema(dictData, schemaPath);

  if (options.legacySync) {
    const legacy = await syncLegacy(options.apiUrl, dictData.words);
    // Wrap legacy result in DictSyncResult shape for uniform handling
    return {
      diff: {
        toAdd: [],
        toUpdate: [],
        toDelete: [],
        unchanged: 0,
      },
      applied: {
        updated: 0,
        added: legacy.added,
        deleted: legacy.deleted,
      },
      errors: legacy.errors.map((e) => ({
        op: "LEGACY",
        surface: "",
        error: e,
      })),
      aborted: false,
    };
  }

  const remote = await fetchUserDict(options.apiUrl);
  const diff = computeDictDiff(dictData.words, remote);
  return executeDictSync(diff, options.apiUrl, {
    dryRun: options.dryRun ?? false,
  });
}
