import path from "node:path";
import type { VoicevoxTextData } from "@narrative-vox/domain/types.ts";
import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import { validateAgainstSchema } from "@narrative-vox/quality/schema-validator.ts";
import { writePatchedArtifacts } from "./patch-voicevox-text/artifact-writer.ts";
import { patchDictionaryCandidates } from "./patch-voicevox-text/dict-patcher.ts";
import {
  DEFAULT_PATCH_CONFIG,
  loadPatchConfig,
} from "./patch-voicevox-text/patch-config.ts";
import { applyNormalizationRules } from "./patch-voicevox-text/normalizer.ts";

const DEFAULT_PATCH_CONFIG_PATH = "configs/voice/voicevox/patch-config.json";

export interface PatchVoicevoxTextOptions {
  voicevoxTextJsonPath: string;
  patchConfigPath?: string;
  runDir?: string;
}

export interface PatchVoicevoxTextResult {
  patchedJsonPath: string;
  patchedCsvPath: string;
  normalizedUtteranceCount: number;
  addedCandidateCount: number;
  removedCandidateCount: number;
}

function inferDictCsvPath(voicevoxTextJsonPath: string): string {
  const resolvedJsonPath = path.resolve(voicevoxTextJsonPath);
  const voicevoxTextDir = path.dirname(resolvedJsonPath);
  const runDir = path.dirname(voicevoxTextDir);
  const dictDir = path.join(runDir, "dict_candidates");

  const base = path.basename(resolvedJsonPath);
  const episodeMatch = base.match(/^(E\d{2})/);
  const episodeId = episodeMatch ? episodeMatch[1] : "E01";
  return path.join(dictDir, `${episodeId}_dict_candidates.csv`);
}

export async function patchVoicevoxText(
  options: PatchVoicevoxTextOptions,
): Promise<PatchVoicevoxTextResult> {
  const resolvedJsonPath = path.resolve(options.voicevoxTextJsonPath);

  const patchConfig = options.patchConfigPath
    ? await loadPatchConfig(path.resolve(options.patchConfigPath))
    : await loadDefaultPatchConfigIfExists();

  const voicevoxTextData = await loadJson<VoicevoxTextData>(
    resolvedJsonPath,
    SchemaPaths.voicevoxText,
  );

  let utterances = voicevoxTextData.utterances;
  let normalizedUtteranceCount = 0;

  if (patchConfig.text_normalization.enabled) {
    const result = applyNormalizationRules(
      utterances,
      patchConfig.text_normalization.rules,
    );
    utterances = result.utterances;
    normalizedUtteranceCount = result.appliedCount;
  }

  let candidates = voicevoxTextData.dictionary_candidates;
  let addedCandidateCount = 0;
  let removedCandidateCount = 0;

  if (patchConfig.dict_patch.enabled) {
    const patchResult = patchDictionaryCandidates(
      candidates,
      patchConfig.dict_patch.force_readings,
      patchConfig.dict_patch.suppress_surfaces,
    );
    candidates = patchResult.candidates;
    addedCandidateCount = patchResult.addedCount;
    removedCandidateCount = patchResult.removedCount;
  }

  const patchedData: VoicevoxTextData = {
    ...voicevoxTextData,
    utterances,
    dictionary_candidates: candidates,
    quality_checks: {
      ...voicevoxTextData.quality_checks,
      utterance_count: utterances.length,
      max_chars_per_utterance:
        utterances.length > 0
          ? Math.max(...utterances.map((u) => u.text.length))
          : voicevoxTextData.quality_checks.max_chars_per_utterance,
    },
  };

  await validateAgainstSchema(patchedData, SchemaPaths.voicevoxText);

  const dictionaryCsvPath = inferDictCsvPath(resolvedJsonPath);

  const { patchedJsonPath, patchedCsvPath } = await writePatchedArtifacts({
    patchedData,
    voicevoxTextJsonPath: resolvedJsonPath,
    dictionaryCsvPath,
  });

  return {
    patchedJsonPath,
    patchedCsvPath,
    normalizedUtteranceCount,
    addedCandidateCount,
    removedCandidateCount,
  };
}

async function loadDefaultPatchConfigIfExists() {
  const defaultPath = path.resolve(DEFAULT_PATCH_CONFIG_PATH);
  try {
    return await loadPatchConfig(defaultPath);
  } catch {
    return DEFAULT_PATCH_CONFIG;
  }
}
