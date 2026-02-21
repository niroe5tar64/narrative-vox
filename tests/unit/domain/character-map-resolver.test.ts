import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveCharacterMap } from "@narrative-vox/infrastructure/character-map-resolver.ts";

const ENGINE_ID = "074fc39e-678b-4c13-8916-ffca8d505d1d";
const SAMPLE_PROFILE = {
  gender: "neutral",
  age_range: "adult",
  knowledge_level: "expert",
  personality_traits: ["論理的"],
  speech_register: "polite_desu_masu",
  sentence_patterns: {
    typical_endings: ["です"],
    filler_words: [],
    catchphrases: [],
    forbidden_patterns: []
  },
  interaction_behavior: {
    explains_by: "logical_steps",
    responds_to_questions_by: "direct_answer",
    emotion_range: "narrow"
  },
  topic_affinity: {
    enthusiastic_about: [],
    cautious_about: []
  }
} as const;

test("resolveCharacterMap uses explicit character-map path first", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-char-map-"));
  const explicitMapPath = path.join(tempDir, "explicit_character_map.json");
  const charsDir = path.join(tempDir, "characters");
  await mkdir(charsDir, { recursive: true });

  await writeFile(
    explicitMapPath,
    JSON.stringify({
      defaultCharacterKey: "narrator",
      characters: {
        narrator: {
          engineId: ENGINE_ID,
          speakerId: "speaker-explicit",
          styleId: 1
        }
      }
    }),
    "utf-8"
  );

  await writeFile(
    path.join(charsDir, "narrator.json"),
    JSON.stringify({
      key: "narrator",
      name: "Narrator",
      description: "Fallback narrator",
      voice: {
        engineId: ENGINE_ID,
        speakerId: "speaker-fallback",
        styleId: 2
      },
      emotionStyles: {
        calm: 2
      },
      profile: SAMPLE_PROFILE
    }),
    "utf-8"
  );

  const resolved = await resolveCharacterMap({
    characterMapPath: explicitMapPath,
    characterDefinitionsDir: charsDir
  });

  assert.equal(resolved.source, path.resolve(explicitMapPath));
  assert.equal(resolved.characterMap?.characters.narrator.speakerId, "speaker-explicit");
});

test("resolveCharacterMap falls back to character definitions when map file is absent", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-char-map-"));
  const missingMapPath = path.join(tempDir, "missing_character_map.json");
  const charsDir = path.join(tempDir, "characters");
  await mkdir(charsDir, { recursive: true });

  await writeFile(
    path.join(charsDir, "narrator.json"),
    JSON.stringify({
      key: "narrator",
      name: "Narrator",
      description: "Definition narrator",
      voice: {
        engineId: ENGINE_ID,
        speakerId: "speaker-from-def",
        styleId: 3
      },
      emotionStyles: {
        calm: 3
      },
      profile: SAMPLE_PROFILE
    }),
    "utf-8"
  );

  const resolved = await resolveCharacterMap({
    defaultCharacterMapPath: missingMapPath,
    characterDefinitionsDir: charsDir,
    defaultCharacterKey: "narrator"
  });

  assert.equal(resolved.source, path.resolve(charsDir));
  assert.equal(resolved.characterMap?.defaultCharacterKey, "narrator");
  assert.equal(resolved.characterMap?.characters.narrator.speakerId, "speaker-from-def");
  assert.equal(resolved.characterMap?.emotionStyles?.narrator.calm, 3);
});

test("resolveCharacterMap rejects character map file missing characters field", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-char-map-"));
  const mapPath = path.join(tempDir, "bad_character_map.json");

  await writeFile(
    mapPath,
    JSON.stringify({ defaultCharacterKey: "narrator" }),
    "utf-8"
  );

  await assert.rejects(
    () => resolveCharacterMap({ characterMapPath: mapPath }),
    /Schema validation failed \(character-map\.schema\.json\)/
  );
});

test("resolveCharacterMap rejects character map file with empty characters object", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-char-map-"));
  const mapPath = path.join(tempDir, "empty_characters_map.json");

  await writeFile(
    mapPath,
    JSON.stringify({ characters: {} }),
    "utf-8"
  );

  await assert.rejects(
    () => resolveCharacterMap({ characterMapPath: mapPath }),
    /Schema validation failed \(character-map\.schema\.json\)/
  );
});

test("resolveCharacterMap returns empty result when no sources are available", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-char-map-"));
  const missingMapPath = path.join(tempDir, "missing_character_map.json");
  const missingCharsDir = path.join(tempDir, "missing_characters");

  const resolved = await resolveCharacterMap({
    defaultCharacterMapPath: missingMapPath,
    characterDefinitionsDir: missingCharsDir
  });

  assert.equal(resolved.source, undefined);
  assert.equal(resolved.characterMap, undefined);
});
