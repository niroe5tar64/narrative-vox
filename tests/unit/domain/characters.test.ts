import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildRunCharacters,
  normalizeCharacterMap,
} from "@narrative-vox/domain/characters.ts";
import { loadCharacterDefinitions } from "@narrative-vox/infrastructure/character-loader.ts";

const sampleCharacterProfile = {
  gender: "neutral",
  age_range: "adult",
  knowledge_level: "expert",
  personality_traits: ["論理的"],
  speech_register: "polite_desu_masu",
  sentence_patterns: {
    typical_endings: ["です"],
    filler_words: [],
    catchphrases: [],
    forbidden_patterns: [],
  },
  interaction_behavior: {
    explains_by: "logical_steps",
    responds_to_questions_by: "direct_answer",
    emotion_range: "narrow",
  },
  topic_affinity: {
    enthusiastic_about: [],
    cautious_about: [],
  },
} as const;

test("normalizeCharacterMap rejects non-object root", () => {
  assert.throws(
    () => normalizeCharacterMap("bad"),
    /Character map root must be an object/,
  );
  assert.throws(
    () => normalizeCharacterMap(null),
    /Character map root must be an object/,
  );
  assert.throws(
    () => normalizeCharacterMap(42),
    /Character map root must be an object/,
  );
});

test("normalizeCharacterMap rejects missing characters field", () => {
  assert.throws(
    () => normalizeCharacterMap({}),
    /Character map characters must be an object/,
  );
  assert.throws(
    () => normalizeCharacterMap({ characters: null }),
    /Character map characters must be an object/,
  );
  assert.throws(
    () => normalizeCharacterMap({ characters: "bad" }),
    /Character map characters must be an object/,
  );
});

test("normalizeCharacterMap parses valid character map", () => {
  const result = normalizeCharacterMap({
    defaultCharacterKey: "narrator",
    characters: {
      narrator: {
        engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
        speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
        styleId: 67,
      },
    },
    emotionStyles: {
      narrator: {
        calm: 67,
        energetic: 68,
      },
    },
  });

  assert.equal(result.defaultCharacterKey, "narrator");
  assert.deepEqual(result.characters.narrator, {
    engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
    speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
    styleId: 67,
  });
  assert.deepEqual(result.emotionStyles?.narrator, {
    calm: 67,
    energetic: 68,
  });
});

test("normalizeCharacterMap rejects invalid character key", () => {
  assert.throws(
    () =>
      normalizeCharacterMap({
        characters: {
          Bad: {
            engineId: "e",
            speakerId: "s",
            styleId: 1,
          },
        },
      }),
    /must match/,
  );
});

test("normalizeCharacterMap rejects defaultCharacterKey not in characters", () => {
  assert.throws(
    () =>
      normalizeCharacterMap({
        defaultCharacterKey: "ghost",
        characters: {
          narrator: {
            engineId: "e",
            speakerId: "s",
            styleId: 1,
          },
        },
      }),
    /defaultCharacterKey "ghost" is not defined in characters/,
  );
});

test("normalizeCharacterMap preserves optional name and description", () => {
  const result = normalizeCharacterMap({
    characters: {
      narrator: {
        engineId: "e",
        speakerId: "s",
        styleId: 1,
      },
    },
  });

  assert.equal(result.defaultCharacterKey, undefined);
  assert.deepEqual(result.characters.narrator, {
    engineId: "e",
    speakerId: "s",
    styleId: 1,
  });
});

test("normalizeCharacterMap rejects emotionStyles for undefined character", () => {
  assert.throws(
    () =>
      normalizeCharacterMap({
        characters: {
          narrator: {
            engineId: "e",
            speakerId: "s",
            styleId: 1,
          },
        },
        emotionStyles: {
          teacher: {
            calm: 67,
          },
        },
      }),
    /emotionStyles.teacher is not defined in characters/,
  );
});

test("loadCharacterDefinitions reads all *.json from directory", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-chars-"));
  const charsDir = path.join(tempDir, "characters");
  await mkdir(charsDir, { recursive: true });

  await writeFile(
    path.join(charsDir, "narrator.json"),
    JSON.stringify({
      key: "narrator",
      name: "ナレーター",
      description: "Default narrator voice",
      voice: {
        engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
        speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
        styleId: 67,
      },
      emotionStyles: {
        calm: 67,
        energetic: 68,
      },
      profile: sampleCharacterProfile,
    }),
    "utf-8",
  );

  await writeFile(
    path.join(charsDir, "teacher.json"),
    JSON.stringify({
      key: "teacher",
      name: "先生",
      description: "Teacher voice",
      voice: {
        engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
        speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
        styleId: 68,
      },
      emotionStyles: {
        calm: 68,
      },
      profile: sampleCharacterProfile,
    }),
    "utf-8",
  );

  const defs = await loadCharacterDefinitions(charsDir);
  assert.equal(defs.length, 2);
  assert.equal(defs[0].key, "narrator");
  assert.equal(defs[0].name, "ナレーター");
  assert.equal(defs[0].description, "Default narrator voice");
  assert.equal(defs[0].voice.styleId, 67);
  assert.deepEqual(defs[0].emotionStyles, {
    calm: 67,
    energetic: 68,
  });
  assert.equal(defs[1].key, "teacher");
  assert.equal(defs[1].name, "先生");
  assert.equal(defs[1].description, "Teacher voice");
  assert.equal(defs[1].voice.styleId, 68);
});

test("loadCharacterDefinitions rejects schema-invalid character file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-chars-"));
  const charsDir = path.join(tempDir, "characters");
  await mkdir(charsDir, { recursive: true });

  await writeFile(
    path.join(charsDir, "bad.json"),
    JSON.stringify({
      key: "bad",
      name: "Bad",
      description: "Missing required profile",
      voice: {
        engineId: "e",
        speakerId: "s",
        styleId: 1,
      },
      emotionStyles: {
        calm: 1,
      },
    }),
    "utf-8",
  );

  await assert.rejects(
    () => loadCharacterDefinitions(charsDir),
    /Schema validation failed \(character\.schema\.json\)/,
  );
});

test("loadCharacterDefinitions rejects invalid emotionStyles values", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-chars-"));
  const charsDir = path.join(tempDir, "characters");
  await mkdir(charsDir, { recursive: true });

  await writeFile(
    path.join(charsDir, "bad.json"),
    JSON.stringify({
      key: "bad",
      name: "Bad",
      description: "Bad style id",
      voice: {
        engineId: "e",
        speakerId: "s",
        styleId: 1,
      },
      emotionStyles: {
        calm: 0,
      },
      profile: sampleCharacterProfile,
    }),
    "utf-8",
  );

  await assert.rejects(
    () => loadCharacterDefinitions(charsDir),
    /emotionStyles.calm must be a positive integer/,
  );
});

test("buildRunCharacters assembles CharacterMap from definitions", () => {
  const defs = [
    {
      key: "narrator",
      voice: {
        engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
        speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
        styleId: 67,
      },
      emotionStyles: {
        calm: 67,
        energetic: 68,
      },
    },
    {
      key: "teacher",
      voice: {
        engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
        speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
        styleId: 68,
      },
    },
  ];

  const result = buildRunCharacters(defs, "narrator");
  assert.equal(result.defaultCharacterKey, "narrator");
  assert.equal(Object.keys(result.characters).length, 2);
  assert.equal(result.characters.narrator.styleId, 67);
  assert.equal(result.characters.teacher.styleId, 68);
  assert.deepEqual(result.emotionStyles?.narrator, {
    calm: 67,
    energetic: 68,
  });
});
