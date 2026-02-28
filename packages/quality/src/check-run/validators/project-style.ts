import path from "node:path";
import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import {
  type ContentStyleForCheckRun,
  dirExists,
  type ProjectConfigForCheckRun,
  toRelativePath,
} from "../shared.ts";

export async function validateProjectStyle(projectId: string): Promise<{
  projectConfig: ProjectConfigForCheckRun;
  contentStyle: ContentStyleForCheckRun;
}> {
  const projectConfigPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.json`,
  );
  if (!(await dirExists(projectConfigPath))) {
    throw new Error(
      `Project config not found for project_id "${projectId}": ${toRelativePath(projectConfigPath)}`,
    );
  }
  const projectConfig = await loadJson<ProjectConfigForCheckRun>(
    projectConfigPath,
    SchemaPaths.projectConfig,
  );
  const styleConfigId = projectConfig.STYLE_ID;
  const stylePath = path.resolve(
    "configs",
    "content",
    "styles",
    `${styleConfigId}.json`,
  );
  if (!(await dirExists(stylePath))) {
    throw new Error(
      `Style definition not found for STYLE_ID "${styleConfigId}": ${toRelativePath(stylePath)}`,
    );
  }
  const contentStyle = await loadJson<ContentStyleForCheckRun>(
    stylePath,
    SchemaPaths.contentStyle,
  );
  if (contentStyle.style_id !== styleConfigId) {
    throw new Error(
      `${toRelativePath(stylePath)}: style_id "${contentStyle.style_id}" does not match STYLE_ID "${styleConfigId}"`,
    );
  }

  return { projectConfig, contentStyle };
}
