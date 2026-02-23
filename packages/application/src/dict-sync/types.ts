import type { UserDictWordEntry } from "@narrative-vox/infrastructure/voicevox-user-dict.ts";

export interface DictUpdate {
  uuid: string;
  word: UserDictWordEntry;
}

export interface DictDiff {
  toAdd: UserDictWordEntry[];
  toUpdate: DictUpdate[];
  toDelete: string[]; // UUID
  unchanged: number;
}

export interface DictSyncError {
  op: string;
  surface: string;
  error: string;
}

export interface DictSyncResult {
  diff: DictDiff;
  applied: { updated: number; added: number; deleted: number };
  errors: DictSyncError[];
  aborted: boolean;
}

export class DictSyncAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DictSyncAbortError";
  }
}
