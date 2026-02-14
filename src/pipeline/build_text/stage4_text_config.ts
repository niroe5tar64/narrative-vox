import path from "node:path";
import { readJson } from "../../shared/json.ts";
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

export interface Stage4TextConfig {
  speakability: {
    warningThresholds: SpeakabilityWarningConfig;
    scoring: SpeakabilityScoringConfig;
  };
  pause: PauseConfigValues;
}

interface RawStage4TextConfig {
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

export const DEFAULT_STAGE4_TEXT_CONFIG: Stage4TextConfig = {
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

function coerceNumber(value: number | string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeStage4TextConfig(raw?: RawStage4TextConfig): Stage4TextConfig {
  const warningThresholds = raw?.speakability?.warningThresholds;
  const scoring = raw?.speakability?.scoring;
  const pause = raw?.pause;

  return {
    speakability: {
      warningThresholds: {
        scoreThreshold: coerceNumber(
          warningThresholds?.scoreThreshold,
          DEFAULT_STAGE4_TEXT_CONFIG.speakability.warningThresholds.scoreThreshold
        ),
        minTerminalPunctuationRatio: coerceNumber(
          warningThresholds?.minTerminalPunctuationRatio,
          DEFAULT_STAGE4_TEXT_CONFIG.speakability.warningThresholds.minTerminalPunctuationRatio
        ),
        maxLongUtteranceRatio: coerceNumber(
          warningThresholds?.maxLongUtteranceRatio,
          DEFAULT_STAGE4_TEXT_CONFIG.speakability.warningThresholds.maxLongUtteranceRatio
        )
      },
      scoring: {
        targetAverageChars: coerceNumber(
          scoring?.targetAverageChars,
          DEFAULT_STAGE4_TEXT_CONFIG.speakability.scoring.targetAverageChars
        ),
        averagePenaltyFactor: coerceNumber(
          scoring?.averagePenaltyFactor,
          DEFAULT_STAGE4_TEXT_CONFIG.speakability.scoring.averagePenaltyFactor
        ),
        averagePenaltyMax: coerceNumber(
          scoring?.averagePenaltyMax,
          DEFAULT_STAGE4_TEXT_CONFIG.speakability.scoring.averagePenaltyMax
        ),
        longRatioWeight: coerceNumber(
          scoring?.longRatioWeight,
          DEFAULT_STAGE4_TEXT_CONFIG.speakability.scoring.longRatioWeight
        ),
        punctuationWeight: coerceNumber(
          scoring?.punctuationWeight,
          DEFAULT_STAGE4_TEXT_CONFIG.speakability.scoring.punctuationWeight
        )
      }
    },
    pause: {
      minMs: coerceNumber(pause?.minMs, DEFAULT_STAGE4_TEXT_CONFIG.pause.minMs),
      maxMs: coerceNumber(pause?.maxMs, DEFAULT_STAGE4_TEXT_CONFIG.pause.maxMs),
      bases: {
        default: coerceNumber(pause?.bases?.default, DEFAULT_STAGE4_TEXT_CONFIG.pause.bases.default),
        strongEnding: coerceNumber(
          pause?.bases?.strongEnding,
          DEFAULT_STAGE4_TEXT_CONFIG.pause.bases.strongEnding
        ),
        fullStop: coerceNumber(pause?.bases?.fullStop, DEFAULT_STAGE4_TEXT_CONFIG.pause.bases.fullStop),
        clauseEnd: coerceNumber(pause?.bases?.clauseEnd, DEFAULT_STAGE4_TEXT_CONFIG.pause.bases.clauseEnd)
      },
      lengthBonus: {
        step: coerceNumber(pause?.lengthBonus?.step, DEFAULT_STAGE4_TEXT_CONFIG.pause.lengthBonus.step),
        increment: coerceNumber(
          pause?.lengthBonus?.increment,
          DEFAULT_STAGE4_TEXT_CONFIG.pause.lengthBonus.increment
        ),
        max: coerceNumber(pause?.lengthBonus?.max, DEFAULT_STAGE4_TEXT_CONFIG.pause.lengthBonus.max)
      },
      penalties: {
        conjunction: coerceNumber(
          pause?.penalties?.conjunction,
          DEFAULT_STAGE4_TEXT_CONFIG.pause.penalties.conjunction
        ),
        continuation: coerceNumber(
          pause?.penalties?.continuation,
          DEFAULT_STAGE4_TEXT_CONFIG.pause.penalties.continuation
        )
      }
    }
  };
}

export async function loadStage4TextConfig(stage4ConfigPath: string): Promise<Stage4TextConfig> {
  const resolvedPath = path.resolve(stage4ConfigPath);
  try {
    const raw = (await readJson(resolvedPath)) as RawStage4TextConfig;
    return normalizeStage4TextConfig(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load stage4 text config (${resolvedPath}): ${message}`);
  }
}
