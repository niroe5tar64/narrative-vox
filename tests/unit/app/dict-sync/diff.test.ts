import { test } from "bun:test";
import assert from "node:assert/strict";
import { computeDictDiff } from "@narrative-vox/application/dict-sync/diff.ts";
import type {
  EngineUserDict,
  UserDictWordEntry,
} from "@narrative-vox/infrastructure/voicevox-user-dict.ts";

const BASE_ENTRY = {
  accent_type: 0,
  word_type: "PROPER_NOUN",
  priority: 5,
  mora_count: 3,
};

test("computeDictDiff: all new → toAdd", () => {
  const local: UserDictWordEntry[] = [
    {
      surface: "Alpha",
      pronunciation: "アルファ",
      accent_type: 0,
      word_type: "PROPER_NOUN",
      priority: 5,
    },
  ];
  const remote: EngineUserDict = {};

  const diff = computeDictDiff(local, remote);

  assert.equal(diff.toAdd.length, 1);
  assert.equal(diff.toAdd[0].surface, "Alpha");
  assert.equal(diff.toUpdate.length, 0);
  assert.equal(diff.toDelete.length, 0);
  assert.equal(diff.unchanged, 0);
});

test("computeDictDiff: unchanged entries", () => {
  const local: UserDictWordEntry[] = [
    {
      surface: "Beta",
      pronunciation: "ベータ",
      accent_type: 0,
      word_type: "PROPER_NOUN",
      priority: 5,
    },
  ];
  const remote: EngineUserDict = {
    "uuid-beta": { surface: "Beta", pronunciation: "ベータ", ...BASE_ENTRY },
  };

  const diff = computeDictDiff(local, remote);

  assert.equal(diff.unchanged, 1);
  assert.equal(diff.toAdd.length, 0);
  assert.equal(diff.toUpdate.length, 0);
  assert.equal(diff.toDelete.length, 0);
});

test("computeDictDiff: content change → toUpdate", () => {
  const local: UserDictWordEntry[] = [
    {
      surface: "Gamma",
      pronunciation: "ガンマニュー",
      accent_type: 1,
      word_type: "PROPER_NOUN",
      priority: 5,
    },
  ];
  const remote: EngineUserDict = {
    "uuid-gamma": { surface: "Gamma", pronunciation: "ガンマ", ...BASE_ENTRY },
  };

  const diff = computeDictDiff(local, remote);

  assert.equal(diff.toUpdate.length, 1);
  assert.equal(diff.toUpdate[0].uuid, "uuid-gamma");
  assert.equal(diff.toUpdate[0].word.pronunciation, "ガンマニュー");
  assert.equal(diff.toAdd.length, 0);
  assert.equal(diff.toDelete.length, 0);
  assert.equal(diff.unchanged, 0);
});

test("computeDictDiff: remote-only → toDelete", () => {
  const local: UserDictWordEntry[] = [];
  const remote: EngineUserDict = {
    "uuid-delta": { surface: "Delta", pronunciation: "デルタ", ...BASE_ENTRY },
  };

  const diff = computeDictDiff(local, remote);

  assert.equal(diff.toDelete.length, 1);
  assert.equal(diff.toDelete[0], "uuid-delta");
  assert.equal(diff.toAdd.length, 0);
  assert.equal(diff.toUpdate.length, 0);
  assert.equal(diff.unchanged, 0);
});

test("computeDictDiff: mixed scenario", () => {
  const local: UserDictWordEntry[] = [
    {
      surface: "Keep",
      pronunciation: "キープ",
      accent_type: 0,
      word_type: "PROPER_NOUN",
      priority: 5,
    },
    {
      surface: "Change",
      pronunciation: "チェンジニュー",
      accent_type: 0,
      word_type: "PROPER_NOUN",
      priority: 5,
    },
    {
      surface: "New",
      pronunciation: "ニュー",
      accent_type: 0,
      word_type: "PROPER_NOUN",
      priority: 5,
    },
  ];
  const remote: EngineUserDict = {
    "uuid-keep": { surface: "Keep", pronunciation: "キープ", ...BASE_ENTRY },
    "uuid-change": {
      surface: "Change",
      pronunciation: "チェンジ",
      ...BASE_ENTRY,
    },
    "uuid-gone": { surface: "Gone", pronunciation: "ゴーン", ...BASE_ENTRY },
  };

  const diff = computeDictDiff(local, remote);

  assert.equal(diff.unchanged, 1);
  assert.equal(diff.toUpdate.length, 1);
  assert.equal(diff.toUpdate[0].uuid, "uuid-change");
  assert.equal(diff.toAdd.length, 1);
  assert.equal(diff.toAdd[0].surface, "New");
  assert.equal(diff.toDelete.length, 1);
  assert.equal(diff.toDelete[0], "uuid-gone");
});

test("computeDictDiff: default field values treated as equal", () => {
  // Local uses undefined (defaults); remote has explicit defaults
  const local: UserDictWordEntry[] = [
    { surface: "Epsilon", pronunciation: "エプシロン" },
    // accent_type=undefined→0, word_type=undefined→"PROPER_NOUN", priority=undefined→5
  ];
  const remote: EngineUserDict = {
    "uuid-eps": {
      surface: "Epsilon",
      pronunciation: "エプシロン",
      accent_type: 0,
      word_type: "PROPER_NOUN",
      priority: 5,
      mora_count: 5,
    },
  };

  const diff = computeDictDiff(local, remote);

  assert.equal(diff.unchanged, 1);
  assert.equal(diff.toAdd.length, 0);
  assert.equal(diff.toUpdate.length, 0);
  assert.equal(diff.toDelete.length, 0);
});
