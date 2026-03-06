import type { CheckRunIssue } from "../issues.ts";
import type { AuthoringSchemasResult } from "./authoring-schemas.ts";

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

export function validateAuthoringCrossRefs(
  authoringResult: AuthoringSchemasResult,
  plannedEpisodeIds: string[],
): { issues: CheckRunIssue[]; warnings: string[] } {
  const issues: CheckRunIssue[] = [];
  const warnings: string[] = [];
  const stage = "authoring-cross-refs" as const;

  const { sourceIndex, blueprint, episodePacks, seriesContexts } =
    authoringResult;

  const sourceIndexSectionIds = new Set(
    sourceIndex?.sections?.map((s) => s.section_id) ?? [],
  );
  const sourceIndexTokenEstimates = new Map(
    sourceIndex?.sections
      ?.filter((s) => s.token_estimate !== undefined)
      .map((s) => [s.section_id, s.token_estimate as number]) ?? [],
  );
  const themeCatalogIds = new Set(
    blueprint?.theme_catalog?.map((t) => t.theme_id) ?? [],
  );

  // CR-EP-ORDER: Episode plan ordering — numeric ascending and unique
  if (blueprint?.episode_plan) {
    const planIds = blueprint.episode_plan.map((ep) => ep.episode_id);
    const planNums = planIds.map((id) =>
      Number.parseInt(id.replace(/\D/g, ""), 10),
    );
    for (let i = 1; i < planNums.length; i++) {
      if (planNums[i] !== undefined && planNums[i - 1] !== undefined && planNums[i] <= planNums[i - 1]) {
        issues.push({
          stage,
          message: `blueprint episode_plan is not in ascending order: ${planIds[i - 1]} comes before ${planIds[i]}`,
        });
        break;
      }
    }
  }

  // CR-TOKEN-BUDGET: Source token budget per episode
  if (blueprint?.episode_plan && sourceIndex) {
    for (const ep of blueprint.episode_plan) {
      if (!Array.isArray(ep.source_section_ids)) continue;
      let totalTokens = 0;
      for (const sectionId of ep.source_section_ids) {
        const estimate = sourceIndexTokenEstimates.get(sectionId);
        if (estimate !== undefined) {
          totalTokens += estimate;
        }
      }
      if (totalTokens > 24000) {
        issues.push({
          stage,
          episodeId: ep.episode_id,
          message: `blueprint episode source token budget exceeded: ${totalTokens} > 24000`,
        });
      }
    }
  }

  for (const [episodeId, pack] of episodePacks) {
    // CR-01: source_section_ids → source_index.sections
    if (sourceIndex && Array.isArray(pack.source_section_ids)) {
      for (const sectionId of pack.source_section_ids) {
        if (!sourceIndexSectionIds.has(sectionId)) {
          issues.push({
            stage,
            episodeId,
            message: `episode_pack references missing source_section_id "${sectionId}"`,
          });
        }
      }
    }

    // CR-05: target_theme_ids → blueprint.theme_catalog
    if (blueprint?.theme_catalog && Array.isArray(pack.target_theme_ids)) {
      for (const themeId of pack.target_theme_ids) {
        if (!themeCatalogIds.has(themeId)) {
          issues.push({
            stage,
            episodeId,
            message: `episode_pack references missing theme_id "${themeId}" in blueprint.theme_catalog`,
          });
        }
      }
    }

    // CR-SECTION-SUBSET: episode_pack.source_section_ids ⊆ blueprint.episode_plan[ep].source_section_ids
    if (blueprint?.episode_plan && Array.isArray(pack.source_section_ids)) {
      const bpEpisode = blueprint.episode_plan.find(
        (ep) => ep.episode_id === episodeId,
      );
      if (bpEpisode?.source_section_ids) {
        const bpSectionIds = new Set(bpEpisode.source_section_ids);
        for (const sectionId of pack.source_section_ids) {
          if (!bpSectionIds.has(sectionId)) {
            issues.push({
              stage,
              episodeId,
              message: `episode_pack source_section_id "${sectionId}" not in blueprint episode_plan`,
            });
          }
        }
      }
    }

    // CR-THEME-MATCH: episode_pack.target_theme_ids === blueprint.episode_plan[ep].target_theme_ids
    if (blueprint?.episode_plan && Array.isArray(pack.target_theme_ids)) {
      const bpEpisode = blueprint.episode_plan.find(
        (ep) => ep.episode_id === episodeId,
      );
      if (bpEpisode?.target_theme_ids) {
        const packThemes = [...pack.target_theme_ids].sort();
        const bpThemes = [...bpEpisode.target_theme_ids].sort();
        if (JSON.stringify(packThemes) !== JSON.stringify(bpThemes)) {
          issues.push({
            stage,
            episodeId,
            message: `episode_pack target_theme_ids [${packThemes.join(", ")}] does not match blueprint [${bpThemes.join(", ")}]`,
          });
        }
      }
    }

    // CR-03/04: facts[].depends_on[] same-pack reference + DAG acyclicity
    if (Array.isArray(pack.facts)) {
      const factIds = new Set(
        pack.facts.map((f) => f.fact_id).filter(Boolean) as string[],
      );
      const factDeps = new Map<string, string[]>();

      for (const fact of pack.facts) {
        const factId = fact.fact_id;
        if (!factId) continue;

        const deps = fact.depends_on ?? [];
        factDeps.set(factId, deps);

        for (const depId of deps) {
          if (!factIds.has(depId)) {
            issues.push({
              stage,
              episodeId,
              message: `fact "${factId}" depends_on unknown fact "${depId}"`,
            });
          }
        }
      }

      const cycle = findEpisodeDependencyCycle(factDeps);
      if (cycle) {
        issues.push({
          stage,
          episodeId,
          message: `fact dependency cycle: ${cycle.join(" -> ")}`,
        });
      }
    }
  }

  // CR-SERIES-THROUGH: series_context.meta.through_episode_id === filename episode ID
  for (const [episodeId, ctx] of seriesContexts) {
    if (ctx.meta.through_episode_id !== episodeId) {
      issues.push({
        stage,
        episodeId,
        message: `series_context.meta.through_episode_id "${ctx.meta.through_episode_id}" does not match filename episode_id "${episodeId}"`,
      });
    }
  }

  // Series context: E02+ should have prior series_context
  for (const episodeId of plannedEpisodeIds) {
    const episodeNum = Number.parseInt(episodeId.slice(1), 10);
    if (episodeNum < 2) continue;
    const prevEpisodeId = `E${String(episodeNum - 1).padStart(2, "0")}`;
    if (!seriesContexts.has(prevEpisodeId)) {
      issues.push({
        stage,
        episodeId,
        message: `prior series_context for ${prevEpisodeId} not found (continuity may be limited)`,
      });
    }
  }

  // CR-06: series_context.covered_theme_ids[] ⊆ blueprint.theme_catalog
  if (blueprint?.theme_catalog) {
    for (const [episodeId, ctx] of seriesContexts) {
      if (!Array.isArray(ctx.covered_theme_ids)) continue;
      for (const themeId of ctx.covered_theme_ids) {
        if (!themeCatalogIds.has(themeId)) {
          warnings.push(
            `[${episodeId}] series_context.covered_theme_ids references unknown theme_id "${themeId}"`,
          );
        }
      }
    }
  }

  // CR-07: series_context.resolved_loop_ids[] ⊆ prior episodes' open_loops[].loop_id
  const sortedEpisodeIds = [...seriesContexts.keys()].sort((a, b) => {
    const numA = Number.parseInt(a.replace(/\D/g, ""), 10);
    const numB = Number.parseInt(b.replace(/\D/g, ""), 10);
    return numA - numB;
  });
  const allPriorOpenLoopIds = new Set<string>();
  for (const episodeId of sortedEpisodeIds) {
    const ctx = seriesContexts.get(episodeId);
    if (!ctx) continue;

    if (Array.isArray(ctx.resolved_loop_ids)) {
      for (const loopId of ctx.resolved_loop_ids) {
        if (!allPriorOpenLoopIds.has(loopId)) {
          warnings.push(
            `[${episodeId}] series_context.resolved_loop_ids references unknown loop_id "${loopId}"`,
          );
        }
      }
    }

    if (Array.isArray(ctx.open_loops)) {
      for (const loop of ctx.open_loops) {
        allPriorOpenLoopIds.add(loop.loop_id);
      }
    }
  }

  return { issues, warnings };
}
