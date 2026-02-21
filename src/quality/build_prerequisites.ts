import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveCharacterMap } from "../infra/character_map_resolver.ts";
import { resolveSynthesisDefaultsPath, resolveSpeedProfilesPath } from "../infra/config_resolver.ts";
import { loadJson } from "../infra/json.ts";
import { parseSpeakerTag } from "../domain/speaker_tag.ts";
import { normalizeSynthesisDefaults, type RawSynthesisDefaults } from "../domain/synthesis_defaults.ts";
import { resolveVoicevoxApiUrl } from "../infra/voicevox_engine.ts";
import { loadSpeedProfiles } from "../app/build_project/speed_profiles.ts";

export interface BuildPrerequisiteOptions {
  scriptPaths: string[];
  synthesisDefaultsPath?: string;
  characterMapPath?: string;
  characterKey?: string;
  engineId?: string;
  speakerId?: string;
  styleId?: number;
  emotion?: string;
  voicevoxApiUrl?: string;
  speedPreset?: string;
  speedProfilesPath?: string;
}

export interface BuildPrerequisiteResult {
  scriptCount: number;
  speakerKeys: string[];
  resolvedSynthesisDefaultsPath: string;
  resolvedCharacterMapSource?: string;
  resolvedVoicevoxApiUrl: string;
  resolvedSpeedProfilesPath?: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchReachability(endpoint: URL, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureVoicevoxReachable(voicevoxApiUrl: string, timeoutMs = 2000): Promise<void> {
  const versionEndpoint = new URL("/version", voicevoxApiUrl);
  if (await fetchReachability(versionEndpoint, timeoutMs)) {
    return;
  }

  throw new Error(
    `VOICEVOX Engine is not reachable: ${voicevoxApiUrl}. Use --voicevox-url explicitly if needed.`
  );
}

async function collectSpeakerKeys(scriptPaths: string[]): Promise<string[]> {
  const keys = new Set<string>();
  for (const scriptPath of scriptPaths) {
    const text = await readFile(path.resolve(scriptPath), "utf-8");
    for (const line of text.split(/\r?\n/)) {
      const speakerTag = parseSpeakerTag(line);
      if (speakerTag) {
        keys.add(speakerTag.speakerKey);
      }
    }
  }
  return [...keys].sort();
}

export async function validateBuildPrerequisites(
  options: BuildPrerequisiteOptions
): Promise<BuildPrerequisiteResult> {
  const errors: string[] = [];
  let speakerKeys: string[] = [];
  let resolvedSynthesisDefaultsPath = "";
  let resolvedCharacterMapSource: string | undefined;
  let resolvedVoicevoxApiUrl = "";
  let resolvedSpeedProfilesPath: string | undefined;

  try {
    speakerKeys = await collectSpeakerKeys(options.scriptPaths);
  } catch (error) {
    errors.push(`Failed to read script files: ${toErrorMessage(error)}`);
  }

  try {
    resolvedSynthesisDefaultsPath = await resolveSynthesisDefaultsPath(options.synthesisDefaultsPath);
    const rawSynthesisDefaults = await loadJson<RawSynthesisDefaults>(resolvedSynthesisDefaultsPath);
    normalizeSynthesisDefaults(rawSynthesisDefaults);
  } catch (error) {
    errors.push(toErrorMessage(error));
  }

  const requiresCharacterVoice =
    Boolean(options.characterKey) ||
    Boolean(options.emotion) ||
    speakerKeys.length > 0;

  if (options.emotion && !options.characterKey && speakerKeys.length === 0) {
    errors.push(
      `Emotion "${options.emotion}" requires a character voice source. Provide [speaker:<key>] or --character-key with a character map.`
    );
  }

  if (requiresCharacterVoice) {
    try {
      const resolvedCharacterMap = await resolveCharacterMap({
        characterMapPath: options.characterMapPath,
        defaultCharacterKey: options.characterKey
      });
      resolvedCharacterMapSource = resolvedCharacterMap.source;
      const characterMap = resolvedCharacterMap.characterMap;
      if (!characterMap) {
        const selectedCharacterKey = options.characterKey || speakerKeys[0];
        throw new Error(
          `character_key "${selectedCharacterKey}" was requested but no character map is configured. Set --character-map or add configs/voicevox/default_character_map.json`
        );
      }

      if (options.characterKey && !characterMap.characters[options.characterKey]) {
        throw new Error(
          `Unknown character_key "${options.characterKey}". Define it in the character map.`
        );
      }

      for (const speakerKey of speakerKeys) {
        if (!characterMap.characters[speakerKey]) {
          throw new Error(
            `Unknown character_key "${speakerKey}". Define it in the character map.`
          );
        }
      }

      if (options.emotion) {
        const targetCharacterKeys = options.characterKey ? [options.characterKey] : speakerKeys;
        for (const characterKey of targetCharacterKeys) {
          const emotionMap = characterMap.emotionStyles?.[characterKey];
          if (!emotionMap) {
            throw new Error(`Character "${characterKey}" has no emotionStyles defined`);
          }
          if (emotionMap[options.emotion] === undefined) {
            throw new Error(
              `Emotion "${options.emotion}" not found for character "${characterKey}". Available: ${Object.keys(
                emotionMap
              ).join(", ")}`
            );
          }
        }
      }
    } catch (error) {
      errors.push(toErrorMessage(error));
    }
  } else if (
    !options.engineId ||
    !options.speakerId ||
    typeof options.styleId !== "number"
  ) {
    errors.push(
      "Voice must be specified explicitly. Provide [speaker:<key>] (or --character-key) with a character map, or pass all of --engine-id/--speaker-id/--style-id."
    );
  }

  if (options.speedPreset) {
    try {
      resolvedSpeedProfilesPath = await resolveSpeedProfilesPath(options.speedProfilesPath);
      if (!resolvedSpeedProfilesPath) {
        throw new Error(
          `Speed preset "${options.speedPreset}" was requested but no speed profiles are configured. Set --speed-profiles or add configs/voicevox/speed_profiles.json`
        );
      }
      const speedProfiles = await loadSpeedProfiles(resolvedSpeedProfilesPath);
      const preset = speedProfiles.presets[options.speedPreset];
      if (!preset) {
        const availablePresets = Object.keys(speedProfiles.presets);
        throw new Error(
          `Unknown speed preset "${options.speedPreset}". Available presets: ${availablePresets.join(", ")}`
        );
      }
    } catch (error) {
      errors.push(toErrorMessage(error));
    }
  }

  try {
    resolvedVoicevoxApiUrl = await resolveVoicevoxApiUrl(options.voicevoxApiUrl);
    await ensureVoicevoxReachable(resolvedVoicevoxApiUrl);
  } catch (error) {
    errors.push(toErrorMessage(error));
  }

  if (errors.length > 0) {
    throw new Error(`Build prerequisites failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    scriptCount: options.scriptPaths.length,
    speakerKeys,
    resolvedSynthesisDefaultsPath,
    resolvedCharacterMapSource,
    resolvedVoicevoxApiUrl,
    resolvedSpeedProfilesPath
  };
}
