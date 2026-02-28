import { readdir } from "node:fs/promises";
import path from "node:path";
import { loadJson } from "@narrative-vox/infrastructure/json.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import {
  type BlueprintForCheckRun,
  collectEpisodeIds,
  type EpisodeMaterialForCheckRun,
  MATERIAL_FILE_RE,
  toRelativePath,
} from "../shared.ts";

export function collectTechnicalTerms(
  material: EpisodeMaterialForCheckRun,
  episodeId: string,
  materialRef: string,
  warnings: string[],
): string[] {
  const terms = material.technical_terms;
  if (!Array.isArray(terms)) {
    return [];
  }

  const unique = new Set<string>();
  for (const entry of terms) {
    const raw = entry?.term;
    const term = typeof raw === "string" ? raw.trim() : "";
    if (!term) {
      warnings.push(
        `${episodeId}: ${materialRef} has empty technical_terms entry; skipped`,
      );
      continue;
    }
    unique.add(term);
  }
  return [...unique].sort((a, b) => a.localeCompare(b, "ja"));
}

export function findEpisodeDependencyCycle(
  dependencies: Map<string, string[]>,
): string[] | undefined {
  const visitState = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (episodeId: string): string[] | undefined => {
    const state = visitState.get(episodeId) ?? 0;
    if (state === 1) {
      const cycleStart = stack.indexOf(episodeId);
      if (cycleStart >= 0) {
        return [...stack.slice(cycleStart), episodeId];
      }
      return [episodeId, episodeId];
    }
    if (state === 2) {
      return undefined;
    }

    visitState.set(episodeId, 1);
    stack.push(episodeId);

    for (const dependencyId of dependencies.get(episodeId) ?? []) {
      const cycle = visit(dependencyId);
      if (cycle) {
        return cycle;
      }
    }

    stack.pop();
    visitState.set(episodeId, 2);
    return undefined;
  };

  for (const episodeId of dependencies.keys()) {
    const cycle = visit(episodeId);
    if (cycle) {
      return cycle;
    }
  }

  return undefined;
}

export function validateEpisodePrerequisites(
  blueprint: BlueprintForCheckRun,
  blueprintPath: string,
): void {
  const episodeIds = blueprint.episode_plan.map(
    (episode) => episode.episode_id,
  );
  const episodeIdSet = new Set(episodeIds);
  const dependencies = new Map<string, string[]>();

  for (const episode of blueprint.episode_plan) {
    const prerequisites = episode.prerequisite_episodes ?? [];
    const seen = new Set<string>();
    const duplicatePrerequisites: string[] = [];
    const missingEpisodeIds: string[] = [];

    for (const prerequisiteEpisodeId of prerequisites) {
      if (seen.has(prerequisiteEpisodeId)) {
        duplicatePrerequisites.push(prerequisiteEpisodeId);
      } else {
        seen.add(prerequisiteEpisodeId);
      }

      if (prerequisiteEpisodeId === episode.episode_id) {
        throw new Error(
          `${toRelativePath(blueprintPath)}: episode_plan "${episode.episode_id}" cannot list itself in prerequisite_episodes`,
        );
      }

      if (!episodeIdSet.has(prerequisiteEpisodeId)) {
        missingEpisodeIds.push(prerequisiteEpisodeId);
      }
    }

    if (duplicatePrerequisites.length > 0) {
      const duplicateList = [...new Set(duplicatePrerequisites)].join(", ");
      throw new Error(
        `${toRelativePath(blueprintPath)}: episode_plan "${episode.episode_id}" has duplicate prerequisite_episodes: ${duplicateList}`,
      );
    }

    if (missingEpisodeIds.length > 0) {
      const missingList = [...new Set(missingEpisodeIds)].join(", ");
      throw new Error(
        `${toRelativePath(blueprintPath)}: episode_plan "${episode.episode_id}" references missing prerequisite_episodes: ${missingList}`,
      );
    }

    dependencies.set(episode.episode_id, prerequisites);
  }

  const cycle = findEpisodeDependencyCycle(dependencies);
  if (cycle) {
    throw new Error(
      `${toRelativePath(blueprintPath)}: episode_plan prerequisite_episodes has a cycle: ${cycle.join(" -> ")}`,
    );
  }
}

export async function validateBlueprintAndMaterial(params: {
  resolvedRunDir: string;
  warnings: string[];
}): Promise<{
  blueprint: BlueprintForCheckRun;
  materialEpisodeIds: string[];
  materialPathByEpisodeId: Map<string, string>;
  technicalTermsByEpisodeId: Map<string, string[]>;
  projectId: string;
}> {
  const blueprintPath = path.join(
    params.resolvedRunDir,
    "blueprint",
    "project_blueprint.json",
  );
  const blueprint = await loadJson<BlueprintForCheckRun>(
    blueprintPath,
    SchemaPaths.blueprint,
  );
  validateEpisodePrerequisites(blueprint, blueprintPath);

  const materialDir = path.join(params.resolvedRunDir, "material");
  const materialFiles = (await readdir(materialDir))
    .filter((name) => MATERIAL_FILE_RE.test(name))
    .sort();
  if (materialFiles.length === 0) {
    throw new Error(
      `${toRelativePath(materialDir)} has no E##_material.json files`,
    );
  }

  const materialEpisodeIds = collectEpisodeIds(materialFiles, MATERIAL_FILE_RE);
  const materialProjectIds = new Set<string>();
  const materialPathByEpisodeId = new Map<string, string>();
  const technicalTermsByEpisodeId = new Map<string, string[]>();

  for (const fileName of materialFiles) {
    const filePath = path.join(materialDir, fileName);
    const episodeId = fileName.replace("_material.json", "");
    const material = await loadJson<EpisodeMaterialForCheckRun>(
      filePath,
      SchemaPaths.episodeMaterial,
    );
    const materialRef = `material/${fileName}`;
    materialPathByEpisodeId.set(episodeId, materialRef);
    technicalTermsByEpisodeId.set(
      episodeId,
      collectTechnicalTerms(material, episodeId, materialRef, params.warnings),
    );
    materialProjectIds.add(material.meta.project_id);
  }

  if (materialProjectIds.size !== 1) {
    throw new Error(
      `${toRelativePath(materialDir)} has inconsistent project_id values: ${[
        ...materialProjectIds,
      ].join(", ")}`,
    );
  }

  const [projectId] = [...materialProjectIds];
  if (!projectId) {
    throw new Error(
      `${toRelativePath(materialDir)} has no project_id in material metadata`,
    );
  }

  return {
    blueprint,
    materialEpisodeIds,
    materialPathByEpisodeId,
    technicalTermsByEpisodeId,
    projectId,
  };
}
