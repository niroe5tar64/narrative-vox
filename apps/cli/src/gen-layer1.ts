import path from "node:path";
import { createRunContract } from "@narrative-vox/domain/run-contract.ts";
import { makeRunIdNow } from "@narrative-vox/domain/run-id.ts";
import { saveRunContract } from "@narrative-vox/infrastructure/run-contract-io.ts";
import {
  logJsonSchemaValidation,
  saveJsonArtifact,
  saveTextArtifact,
} from "./gen-layer1/artifacts.ts";
import {
  loadDigestStepResources,
  loadMaterialStepResources,
  loadScriptStepResources,
} from "./gen-layer1/loaders.ts";
import { extractJson, runClaudeWithPrompt } from "./gen-layer1/runtime.ts";
import {
  analyzeScriptStructure,
  composePrompt,
  loadProjectConfig,
  loadPromptSection,
  loadSourceFiles,
  logStep,
  SCHEMA_PATHS,
  type ProjectConfig,
} from "./gen-layer1/shared.ts";

export { extractJson, runClaudeWithPrompt };

export interface GenBlueprintOptions {
  projectId: string;
}

export interface GenMaterialOptions {
  projectId: string;
  episodeId: string;
  runDir: string;
}

export interface GenScriptOptions {
  projectId: string;
  episodeId: string;
  runDir: string;
}

export interface GenDigestOptions {
  projectId: string;
  episodeId: string;
  runDir: string;
}

async function loadProjectAndPrompt(
  stepLabel: string,
  projectId: string,
  step: "blueprint" | "material" | "script" | "digest",
  episodeId?: string,
): Promise<{ projectConfig: ProjectConfig; promptSection: string }> {
  logStep(stepLabel, `Loading project config: ${projectId}`);
  const projectConfig = await loadProjectConfig(projectId);
  logStep(
    stepLabel,
    `Resolving prompt template: ${projectConfig.GENRE_ID}/${step}`,
  );
  const promptSection = await loadPromptSection({ projectConfig, step, episodeId });
  return { projectConfig, promptSection };
}

export async function genBlueprint(
  options: GenBlueprintOptions,
): Promise<void> {
  const stepLabel = "gen-blueprint";
  const { projectId } = options;
  const { projectConfig, promptSection } = await loadProjectAndPrompt(
    stepLabel,
    projectId,
    "blueprint",
  );

  const sourceGlob = projectConfig.SOURCE_MARKDOWN_PATHS ?? "";
  logStep(stepLabel, `Loading source files: ${sourceGlob || "(none)"}`);
  const sourceContents = await loadSourceFiles(sourceGlob);
  const fullPrompt = composePrompt(promptSection, [
    { title: "Source Materials", kind: "fragments", value: sourceContents },
  ]);

  logStep(stepLabel, "Running claude --print -...");
  const blueprintJson = extractJson(await runClaudeWithPrompt(fullPrompt));

  const runId = makeRunIdNow();
  const runDir = path.resolve("data", "projects", projectId, runId);
  const blueprintPath = path.join(runDir, "blueprint", "project_blueprint.json");
  await saveJsonArtifact({ stepLabel, filePath: blueprintPath, data: blueprintJson });

  const contract = createRunContract({ projectId, runId, runDir });
  await saveRunContract(contract);
  logStep(stepLabel, `Run contract saved: ${runDir}`);
  await logJsonSchemaValidation({
    stepLabel,
    data: blueprintJson,
    schemaPath: SCHEMA_PATHS.blueprint,
  });
}

export async function genMaterial(options: GenMaterialOptions): Promise<void> {
  const stepLabel = "gen-material";
  const { projectId, episodeId, runDir } = options;
  const { projectConfig, promptSection } = await loadProjectAndPrompt(
    stepLabel,
    projectId,
    "material",
    episodeId,
  );
  const { blueprint } = await loadMaterialStepResources({ stepLabel, runDir });

  const sourceGlob = projectConfig.SOURCE_MARKDOWN_PATHS ?? "";
  logStep(stepLabel, `Loading source files: ${sourceGlob || "(none)"}`);
  const sourceContents = await loadSourceFiles(sourceGlob);
  const fullPrompt = composePrompt(promptSection, [
    { title: "Blueprint JSON", kind: "json", value: blueprint },
    { title: "Source Materials", kind: "fragments", value: sourceContents },
  ]);

  logStep(stepLabel, "Running claude --print -...");
  const materialJson = extractJson(await runClaudeWithPrompt(fullPrompt));

  const materialPath = path.join(runDir, "material", `${episodeId}_material.json`);
  await saveJsonArtifact({ stepLabel, filePath: materialPath, data: materialJson });
  await logJsonSchemaValidation({
    stepLabel,
    data: materialJson,
    schemaPath: SCHEMA_PATHS.episodeMaterial,
  });
}

export async function genScript(options: GenScriptOptions): Promise<void> {
  const stepLabel = "gen-script";
  const { projectId, episodeId, runDir } = options;
  const { projectConfig, promptSection } = await loadProjectAndPrompt(
    stepLabel,
    projectId,
    "script",
    episodeId,
  );

  const { material, style, characters, priorDigests } =
    await loadScriptStepResources({
      stepLabel,
      projectConfig,
      runDir,
      episodeId,
    });
  const attachments = [
    { title: "Material JSON", kind: "json", value: material },
    { title: "Style JSON", kind: "json", value: style },
    { title: "Character Profiles", kind: "json", value: characters },
  ] as const;
  const fullPrompt = composePrompt(
    promptSection,
    priorDigests.length > 0
      ? [
          ...attachments,
          { title: "Prior Episode Digests", kind: "json", value: priorDigests },
        ]
      : [...attachments],
  );

  logStep(stepLabel, "Running claude --print -...");
  const output = await runClaudeWithPrompt(fullPrompt);
  const scriptContent = output.trim();

  const scriptPath = path.join(runDir, "script", `${episodeId}_script.md`);
  await saveTextArtifact({
    stepLabel,
    filePath: scriptPath,
    content: `${scriptContent}\n`,
  });

  const analysis = analyzeScriptStructure(scriptContent);
  if (analysis.isEmpty) {
    throw new Error("[gen-script] Script is empty");
  }
  if (!analysis.hasSectionHeaders) {
    logStep(stepLabel, "WARN: No section headers (## N.) found in script");
  }
  if (!analysis.hasSpeakerTags) {
    logStep(stepLabel, "WARN: No speaker tags ([speaker:xxx]) found in script");
  }
  if (analysis.hasSectionHeaders && analysis.hasSpeakerTags) {
    logStep(stepLabel, "Structure validation: OK");
  }
}

export async function genDigest(options: GenDigestOptions): Promise<void> {
  const stepLabel = "gen-digest";
  const { projectId, episodeId, runDir } = options;
  const { projectConfig, promptSection } = await loadProjectAndPrompt(
    stepLabel,
    projectId,
    "digest",
    episodeId,
  );

  const { scriptContent, material, blueprint, characters } =
    await loadDigestStepResources({
      stepLabel,
      projectConfig,
      runDir,
      episodeId,
    });
  const fullPrompt = composePrompt(promptSection, [
    { title: "Script (Markdown)", kind: "markdown", value: scriptContent },
    { title: "Material JSON", kind: "json", value: material },
    { title: "Blueprint JSON", kind: "json", value: blueprint },
    { title: "Character Profiles", kind: "json", value: characters },
  ]);

  logStep(stepLabel, "Running claude --print -...");
  const digestJson = extractJson(await runClaudeWithPrompt(fullPrompt));

  const digestPath = path.join(runDir, "context", `${episodeId}_episode_digest.json`);
  await saveJsonArtifact({ stepLabel, filePath: digestPath, data: digestJson });
  await logJsonSchemaValidation({
    stepLabel,
    data: digestJson,
    schemaPath: SCHEMA_PATHS.episodeDigest,
  });
}
