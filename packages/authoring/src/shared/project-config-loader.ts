import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ProjectConfig } from "@narrative-vox/api-types/projects.ts";
import { parse as parseYaml } from "yaml";

export async function loadProjectConfigYaml(
  projectId: string,
): Promise<ProjectConfig> {
  const configPath = path.resolve(
    "configs",
    "pipeline",
    "projects",
    `${projectId}.yaml`,
  );
  const raw = await readFile(configPath, "utf-8");
  return parseYaml(raw) as ProjectConfig;
}
