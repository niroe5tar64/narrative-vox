import {
  loadDigestStepResources,
  loadMaterialStepResources,
  loadScriptStepResources,
} from "./loaders.ts";
import {
  composePrompt,
  loadProjectConfig,
  loadPromptSection,
  loadSourceFiles,
  logStep,
  type Layer1Step,
  type ProjectConfig,
} from "./shared.ts";

async function loadProjectPromptContext(options: {
  stepLabel: string;
  projectId: string;
  step: Layer1Step;
  episodeId?: string;
}): Promise<{ projectConfig: ProjectConfig; promptSection: string }> {
  const { stepLabel, projectId, step, episodeId } = options;
  logStep(stepLabel, `Loading project config: ${projectId}`);
  const projectConfig = await loadProjectConfig(projectId);
  logStep(
    stepLabel,
    `Resolving prompt template: ${projectConfig.GENRE_ID}/${step}`,
  );
  const promptSection = await loadPromptSection({ projectConfig, step, episodeId });
  return { projectConfig, promptSection };
}

async function loadSourcePromptFragments(options: {
  stepLabel: string;
  sourceGlob: string;
}): Promise<string[]> {
  const { stepLabel, sourceGlob } = options;
  logStep(stepLabel, `Loading source files: ${sourceGlob || "(none)"}`);
  return loadSourceFiles(sourceGlob);
}

export async function buildBlueprintPrompt(options: {
  stepLabel: string;
  projectId: string;
}): Promise<string> {
  const { stepLabel, projectId } = options;
  const { projectConfig, promptSection } = await loadProjectPromptContext({
    stepLabel,
    projectId,
    step: "blueprint",
  });
  const sourceContents = await loadSourcePromptFragments({
    stepLabel,
    sourceGlob: projectConfig.SOURCE_MARKDOWN_PATHS ?? "",
  });
  return composePrompt(promptSection, [
    { title: "Source Materials", kind: "fragments", value: sourceContents },
  ]);
}

export async function buildMaterialPrompt(options: {
  stepLabel: string;
  projectId: string;
  episodeId: string;
  runDir: string;
}): Promise<string> {
  const { stepLabel, projectId, episodeId, runDir } = options;
  const { projectConfig, promptSection } = await loadProjectPromptContext({
    stepLabel,
    projectId,
    step: "material",
    episodeId,
  });
  const { blueprint } = await loadMaterialStepResources({ stepLabel, runDir });
  const sourceContents = await loadSourcePromptFragments({
    stepLabel,
    sourceGlob: projectConfig.SOURCE_MARKDOWN_PATHS ?? "",
  });
  return composePrompt(promptSection, [
    { title: "Blueprint JSON", kind: "json", value: blueprint },
    { title: "Source Materials", kind: "fragments", value: sourceContents },
  ]);
}

export async function buildScriptPrompt(options: {
  stepLabel: string;
  projectId: string;
  episodeId: string;
  runDir: string;
}): Promise<string> {
  const { stepLabel, projectId, episodeId, runDir } = options;
  const { projectConfig, promptSection } = await loadProjectPromptContext({
    stepLabel,
    projectId,
    step: "script",
    episodeId,
  });
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
  return composePrompt(
    promptSection,
    priorDigests.length > 0
      ? [
          ...attachments,
          { title: "Prior Episode Digests", kind: "json", value: priorDigests },
        ]
      : [...attachments],
  );
}

export async function buildDigestPrompt(options: {
  stepLabel: string;
  projectId: string;
  episodeId: string;
  runDir: string;
}): Promise<string> {
  const { stepLabel, projectId, episodeId, runDir } = options;
  const { projectConfig, promptSection } = await loadProjectPromptContext({
    stepLabel,
    projectId,
    step: "digest",
    episodeId,
  });
  const { scriptContent, material, blueprint, characters } =
    await loadDigestStepResources({
      stepLabel,
      projectConfig,
      runDir,
      episodeId,
    });
  return composePrompt(promptSection, [
    { title: "Script (Markdown)", kind: "markdown", value: scriptContent },
    { title: "Material JSON", kind: "json", value: material },
    { title: "Blueprint JSON", kind: "json", value: blueprint },
    { title: "Character Profiles", kind: "json", value: characters },
  ]);
}
