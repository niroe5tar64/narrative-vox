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
): CheckRunIssue[] {
  const issues: CheckRunIssue[] = [];
  const stage = "authoring-cross-refs" as const;

  const { sourceIndex, blueprint, episodePacks, seriesContexts } =
    authoringResult;

  const sourceIndexSectionIds = new Set(
    sourceIndex?.sections?.map((s) => s.section_id) ?? [],
  );
  const themeCatalogIds = new Set(
    blueprint?.theme_catalog?.map((t) => t.theme_id) ?? [],
  );

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

  return issues;
}
