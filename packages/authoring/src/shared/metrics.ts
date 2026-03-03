import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AuthoringMetrics {
  step: string;
  projectId: string;
  episodeId?: string;
  runDir: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  [key: string]: unknown;
}

export async function writeAuthoringMetrics(options: {
  runDir: string;
  step: string;
  episodeId?: string;
  metrics: AuthoringMetrics;
}): Promise<void> {
  const { runDir, step, episodeId, metrics } = options;
  const filename = episodeId
    ? `${episodeId}_metrics.json`
    : `${step}.json`;
  const metricsDir = episodeId
    ? path.join(runDir, "metrics", "authoring", step)
    : path.join(runDir, "metrics", "authoring");
  const metricsPath = path.join(metricsDir, filename);
  await mkdir(metricsDir, { recursive: true });
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
}
