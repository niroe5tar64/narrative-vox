import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import { validateAgainstSchema } from "@narrative-vox/infrastructure/schema-validator.ts";
import {
  extractJson,
  runClaudeWithPrompt,
} from "@narrative-vox/infrastructure/claude-runtime.ts";
import {
  buildMaterialPrompt,
} from "@narrative-vox/cli/gen-layer1/prompts.ts";
import { assertArtifactAbsent } from "../shared/immutable-run.ts";
import {
  type AuthoringMetrics,
  writeAuthoringMetrics,
} from "../shared/metrics.ts";
import { loadProjectConfigYaml } from "../shared/project-config-loader.ts";
import { estimateTokens } from "../shared/token-estimate.ts";

export interface GenEpisodePackOptions {
  projectId: string;
  episodeId: string;
  runDir: string;
}

const SOURCE_BUDGET = 24000;
const TOKEN_WARNING = 27000;
const TOKEN_HARD_FAIL = 30000;

export async function genEpisodePack(
  options: GenEpisodePackOptions,
): Promise<void> {
  const stepLabel = "gen-episode-pack";
  const startedAt = new Date();
  const { projectId, episodeId, runDir } = options;

  console.log(`[${stepLabel}] Loading project config: ${projectId}`);
  const config = await loadProjectConfigYaml(projectId);

  const artifactPath = path.join(
    runDir,
    "episode_pack",
    `${episodeId}_episode_pack.json`,
  );
  await assertArtifactAbsent(artifactPath, "GEN_EPISODE_PACK");

  // Build prompt (reuses existing material prompt builder)
  const fullPrompt = await buildMaterialPrompt({
    stepLabel,
    projectId,
    episodeId,
    runDir,
  });

  // Preflight token check
  const promptTokens = estimateTokens(fullPrompt);
  console.log(`[${stepLabel}] Prompt token estimate: ${promptTokens}`);
  if (promptTokens > TOKEN_HARD_FAIL) {
    throw new Error(
      `[${stepLabel}] Prompt exceeds hard limit (${promptTokens} > ${TOKEN_HARD_FAIL})`,
    );
  }
  if (promptTokens > TOKEN_WARNING) {
    console.log(
      `[${stepLabel}] WARN: Prompt near limit (${promptTokens} > ${TOKEN_WARNING})`,
    );
  }

  // Run LLM
  console.log(`[${stepLabel}] Running claude --print -...`);
  const episodePackJson = extractJson(await runClaudeWithPrompt(fullPrompt));

  // Write artifact
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(
    artifactPath,
    `${JSON.stringify(episodePackJson, null, 2)}\n`,
  );
  console.log(
    `[${stepLabel}] Saved: ${path.relative(process.cwd(), artifactPath)}`,
  );

  // Validate
  try {
    await validateAgainstSchema(episodePackJson, SchemaPaths.episodePack);
    console.log(`[${stepLabel}] Schema validation: OK`);
  } catch (error) {
    console.log(
      `[${stepLabel}] Schema validation: WARN - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Metrics
  const finishedAt = new Date();
  const metrics: AuthoringMetrics = {
    step: stepLabel,
    projectId,
    episodeId,
    runDir,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    promptTokenEstimate: promptTokens,
  };
  await writeAuthoringMetrics({
    runDir,
    step: stepLabel,
    episodeId,
    metrics,
  });
}
