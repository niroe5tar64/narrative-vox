import { readdir } from "node:fs/promises";
import path from "node:path";
import type { CharacterDefinition } from "@narrative-vox/domain/characters.ts";
import {
  isRecord,
  normalizeCharacterKey,
  normalizeEmotionStylesForCharacter,
  requireString,
  requireStyleId,
} from "@narrative-vox/domain/characters.ts";
import { loadConfig } from "./json.ts";
import { SchemaPaths } from "./schema-paths.ts";

export async function loadCharacterDefinitions(
  dirPath: string,
): Promise<CharacterDefinition[]> {
  const resolvedDir = path.resolve(dirPath);
  const entries = await readdir(resolvedDir);
  const jsonFiles = entries.filter((name) => name.endsWith(".yaml")).sort();
  const definitions: CharacterDefinition[] = [];

  for (const fileName of jsonFiles) {
    const filePath = path.join(resolvedDir, fileName);
    const raw = (await loadConfig<Record<string, unknown>>(
      filePath,
      SchemaPaths.character,
    )) as Record<string, unknown>;
    const key = normalizeCharacterKey(String(raw.key ?? ""), `${fileName}.key`);
    const voice = raw.voice;
    if (!isRecord(voice)) {
      throw new Error(`${fileName}.voice must be an object`);
    }
    definitions.push({
      key,
      ...(typeof raw.name === "string" ? { name: raw.name } : {}),
      ...(typeof raw.description === "string"
        ? { description: raw.description }
        : {}),
      voice: {
        engineId: requireString(voice.engineId, `${fileName}.voice.engineId`),
        speakerId: requireString(
          voice.speakerId,
          `${fileName}.voice.speakerId`,
        ),
        styleId: requireStyleId(voice.styleId, `${fileName}.voice.styleId`),
      },
      ...(raw.emotionStyles !== undefined
        ? {
            emotionStyles: normalizeEmotionStylesForCharacter(
              raw.emotionStyles,
              `${fileName}.emotionStyles`,
            ),
          }
        : {}),
    });
  }

  return definitions;
}
