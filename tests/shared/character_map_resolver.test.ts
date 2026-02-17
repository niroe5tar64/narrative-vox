import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveCharacterMap } from "../../src/shared/character_map_resolver.ts";

const ENGINE_ID = "074fc39e-678b-4c13-8916-ffca8d505d1d";

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
      voice: {
        engineId: ENGINE_ID,
        speakerId: "speaker-fallback",
        styleId: 2
      }
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
      voice: {
        engineId: ENGINE_ID,
        speakerId: "speaker-from-def",
        styleId: 3
      },
      emotionStyles: {
        calm: 3
      }
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
