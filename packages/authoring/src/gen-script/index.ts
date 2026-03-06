import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  runClaudeWithPrompt,
} from "@narrative-vox/infrastructure/claude-runtime.ts";
import {
  buildScriptPrompt,
} from "@narrative-vox/cli/gen-layer1/prompts.ts";
import { assertArtifactAbsent } from "../shared/immutable-run.ts";
import {
  type AuthoringMetrics,
  writeAuthoringMetrics,
} from "../shared/metrics.ts";
import { loadProjectConfigYaml } from "../shared/project-config-loader.ts";
import { estimateTokens } from "../shared/token-estimate.ts";

export interface GenScriptOptions {
  projectId: string;
  episodeId: string;
  runDir: string;
}

const TOKEN_WARNING = 21600;
const TOKEN_HARD_FAIL = 24000;

export async function genScript(options: GenScriptOptions): Promise<void> {
  const stepLabel = "gen-script";
  const startedAt = new Date();
  const { projectId, episodeId, runDir } = options;

  console.log(`[${stepLabel}] Loading project config: ${projectId}`);
  const config = await loadProjectConfigYaml(projectId);

  const artifactPath = path.join(
    runDir,
    "script",
    `${episodeId}_script.md`,
  );
  await assertArtifactAbsent(artifactPath, "GEN_SCRIPT");

  // Build prompt (reuses existing script prompt builder)
  const fullPrompt = await buildScriptPrompt({
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
  const output = await runClaudeWithPrompt(fullPrompt);
  const scriptContent = output.trim();

  // Validate structure
  if (scriptContent.length === 0) {
    throw new Error(`[${stepLabel}] Script is empty`);
  }
  const hasSectionHeaders = /^## \d+\./m.test(scriptContent);
  const hasSpeakerTags = /\[speaker:/.test(scriptContent);
  if (!hasSectionHeaders) {
    console.log(
      `[${stepLabel}] WARN: No section headers (## N.) found in script`,
    );
  }
  if (!hasSpeakerTags) {
    console.log(
      `[${stepLabel}] WARN: No speaker tags ([speaker:xxx]) found in script`,
    );
  }
  if (hasSectionHeaders && hasSpeakerTags) {
    console.log(`[${stepLabel}] Structure validation: OK`);
  }

  // Write artifact
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${scriptContent}\n`);
  console.log(
    `[${stepLabel}] Saved: ${path.relative(process.cwd(), artifactPath)}`,
  );

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
    scriptLength: scriptContent.length,
    hasSectionHeaders,
    hasSpeakerTags,
  };
  await writeAuthoringMetrics({
    runDir,
    step: stepLabel,
    episodeId,
    metrics,
  });
}
