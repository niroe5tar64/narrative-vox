import { readFile } from "node:fs/promises";
import type { CollectedArtifacts } from "../artifact-collection.ts";
import type { CheckRunIssue } from "../issues.ts";
import { diffEpisodes } from "../shared.ts";

interface BlueprintEpisodePlanItem {
  episode_id: string;
}

interface BlueprintRaw {
  episode_plan?: BlueprintEpisodePlanItem[];
}

interface RunContractRaw {
  projectId?: string;
  runId?: string;
}

export interface RequiredAuthoringResult {
  projectId: string;
  runId: string;
  plannedEpisodeIds: string[];
}

export async function validateRequiredAuthoring(
  resolvedRunDir: string,
  artifacts: CollectedArtifacts,
): Promise<{ result: RequiredAuthoringResult; issues: CheckRunIssue[] }> {
  const issues: CheckRunIssue[] = [];
  const stage = "required-authoring" as const;

  if (!artifacts.blueprintPath) {
    issues.push({
      stage,
      message: "blueprint/project_blueprint.json not found",
    });
  }
  if (!artifacts.sourceIndexPath) {
    issues.push({
      stage,
      message: "source_index/source_index.json not found",
    });
  }

  let projectId = "";
  let runId = "";

  if (!artifacts.runContractPath) {
    issues.push({
      stage,
      message: "run-contract.json not found",
    });
  } else {
    try {
      const raw = JSON.parse(
        await readFile(artifacts.runContractPath, "utf-8"),
      ) as RunContractRaw;
      projectId = raw.projectId ?? "";
      runId = raw.runId ?? "";
    } catch {
      issues.push({ stage, message: "run-contract.json parse failed" });
    }
  }

  let plannedEpisodeIds: string[] = [];
  if (artifacts.blueprintPath) {
    try {
      const blueprintRaw = JSON.parse(
        await readFile(artifacts.blueprintPath, "utf-8"),
      ) as BlueprintRaw;
      const plan = blueprintRaw.episode_plan;
      if (Array.isArray(plan)) {
        const rawIds = plan
          .map((ep) => ep.episode_id)
          .filter((id): id is string => typeof id === "string");

        const seen = new Set<string>();
        const duplicates = new Set<string>();
        for (const id of rawIds) {
          if (seen.has(id)) {
            duplicates.add(id);
          }
          seen.add(id);
        }
        if (duplicates.size > 0) {
          issues.push({
            stage,
            message: `blueprint episode_plan has duplicate episode_ids: ${[...duplicates].sort().join(", ")}`,
          });
        }

        plannedEpisodeIds = [...seen].sort((a, b) => {
          const numA = Number.parseInt(a.replace(/\D/g, ""), 10);
          const numB = Number.parseInt(b.replace(/\D/g, ""), 10);
          return numA - numB;
        });
      }
      if (plannedEpisodeIds.length === 0) {
        issues.push({
          stage,
          message:
            "blueprint episode_plan is empty or has no valid episode_ids",
        });
      }
    } catch {
      issues.push({ stage, message: "blueprint parse failed" });
    }
  }

  if (plannedEpisodeIds.length > 0) {
    const episodePackIds = [...artifacts.episodePackPaths.keys()].sort();
    const missingPacks = diffEpisodes(plannedEpisodeIds, episodePackIds);
    const extraPacks = diffEpisodes(episodePackIds, plannedEpisodeIds);
    if (missingPacks.length > 0) {
      issues.push({
        stage,
        message: `episode_pack missing for planned episodes: ${missingPacks.join(", ")}`,
      });
    }
    if (extraPacks.length > 0) {
      issues.push({
        stage,
        message: `episode_pack has episodes not in blueprint: ${extraPacks.join(", ")}`,
      });
    }

    const scriptIds = [...artifacts.scriptPaths.keys()].sort();
    const missingScripts = diffEpisodes(plannedEpisodeIds, scriptIds);
    const extraScripts = diffEpisodes(scriptIds, plannedEpisodeIds);
    if (missingScripts.length > 0) {
      issues.push({
        stage,
        message: `script missing for planned episodes: ${missingScripts.join(", ")}`,
      });
    }
    if (extraScripts.length > 0) {
      issues.push({
        stage,
        message: `script has episodes not in blueprint: ${extraScripts.join(", ")}`,
      });
    }

    const contextIds = [...artifacts.seriesContextPaths.keys()].sort();
    const missingContexts = diffEpisodes(plannedEpisodeIds, contextIds);
    const extraContexts = diffEpisodes(contextIds, plannedEpisodeIds);
    if (missingContexts.length > 0) {
      issues.push({
        stage,
        message: `series_context missing for planned episodes: ${missingContexts.join(", ")}`,
      });
    }
    if (extraContexts.length > 0) {
      issues.push({
        stage,
        message: `series_context has episodes not in blueprint: ${extraContexts.join(", ")}`,
      });
    }
  }

  return {
    result: { projectId, runId, plannedEpisodeIds },
    issues,
  };
}
