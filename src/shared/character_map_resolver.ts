import path from "node:path";
import {
  buildRunCharacters,
  loadCharacterDefinitions,
  normalizeCharacterMap,
  type CharacterMap
} from "./characters.ts";
import { pathExists } from "./fs_utils.ts";
import { loadJson } from "./json.ts";
import { SchemaPaths } from "./schema_paths.ts";

export interface ResolveCharacterMapOptions {
  characterMapPath?: string;
  defaultCharacterMapPath?: string;
  characterDefinitionsDir?: string;
  defaultCharacterKey?: string;
}

export interface ResolvedCharacterMap {
  characterMap?: CharacterMap;
  source?: string;
}

export async function resolveCharacterMap(
  options: ResolveCharacterMapOptions = {}
): Promise<ResolvedCharacterMap> {
  const explicitCharacterMapPath = options.characterMapPath
    ? path.resolve(options.characterMapPath)
    : undefined;
  if (explicitCharacterMapPath) {
    return {
      characterMap: normalizeCharacterMap(await loadJson<unknown>(explicitCharacterMapPath, SchemaPaths.characterMap)),
      source: explicitCharacterMapPath
    };
  }

  const defaultCharacterMapPath = path.resolve(
    options.defaultCharacterMapPath ?? "configs/voicevox/default_character_map.json"
  );
  if (await pathExists(defaultCharacterMapPath)) {
    return {
      characterMap: normalizeCharacterMap(await loadJson<unknown>(defaultCharacterMapPath, SchemaPaths.characterMap)),
      source: defaultCharacterMapPath
    };
  }

  const characterDefinitionsDir = path.resolve(
    options.characterDefinitionsDir ?? "configs/characters"
  );
  if (await pathExists(characterDefinitionsDir)) {
    const definitions = await loadCharacterDefinitions(characterDefinitionsDir);
    if (definitions.length > 0) {
      return {
        characterMap: buildRunCharacters(definitions, options.defaultCharacterKey),
        source: characterDefinitionsDir
      };
    }
  }

  return {};
}
