import { access } from "node:fs/promises";
import path from "node:path";

export class ArtifactExistsError extends Error {
  constructor(
    public readonly artifactPath: string,
    public readonly code: string,
  ) {
    super(
      `[${code}] Artifact already exists: ${path.relative(process.cwd(), artifactPath)}`,
    );
    this.name = "ArtifactExistsError";
  }
}

export async function assertArtifactAbsent(
  artifactPath: string,
  code: string,
): Promise<void> {
  try {
    await access(artifactPath);
    throw new ArtifactExistsError(artifactPath, code);
  } catch (error) {
    if (error instanceof ArtifactExistsError) throw error;
    // File does not exist — OK
  }
}

const PRIMARY_ARTIFACTS = [
  "blueprint/project_blueprint.json",
  "source_index/source_index.json",
] as const;

export async function assertFreshRun(runDir: string): Promise<void> {
  for (const rel of PRIMARY_ARTIFACTS) {
    const fullPath = path.join(runDir, rel);
    try {
      await access(fullPath);
      throw new ArtifactExistsError(fullPath, "FRESH_RUN");
    } catch (error) {
      if (error instanceof ArtifactExistsError) throw error;
      // File does not exist — OK
    }
  }
}

export function findNextPlannedEpisode(
  blueprint: { episode_plan: Array<{ episode_id: string }> },
  existingArtifacts: Set<string>,
  stage: string,
): string | undefined {
  for (const ep of blueprint.episode_plan) {
    const key = `${stage}/${ep.episode_id}`;
    if (!existingArtifacts.has(key)) {
      return ep.episode_id;
    }
  }
  return undefined;
}
