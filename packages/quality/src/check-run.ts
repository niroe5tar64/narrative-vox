import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { MorphTokenizer } from "@narrative-vox/infrastructure/japanese-morph-tokenizer.ts";
import { loadRunContract } from "@narrative-vox/infrastructure/run-contract-io.ts";
import { validateBuildPrerequisites } from "./build-prerequisites.ts";
import { dirExists } from "./check-run/shared.ts";
import { writeTechnicalTermsAuditReports } from "./check-run/technical-terms.ts";
import { validateBlueprintAndMaterial } from "./check-run/validators/blueprint-material.ts";
import { validateLayer2Artifacts } from "./check-run/validators/layer2.ts";
import { validateProjectStyle } from "./check-run/validators/project-style.ts";
import {
  validateDigestsIfPresent,
  validateEpisodeParity,
  validateScripts,
} from "./check-run/validators/script.ts";

export interface CheckRunOptions {
  runDir: string;
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
  morphTokenizerOverride?: MorphTokenizer | null;
}

export interface CheckRunResult {
  runDir: string;
  materialEpisodeCount: number;
  scriptEpisodeCount: number;
  validatedEpisodeIds: string[];
  warnings: string[];
}

export async function checkRun({
  runDir,
  synthesisDefaultsPath,
  characterMapPath,
  characterKey,
  engineId,
  speakerId,
  styleId,
  emotion,
  voicevoxApiUrl,
  speedPreset,
  speedProfilesPath,
  morphTokenizerOverride,
}: CheckRunOptions): Promise<CheckRunResult> {
  const resolvedRunDir = path.resolve(runDir);
  const runId = path.basename(resolvedRunDir);
  const warnings: string[] = [];

  const runContractPath = path.join(resolvedRunDir, "run-contract.json");
  if (await dirExists(runContractPath)) {
    await loadRunContract(resolvedRunDir);
  } else {
    warnings.push(
      "run-contract.json not found (run may predate RunContract support)",
    );
  }

  const {
    materialEpisodeIds,
    materialPathByEpisodeId,
    technicalTermsByEpisodeId,
    projectId,
  } = await validateBlueprintAndMaterial({
    resolvedRunDir,
    warnings,
  });

  const { contentStyle } = await validateProjectStyle(projectId);
  const {
    scriptPaths,
    scriptEpisodeIds,
    scriptPathByEpisodeId,
    scriptTextByEpisodeId,
  } = await validateScripts({
    resolvedRunDir,
    contentStyle,
  });

  validateEpisodeParity(materialEpisodeIds, scriptEpisodeIds);
  await validateDigestsIfPresent({
    resolvedRunDir,
    materialEpisodeIds,
    warnings,
  });

  await validateBuildPrerequisites({
    scriptPaths,
    synthesisDefaultsPath,
    characterMapPath,
    characterKey,
    engineId,
    speakerId,
    styleId,
    emotion,
    voicevoxApiUrl,
    speedPreset,
    speedProfilesPath,
  });

  const {
    dictionarySurfacesByEpisodeId,
    highPriorityDictionarySurfacesByEpisodeId,
    candidatesWithoutReadingByEpisodeId,
    validVoicevoxTextByEpisodeId,
  } = await validateLayer2Artifacts({
    resolvedRunDir,
    warnings,
  });

  await mkdir(path.join(resolvedRunDir, "context"), { recursive: true });
  await writeTechnicalTermsAuditReports({
    resolvedRunDir,
    projectId,
    runId,
    materialEpisodeIds,
    technicalTermsByEpisodeId,
    materialPathByEpisodeId,
    scriptPathByEpisodeId,
    scriptTextByEpisodeId,
    dictionarySurfacesByEpisodeId,
    highPriorityDictionarySurfacesByEpisodeId,
    candidatesWithoutReadingByEpisodeId,
    validVoicevoxTextByEpisodeId,
    warnings,
    morphTokenizerOverride,
  });

  return {
    runDir: resolvedRunDir,
    materialEpisodeCount: materialEpisodeIds.length,
    scriptEpisodeCount: scriptEpisodeIds.length,
    validatedEpisodeIds: materialEpisodeIds,
    warnings,
  };
}
