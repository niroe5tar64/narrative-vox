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
  emotionStyles?: Record<string, number>;
}

export interface CharacterMap {
  defaultCharacterKey?: string;
  characters: Record<string, CharacterVoice>;
  emotionStyles?: Record<string, Record<string, number>>;
}

const CHARACTER_KEY_RE = /^[a-z][a-z0-9_-]*$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Character map ${fieldName} must be a non-empty string`);
  }
  return value;
}

export function requireStyleId(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Character map ${fieldName} must be a non-negative number`);
  }
  return Math.trunc(parsed);
}

function requirePositiveStyleId(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Character map ${fieldName} must be a positive integer`);
  }
  return parsed;
}

function requireEmotionKey(value: string, fieldName: string): string {
  const key = value.trim();
  if (!key) {
    throw new Error(`Character map ${fieldName} must be a non-empty string`);
  }
  return key;
}

export function normalizeEmotionStylesForCharacter(
  raw: unknown,
  fieldName: string,
): Record<string, number> {
  if (!isRecord(raw)) {
    throw new Error(`Character map ${fieldName} must be an object`);
  }

  const emotionStyles: Record<string, number> = {};
  for (const [rawEmotionKey, rawStyleId] of Object.entries(raw)) {
    const emotionKey = requireEmotionKey(
      rawEmotionKey,
      `${fieldName}.${rawEmotionKey}`,
    );
    emotionStyles[emotionKey] = requirePositiveStyleId(
      rawStyleId,
      `${fieldName}.${rawEmotionKey}`,
    );
  }
  return emotionStyles;
}

export function normalizeCharacterKey(
  value: string,
  fieldName: string,
): string {
  if (!CHARACTER_KEY_RE.test(value)) {
    throw new Error(
      `Character map ${fieldName} must match ${CHARACTER_KEY_RE.toString()} (received: ${value})`,
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
  const emotionStylesRaw = raw.emotionStyles;

  if (!isRecord(charactersRaw)) {
    throw new Error("Character map characters must be an object");
  }
  const charactersRecord = charactersRaw;
  const characters: Record<string, CharacterVoice> = {};

  for (const [rawKey, rawVoice] of Object.entries(charactersRecord)) {
    const characterKey = normalizeCharacterKey(rawKey, `characters.${rawKey}`);
    if (!isRecord(rawVoice)) {
      throw new Error(
        `Character map characters.${characterKey} must be an object`,
      );
    }
    characters[characterKey] = {
      engineId: requireString(
        rawVoice.engineId,
        `characters.${characterKey}.engineId`,
      ),
      speakerId: requireString(
        rawVoice.speakerId,
        `characters.${characterKey}.speakerId`,
      ),
      styleId: requireStyleId(
        rawVoice.styleId,
        `characters.${characterKey}.styleId`,
      ),
    };
  }

  const defaultCharacterKey =
    typeof defaultCharacterKeyRaw === "string" &&
    defaultCharacterKeyRaw.trim().length > 0
      ? normalizeCharacterKey(
          defaultCharacterKeyRaw.trim(),
          "defaultCharacterKey",
        )
      : undefined;
  if (defaultCharacterKey && !characters[defaultCharacterKey]) {
    throw new Error(
      `Character map defaultCharacterKey "${defaultCharacterKey}" is not defined in characters`,
    );
  }

  let emotionStyles: Record<string, Record<string, number>> | undefined;
  if (emotionStylesRaw !== undefined) {
    if (!isRecord(emotionStylesRaw)) {
      throw new Error("Character map emotionStyles must be an object");
    }
    const normalizedEmotionStyles: Record<string, Record<string, number>> = {};
    for (const [rawCharacterKey, rawEmotionMap] of Object.entries(
      emotionStylesRaw,
    )) {
      const characterKey = normalizeCharacterKey(
        rawCharacterKey,
        `emotionStyles.${rawCharacterKey}`,
      );
      if (!characters[characterKey]) {
        throw new Error(
          `Character map emotionStyles.${characterKey} is not defined in characters`,
        );
      }
      normalizedEmotionStyles[characterKey] =
        normalizeEmotionStylesForCharacter(
          rawEmotionMap,
          `emotionStyles.${characterKey}`,
        );
    }
    emotionStyles = normalizedEmotionStyles;
  }

  return {
    ...(defaultCharacterKey ? { defaultCharacterKey } : {}),
    characters,
    ...(emotionStyles ? { emotionStyles } : {}),
  };
}

export function buildRunCharacters(
  defs: CharacterDefinition[],
  defaultKey?: string,
): CharacterMap {
  const characters: Record<string, CharacterVoice> = {};
  const emotionStyles: Record<string, Record<string, number>> = {};
  for (const def of defs) {
    characters[def.key] = def.voice;
    if (def.emotionStyles && Object.keys(def.emotionStyles).length > 0) {
      emotionStyles[def.key] = def.emotionStyles;
    }
  }
  if (defaultKey && !characters[defaultKey]) {
    throw new Error(
      `Character map defaultCharacterKey "${defaultKey}" is not defined in characters`,
    );
  }
  return {
    ...(defaultKey ? { defaultCharacterKey: defaultKey } : {}),
    characters,
    ...(Object.keys(emotionStyles).length > 0 ? { emotionStyles } : {}),
  };
}
