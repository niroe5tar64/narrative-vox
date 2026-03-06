import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import { validateAgainstSchema } from "@narrative-vox/infrastructure/schema-validator.ts";
import { parse as parseYaml } from "yaml";
import type { CollectedArtifacts } from "../artifact-collection.ts";
import type { CheckRunIssue } from "../issues.ts";
import {
  type ContentStyleForCheckRun,
  type ProjectConfigForCheckRun,
  pathExists,
  toRelativePath,
} from "../shared.ts";

interface SourceIndexForCheckRun {
  sections: Array<{ section_id: string }>;
}

interface BlueprintForCheckRun {
  episode_plan: Array<{
    episode_id: string;
    target_theme_ids?: string[];
  }>;
  theme_catalog?: Array<{ theme_id: string }>;
}

interface EpisodePackForCheckRun {
  meta: { project_id: string; episode_id: string };
  technical_terms?: Array<{ term?: string; note?: string }>;
  source_section_ids?: string[];
  target_theme_ids?: string[];
  facts?: Array<{ fact_id?: string; depends_on?: string[] }>;
}

interface SeriesContextForCheckRun {
  meta: { through_episode_id: string };
}

export interface AuthoringSchemasResult {
  sourceIndex: SourceIndexForCheckRun | null;
  blueprint: BlueprintForCheckRun | null;
  episodePacks: Map<string, EpisodePackForCheckRun>;
  seriesContexts: Map<string, SeriesContextForCheckRun>;
  contentStyle: ContentStyleForCheckRun | null;
}

export async function validateAuthoringSchemas(
  artifacts: CollectedArtifacts,
  projectId: string,
  plannedEpisodeIds: string[],
): Promise<{ result: AuthoringSchemasResult; issues: CheckRunIssue[] }> {
  const issues: CheckRunIssue[] = [];
  const stage = "authoring-schemas" as const;

  let sourceIndex: SourceIndexForCheckRun | null = null;
  if (artifacts.sourceIndexPath) {
    try {
      sourceIndex = await loadJson<SourceIndexForCheckRun>(
        artifacts.sourceIndexPath,
        SchemaPaths.sourceIndex,
      );
    } catch (error) {
      issues.push({
        stage,
        message: `source_index schema validation failed: ${(error as Error).message}`,
      });
    }
  }

  let blueprint: BlueprintForCheckRun | null = null;
  if (artifacts.blueprintPath) {
    try {
      blueprint = await loadJson<BlueprintForCheckRun>(
        artifacts.blueprintPath,
        SchemaPaths.blueprint,
      );
    } catch (error) {
      issues.push({
        stage,
        message: `blueprint schema validation failed: ${(error as Error).message}`,
      });
    }
  }

  if (artifacts.runContractPath) {
    try {
      await loadJson(artifacts.runContractPath, SchemaPaths.runContract);
    } catch (error) {
      issues.push({
        stage,
        message: `run-contract schema validation failed: ${(error as Error).message}`,
      });
    }
  }

  const episodePacks = new Map<string, EpisodePackForCheckRun>();
  for (const episodeId of plannedEpisodeIds) {
    const packPath = artifacts.episodePackPaths.get(episodeId);
    if (!packPath) continue;
    try {
      const pack = await loadJson<EpisodePackForCheckRun>(
        packPath,
        SchemaPaths.episodePack,
      );
      episodePacks.set(episodeId, pack);
    } catch (error) {
      issues.push({
        stage,
        episodeId,
        message: `episode_pack schema validation failed: ${(error as Error).message}`,
      });
    }
  }

  const seriesContexts = new Map<string, SeriesContextForCheckRun>();
  for (const episodeId of plannedEpisodeIds) {
    const ctxPath = artifacts.seriesContextPaths.get(episodeId);
    if (!ctxPath) continue;
    try {
      const ctx = await loadJson<SeriesContextForCheckRun>(
        ctxPath,
        SchemaPaths.seriesContext,
      );
      seriesContexts.set(episodeId, ctx);
    } catch (error) {
      issues.push({
        stage,
        episodeId,
        message: `series_context schema validation failed: ${(error as Error).message}`,
      });
    }
  }

  let contentStyle: ContentStyleForCheckRun | null = null;
  const projectConfigYamlPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.yaml`,
  );
  const projectConfigJsonPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.json`,
  );
  const yamlExists = await pathExists(projectConfigYamlPath);
  const jsonExists = !yamlExists && (await pathExists(projectConfigJsonPath));
  const projectConfigPath = yamlExists
    ? projectConfigYamlPath
    : jsonExists
      ? projectConfigJsonPath
      : null;

  if (projectConfigPath) {
    try {
      let projectConfig: ProjectConfigForCheckRun;
      if (projectConfigPath.endsWith(".yaml")) {
        const raw = await readFile(projectConfigPath, "utf-8");
        const parsed = parseYaml(raw);
        await validateAgainstSchema(parsed, SchemaPaths.projectConfig);
        projectConfig = parsed as ProjectConfigForCheckRun;
      } else {
        projectConfig = await loadJson<ProjectConfigForCheckRun>(
          projectConfigPath,
          SchemaPaths.projectConfig,
        );
      }
      const styleConfigId = projectConfig.STYLE_ID;
      const styleYamlPath = path.resolve(
        "configs",
        "content",
        "styles",
        `${styleConfigId}.yaml`,
      );
      const styleJsonPath = path.resolve(
        "configs",
        "content",
        "styles",
        `${styleConfigId}.json`,
      );
      const styleYamlExists = await pathExists(styleYamlPath);
      const styleJsonExists =
        !styleYamlExists && (await pathExists(styleJsonPath));
      const stylePath = styleYamlExists
        ? styleYamlPath
        : styleJsonExists
          ? styleJsonPath
          : null;

      if (!stylePath) {
        issues.push({
          stage,
          message: `Style definition not found for STYLE_ID "${styleConfigId}": ${toRelativePath(styleYamlPath)}`,
        });
      } else {
        if (stylePath.endsWith(".yaml")) {
          const styleRaw = await readFile(stylePath, "utf-8");
          const styleParsed = parseYaml(styleRaw);
          await validateAgainstSchema(styleParsed, SchemaPaths.contentStyle);
          contentStyle = styleParsed as ContentStyleForCheckRun;
        } else {
          contentStyle = await loadJson<ContentStyleForCheckRun>(
            stylePath,
            SchemaPaths.contentStyle,
          );
        }
        if (contentStyle.style_id !== styleConfigId) {
          issues.push({
            stage,
            message: `${toRelativePath(stylePath)}: style_id "${contentStyle.style_id}" does not match STYLE_ID "${styleConfigId}"`,
          });
        }
      }
    } catch (error) {
      issues.push({
        stage,
        message: `project/style config validation failed: ${(error as Error).message}`,
      });
    }
  } else {
    issues.push({
      stage,
      message: `Project config not found for project_id "${projectId}": ${toRelativePath(projectConfigYamlPath)}`,
    });
  }

  return {
    result: { sourceIndex, blueprint, episodePacks, seriesContexts, contentStyle },
    issues,
  };
}
