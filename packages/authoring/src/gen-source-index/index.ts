import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRunContract } from "@narrative-vox/domain/run-contract.ts";
import { makeRunIdNow } from "@narrative-vox/domain/run-id.ts";
import { saveRunContract } from "@narrative-vox/infrastructure/run-contract-io.ts";
import { validateAgainstSchema } from "@narrative-vox/infrastructure/schema-validator.ts";
import { SchemaPaths } from "@narrative-vox/infrastructure/schema-paths.ts";
import { assertArtifactAbsent } from "../shared/immutable-run.ts";
import {
  type AuthoringMetrics,
  writeAuthoringMetrics,
} from "../shared/metrics.ts";
import { loadProjectConfigYaml } from "../shared/project-config-loader.ts";
import { collectOssDiveSections } from "./oss-dive-collector.ts";
import { collectTechExplainerSections } from "./tech-explainer-collector.ts";

export interface GenSourceIndexOptions {
  projectId: string;
  runDir?: string;
}

export async function genSourceIndex(
  options: GenSourceIndexOptions,
): Promise<void> {
  const stepLabel = "gen-source-index";
  const startedAt = new Date();
  const { projectId } = options;

  console.log(`[${stepLabel}] Loading project config: ${projectId}`);
  const config = await loadProjectConfigYaml(projectId);

  // Resolve or create run-dir
  let runDir: string;
  if (options.runDir) {
    runDir = path.resolve(options.runDir);
  } else {
    const runId = makeRunIdNow();
    runDir = path.resolve("data", "projects", projectId, runId);
    await mkdir(runDir, { recursive: true });
    const contract = createRunContract({ projectId, runId, runDir });
    await saveRunContract(contract);
    console.log(`[${stepLabel}] Created run: ${runId}`);
  }

  const artifactPath = path.join(
    runDir,
    "source_index",
    "source_index.json",
  );
  await assertArtifactAbsent(artifactPath, "GEN_SOURCE_INDEX");

  // Collect sections based on genre
  console.log(`[${stepLabel}] Collecting source sections (${config.GENRE_ID})...`);
  let sections: Array<Record<string, unknown>>;
  if (config.GENRE_ID === "tech-explainer") {
    const rawSections = await collectTechExplainerSections(config);
    sections = rawSections.map((s, i) => ({
      section_id: `SRC${String(i + 1).padStart(4, "0")}`,
      ordinal: i + 1,
      ...s,
    }));
  } else if (config.GENRE_ID === "oss-dive") {
    const rawSections = await collectOssDiveSections(config);
    sections = rawSections.map((s, i) => ({
      section_id: `SRC${String(i + 1).padStart(4, "0")}`,
      ordinal: i + 1,
      ...s,
    }));
  } else {
    throw new Error(`[${stepLabel}] Unknown genre: ${(config as { GENRE_ID: string }).GENRE_ID}`);
  }

  const tokenTotal = sections.reduce(
    (sum, s) => sum + ((s.token_estimate as number) ?? 0),
    0,
  );

  const sourceIndex = {
    schema_version: "1.0",
    meta: {
      project_id: projectId,
      genre_id: config.GENRE_ID,
      generated_at: new Date().toISOString(),
      section_count: sections.length,
      token_estimate_total: tokenTotal,
    },
    sections,
  };

  // Validate
  try {
    await validateAgainstSchema(sourceIndex, SchemaPaths.sourceIndex);
    console.log(`[${stepLabel}] Schema validation: OK`);
  } catch (error) {
    console.log(
      `[${stepLabel}] Schema validation: WARN - ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Write artifact
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(
    artifactPath,
    `${JSON.stringify(sourceIndex, null, 2)}\n`,
  );
  console.log(
    `[${stepLabel}] Saved: ${path.relative(process.cwd(), artifactPath)}`,
  );
  console.log(
    `[${stepLabel}] ${sections.length} sections, ${tokenTotal} estimated tokens`,
  );

  // Metrics
  const finishedAt = new Date();
  const metrics: AuthoringMetrics = {
    step: stepLabel,
    projectId,
    runDir,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    sectionCount: sections.length,
    tokenEstimateTotal: tokenTotal,
    genreId: config.GENRE_ID,
  };
  await writeAuthoringMetrics({ runDir, step: stepLabel, metrics });
}
