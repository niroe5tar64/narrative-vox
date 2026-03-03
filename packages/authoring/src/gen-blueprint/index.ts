import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRunContract } from "@narrative-vox/domain/run-contract.ts";
import { makeRunIdNow } from "@narrative-vox/domain/run-id.ts";
import { saveRunContract } from "@narrative-vox/infrastructure/run-contract-io.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import { validateAgainstSchema } from "@narrative-vox/infrastructure/schema-validator.ts";
import {
  extractJson,
  runClaudeWithPrompt,
} from "@narrative-vox/cli/gen-layer1/runtime.ts";
import {
  buildBlueprintPrompt,
} from "@narrative-vox/cli/gen-layer1/prompts.ts";
import { assertArtifactAbsent } from "../shared/immutable-run.ts";
import {
  type AuthoringMetrics,
  writeAuthoringMetrics,
} from "../shared/metrics.ts";
import { loadProjectConfigYaml } from "../shared/project-config-loader.ts";
import { estimateTokens } from "../shared/token-estimate.ts";

export interface GenBlueprintOptions {
  projectId: string;
}

const TOKEN_WARNING = 27000;
const TOKEN_HARD_FAIL = 30000;

export async function genBlueprint(
  options: GenBlueprintOptions,
): Promise<void> {
  const stepLabel = "gen-blueprint";
  const startedAt = new Date();
  const { projectId } = options;

  console.log(`[${stepLabel}] Loading project config: ${projectId}`);
  const config = await loadProjectConfigYaml(projectId);

  // Build prompt (reuses existing prompt builder)
  const fullPrompt = await buildBlueprintPrompt({ stepLabel, projectId });

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
  const blueprintJson = extractJson(await runClaudeWithPrompt(fullPrompt));

  // Create run
  const runId = makeRunIdNow();
  const runDir = path.resolve("data", "projects", projectId, runId);
  const blueprintPath = path.join(
    runDir,
    "blueprint",
    "project_blueprint.json",
  );

  await mkdir(path.dirname(blueprintPath), { recursive: true });
  await writeFile(
    blueprintPath,
    `${JSON.stringify(blueprintJson, null, 2)}\n`,
  );
  console.log(
    `[${stepLabel}] Saved: ${path.relative(process.cwd(), blueprintPath)}`,
  );

  const contract = createRunContract({ projectId, runId, runDir });
  await saveRunContract(contract);
  console.log(`[${stepLabel}] Run contract saved: ${runDir}`);

  // Validate
  try {
    await validateAgainstSchema(blueprintJson, SchemaPaths.blueprint);
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
    runDir,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    promptTokenEstimate: promptTokens,
  };
  await writeAuthoringMetrics({ runDir, step: stepLabel, metrics });
}
