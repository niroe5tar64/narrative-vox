import type {
  EngineUserDict,
  UserDictWordEntry,
} from "@narrative-vox/infrastructure/voicevox-user-dict.ts";
import type { DictDiff, DictUpdate } from "./types.ts";

function isSameContent(
  local: UserDictWordEntry,
  remote: {
    pronunciation: string;
    accent_type: number;
    word_type: string;
    priority: number;
  },
): boolean {
  return (
    local.pronunciation === remote.pronunciation &&
    (local.accent_type ?? 0) === remote.accent_type &&
    (local.word_type ?? "PROPER_NOUN") === remote.word_type &&
    (local.priority ?? 5) === remote.priority
  );
}

export function computeDictDiff(
  local: UserDictWordEntry[],
  remote: EngineUserDict,
): DictDiff {
  const localBySurface = new Map<string, UserDictWordEntry>();
  for (const entry of local) {
    localBySurface.set(entry.surface, entry);
  }

  const toAdd: UserDictWordEntry[] = [];
  const toUpdate: DictUpdate[] = [];
  const toDelete: string[] = [];
  let unchanged = 0;

  // Check remote entries: update or delete
  for (const [uuid, remoteEntry] of Object.entries(remote)) {
    const localEntry = localBySurface.get(remoteEntry.surface);
    if (localEntry === undefined) {
      toDelete.push(uuid);
    } else if (isSameContent(localEntry, remoteEntry)) {
      unchanged++;
      localBySurface.delete(remoteEntry.surface);
    } else {
      toUpdate.push({ uuid, word: localEntry });
      localBySurface.delete(remoteEntry.surface);
    }
  }

  // Remaining local entries have no remote counterpart → add
  for (const entry of localBySurface.values()) {
    toAdd.push(entry);
  }

  return { toAdd, toUpdate, toDelete, unchanged };
}
