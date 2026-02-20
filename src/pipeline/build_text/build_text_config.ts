import path from "node:path";
import { loadJson } from "../../shared/json.ts";
import { SchemaPaths } from "../../shared/schema_paths.ts";
import {
  PauseConfig,
  SpeakabilityConfig,
  type PauseConfigValues,
  type SpeakabilityScoringConfig
} from "./text_processing.ts";

export interface SpeakabilityWarningConfig {
  scoreThreshold: number;
  minTerminalPunctuationRatio: number;
  maxLongUtteranceRatio: number;
}

export interface BuildTextConfig {
  speakability: {
    warningThresholds: SpeakabilityWarningConfig;
    scoring: SpeakabilityScoringConfig;
  };
  pause: PauseConfigValues;
}

interface RawBuildTextConfig {
  version?: number;
  speakability?: {
    warningThresholds?: {
      scoreThreshold?: number | string;
      minTerminalPunctuationRatio?: number | string;
      maxLongUtteranceRatio?: number | string;
    };
    scoring?: {
      targetAverageChars?: number | string;
      averagePenaltyFactor?: number | string;
      averagePenaltyMax?: number | string;
      longRatioWeight?: number | string;
      punctuationWeight?: number | string;
    };
  };
  pause?: {
    minMs?: number | string;
    maxMs?: number | string;
    bases?: {
      default?: number | string;
      strongEnding?: number | string;
      fullStop?: number | string;
      clauseEnd?: number | string;
    };
    lengthBonus?: {
      step?: number | string;
      increment?: number | string;
      max?: number | string;
    };
    penalties?: {
      conjunction?: number | string;
      continuation?: number | string;
    };
  };
}

const DEFAULT_WARNING_THRESHOLDS: SpeakabilityWarningConfig = {
  scoreThreshold: 70,
  minTerminalPunctuationRatio: 0.65,
  maxLongUtteranceRatio: 0.25
};

export const DEFAULT_BUILD_TEXT_CONFIG: BuildTextConfig = {
  speakability: {
    warningThresholds: { ...DEFAULT_WARNING_THRESHOLDS },
    scoring: { ...SpeakabilityConfig }
  },
  pause: {
    ...PauseConfig,
    bases: { ...PauseConfig.bases },
    lengthBonus: { ...PauseConfig.lengthBonus },
    penalties: { ...PauseConfig.penalties }
  }
};

function requireFiniteNumber(value: number | string | undefined, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Build-text config ${fieldName} must be a valid number`);
  }
  return parsed;
}

export function normalizeBuildTextConfig(raw?: RawBuildTextConfig): BuildTextConfig {
  if (!raw) {
    return {
      speakability: {
        warningThresholds: { ...DEFAULT_BUILD_TEXT_CONFIG.speakability.warningThresholds },
        scoring: { ...DEFAULT_BUILD_TEXT_CONFIG.speakability.scoring }
      },
      pause: {
        ...DEFAULT_BUILD_TEXT_CONFIG.pause,
        bases: { ...DEFAULT_BUILD_TEXT_CONFIG.pause.bases },
        lengthBonus: { ...DEFAULT_BUILD_TEXT_CONFIG.pause.lengthBonus },
        penalties: { ...DEFAULT_BUILD_TEXT_CONFIG.pause.penalties }
      }
    };
  }

  const warningThresholds = raw?.speakability?.warningThresholds;
  const scoring = raw?.speakability?.scoring;
  const pause = raw?.pause;

  const result: BuildTextConfig = {
    speakability: {
      warningThresholds: {
        scoreThreshold: requireFiniteNumber(warningThresholds?.scoreThreshold, "speakability.warningThresholds.scoreThreshold"),
        minTerminalPunctuationRatio: requireFiniteNumber(
          warningThresholds?.minTerminalPunctuationRatio,
          "speakability.warningThresholds.minTerminalPunctuationRatio"
        ),
        maxLongUtteranceRatio: requireFiniteNumber(
          warningThresholds?.maxLongUtteranceRatio,
          "speakability.warningThresholds.maxLongUtteranceRatio"
        )
      },
      scoring: {
        targetAverageChars: requireFiniteNumber(scoring?.targetAverageChars, "speakability.scoring.targetAverageChars"),
        averagePenaltyFactor: requireFiniteNumber(
          scoring?.averagePenaltyFactor,
          "speakability.scoring.averagePenaltyFactor"
        ),
        averagePenaltyMax: requireFiniteNumber(
          scoring?.averagePenaltyMax,
          "speakability.scoring.averagePenaltyMax"
        ),
        longRatioWeight: requireFiniteNumber(scoring?.longRatioWeight, "speakability.scoring.longRatioWeight"),
        punctuationWeight: requireFiniteNumber(
          scoring?.punctuationWeight,
          "speakability.scoring.punctuationWeight"
        )
      }
    },
    pause: {
      minMs: requireFiniteNumber(pause?.minMs, "pause.minMs"),
      maxMs: requireFiniteNumber(pause?.maxMs, "pause.maxMs"),
      bases: {
        default: requireFiniteNumber(pause?.bases?.default, "pause.bases.default"),
        strongEnding: requireFiniteNumber(pause?.bases?.strongEnding, "pause.bases.strongEnding"),
        fullStop: requireFiniteNumber(pause?.bases?.fullStop, "pause.bases.fullStop"),
        clauseEnd: requireFiniteNumber(pause?.bases?.clauseEnd, "pause.bases.clauseEnd")
      },
      lengthBonus: {
        step: requireFiniteNumber(pause?.lengthBonus?.step, "pause.lengthBonus.step"),
        increment: requireFiniteNumber(pause?.lengthBonus?.increment, "pause.lengthBonus.increment"),
        max: requireFiniteNumber(pause?.lengthBonus?.max, "pause.lengthBonus.max")
      },
      penalties: {
        conjunction: requireFiniteNumber(pause?.penalties?.conjunction, "pause.penalties.conjunction"),
        continuation: requireFiniteNumber(pause?.penalties?.continuation, "pause.penalties.continuation")
      }
    }
  };

  if (result.pause.minMs > result.pause.maxMs) {
    throw new Error(
      `Build-text config pause.minMs (${result.pause.minMs}) must be <= pause.maxMs (${result.pause.maxMs})`
    );
  }

  return result;
}

export async function loadBuildTextConfig(configPath: string): Promise<BuildTextConfig> {
  const resolvedPath = path.resolve(configPath);
  try {
    const raw = await loadJson<RawBuildTextConfig>(resolvedPath, SchemaPaths.buildTextConfig);
    return normalizeBuildTextConfig(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load build-text config (${resolvedPath}): ${message}`);
  }
}
