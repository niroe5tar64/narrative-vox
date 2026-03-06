import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { MorphTokenizer } from "@narrative-vox/infrastructure/japanese-morph-tokenizer.ts";
import { collectArtifacts } from "./check-run/artifact-collection.ts";
import {
  type CheckRunIssue,
  CheckRunValidationError,
} from "./check-run/issues.ts";
import {
  collectTechnicalTermsFromEpisodePack,
  writeTechnicalTermsAuditReports,
} from "./check-run/technical-terms.ts";
import { validateAuthoringCrossRefs } from "./check-run/validators/authoring-cross-refs.ts";
import { validateAuthoringSchemas } from "./check-run/validators/authoring-schemas.ts";
import { validateOptionalSynthesis } from "./check-run/validators/optional-synthesis.ts";
import { validateRequiredAuthoring } from "./check-run/validators/required-authoring.ts";
import { validateScriptStructure } from "./check-run/validators/script-structure.ts";

export interface CheckRunOptions {
  runDir: string;
  morphTokenizerOverride?: MorphTokenizer | null;
}

export interface CheckRunResult {
  runDir: string;
  projectId: string;
  runId: string;
  plannedEpisodeIds: string[];
  validatedEpisodeIds: string[];
  technicalTermsReportPaths: string[];
  warnings: string[];
}

function throwIfErrors(issues: CheckRunIssue[]): void {
  const errors = issues.filter((i) => i.message);
  if (errors.length > 0) {
    throw new CheckRunValidationError(errors);
  }
}

export async function checkRun({
  runDir,
  morphTokenizerOverride,
}: CheckRunOptions): Promise<CheckRunResult> {
  const resolvedRunDir = path.resolve(runDir);
  const warnings: string[] = [];

  // Phase 1: Artifact collection
  const { artifacts, issues: collectionIssues } =
    await collectArtifacts(resolvedRunDir);
  throwIfErrors(collectionIssues);

  // Phase 2: Required authoring
  const { result: authoringResult, issues: authoringIssues } =
    await validateRequiredAuthoring(resolvedRunDir, artifacts);
  throwIfErrors(authoringIssues);
  const { projectId, runId, plannedEpisodeIds } = authoringResult;

  // Phase 3: Authoring schemas
  const { result: schemasResult, issues: schemasIssues } =
    await validateAuthoringSchemas(artifacts, projectId, plannedEpisodeIds);
  throwIfErrors(schemasIssues);

  // Phase 4: Script structure
  const { scriptTextByEpisodeId, issues: scriptIssues } =
    await validateScriptStructure(
      artifacts,
      plannedEpisodeIds,
      schemasResult.contentStyle,
    );
  throwIfErrors(scriptIssues);

  // Phase 5: Authoring cross-refs
  const { issues: crossRefIssues, warnings: crossRefWarnings } =
    validateAuthoringCrossRefs(schemasResult, plannedEpisodeIds);
  warnings.push(...crossRefWarnings);
  throwIfErrors(crossRefIssues);

  // Phase 6: Technical terms
  const technicalTermsByEpisodeId = new Map<string, string[]>();
  const episodePackPathByEpisodeId = new Map<string, string>();
  const scriptPathByEpisodeId = new Map<string, string>();

  for (const [episodeId, pack] of schemasResult.episodePacks) {
    const packPath = artifacts.episodePackPaths.get(episodeId);
    if (packPath) {
      const packRef = `episode_pack/${episodeId}_episode_pack.json`;
      episodePackPathByEpisodeId.set(episodeId, packRef);
      technicalTermsByEpisodeId.set(
        episodeId,
        collectTechnicalTermsFromEpisodePack(
          pack,
          episodeId,
          packRef,
          warnings,
        ),
      );
    }
  }

  for (const episodeId of plannedEpisodeIds) {
    const sPath = artifacts.scriptPaths.get(episodeId);
    if (sPath) {
      scriptPathByEpisodeId.set(
        episodeId,
        `script/${episodeId}_script.md`,
      );
    }
  }

  // Build voicevox_text path map for Phase 6
  const voicevoxTextPathByEpisodeId = new Map<string, string>();
  for (const [episodeId, filePath] of artifacts.voicevoxTextPaths) {
    voicevoxTextPathByEpisodeId.set(episodeId, filePath);
  }

  const reportDir = path.join(resolvedRunDir, "reports", "technical_terms");
  await mkdir(reportDir, { recursive: true });

  const technicalTermsReportPaths = await writeTechnicalTermsAuditReports({
    resolvedRunDir,
    projectId,
    runId,
    plannedEpisodeIds,
    technicalTermsByEpisodeId,
    episodePackPathByEpisodeId,
    scriptPathByEpisodeId,
    scriptTextByEpisodeId,
    voicevoxTextPathByEpisodeId,
    warnings,
    morphTokenizerOverride,
  });

  // Phase 7: Optional synthesis
  const { issues: synthesisIssues } = await validateOptionalSynthesis(
    artifacts,
    plannedEpisodeIds,
  );
  throwIfErrors(synthesisIssues);

  return {
    runDir: resolvedRunDir,
    projectId,
    runId,
    plannedEpisodeIds,
    validatedEpisodeIds: plannedEpisodeIds,
    technicalTermsReportPaths,
    warnings,
  };
}
