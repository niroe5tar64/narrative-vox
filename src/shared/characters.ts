import { readdir } from "node:fs/promises";
import path from "node:path";
import { readJson } from "./json.ts";

export interface CharacterVoice {
  engineId: string;
  speakerId: string;
  styleId: number;
}

export interface CharacterDefinition {
  key: string;
  name?: string;
  description?: string;
  voice: CharacterVoice;
}

export interface CharacterMap {
  defaultCharacterKey?: string;
  characters: Record<string, CharacterVoice>;
}

const CHARACTER_KEY_RE = /^[a-z][a-z0-9_-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Character map ${fieldName} must be a non-empty string`);
  }
  return value;
}

function requireStyleId(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Character map ${fieldName} must be a non-negative number`);
  }
  return Math.trunc(parsed);
}

function normalizeCharacterKey(value: string, fieldName: string): string {
  if (!CHARACTER_KEY_RE.test(value)) {
    throw new Error(
      `Character map ${fieldName} must match ${CHARACTER_KEY_RE.toString()} (received: ${value})`
    );
  }
  return value;
}

export function normalizeCharacterMap(raw: unknown): CharacterMap {
  if (!isRecord(raw)) {
    throw new Error("Character map root must be an object");
  }

  const defaultCharacterKeyRaw = raw.defaultCharacterKey;
  const charactersRaw = raw.characters;

  const charactersRecord = isRecord(charactersRaw) ? charactersRaw : {};
  const characters: Record<string, CharacterVoice> = {};

  for (const [rawKey, rawVoice] of Object.entries(charactersRecord)) {
    const characterKey = normalizeCharacterKey(rawKey, `characters.${rawKey}`);
    if (!isRecord(rawVoice)) {
      throw new Error(`Character map characters.${characterKey} must be an object`);
    }
    characters[characterKey] = {
      engineId: requireString(rawVoice.engineId, `characters.${characterKey}.engineId`),
      speakerId: requireString(rawVoice.speakerId, `characters.${characterKey}.speakerId`),
      styleId: requireStyleId(rawVoice.styleId, `characters.${characterKey}.styleId`)
    };
  }

  const defaultCharacterKey =
    typeof defaultCharacterKeyRaw === "string" && defaultCharacterKeyRaw.trim().length > 0
      ? normalizeCharacterKey(defaultCharacterKeyRaw.trim(), "defaultCharacterKey")
      : undefined;
  if (defaultCharacterKey && !characters[defaultCharacterKey]) {
    throw new Error(
      `Character map defaultCharacterKey "${defaultCharacterKey}" is not defined in characters`
    );
  }

  return {
    ...(defaultCharacterKey ? { defaultCharacterKey } : {}),
    characters
  };
}

export async function loadCharacterDefinitions(dirPath: string): Promise<CharacterDefinition[]> {
  const resolvedDir = path.resolve(dirPath);
  const entries = await readdir(resolvedDir);
  const jsonFiles = entries.filter((name) => name.endsWith(".json")).sort();
  const definitions: CharacterDefinition[] = [];

  for (const fileName of jsonFiles) {
    const filePath = path.join(resolvedDir, fileName);
    const raw = (await readJson(filePath)) as Record<string, unknown>;
    const key = normalizeCharacterKey(String(raw.key ?? ""), `${fileName}.key`);
    const voice = raw.voice;
    if (!isRecord(voice)) {
      throw new Error(`${fileName}.voice must be an object`);
    }
    definitions.push({
      key,
      ...(typeof raw.name === "string" ? { name: raw.name } : {}),
      ...(typeof raw.description === "string" ? { description: raw.description } : {}),
      voice: {
        engineId: requireString(voice.engineId, `${fileName}.voice.engineId`),
        speakerId: requireString(voice.speakerId, `${fileName}.voice.speakerId`),
        styleId: requireStyleId(voice.styleId, `${fileName}.voice.styleId`)
      }
    });
  }

  return definitions;
}

export function buildRunCharacters(defs: CharacterDefinition[], defaultKey?: string): CharacterMap {
  const characters: Record<string, CharacterVoice> = {};
  for (const def of defs) {
    characters[def.key] = def.voice;
  }
  if (defaultKey && !characters[defaultKey]) {
    throw new Error(
      `Character map defaultCharacterKey "${defaultKey}" is not defined in characters`
    );
  }
  return {
    ...(defaultKey ? { defaultCharacterKey: defaultKey } : {}),
    characters
  };
}
