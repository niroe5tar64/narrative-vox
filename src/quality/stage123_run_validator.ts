import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { loadJson } from "../shared/json.ts";
import { SECTION_RE, TOTAL_TIME_RE } from "../shared/script_patterns.ts";

const STAGE2_FILE_RE = /^(E[0-9]{2})_variables\.json$/;
const STAGE3_FILE_RE = /^(E[0-9]{2})_script\.md$/;

export interface ValidateRunOptions {
  runDir: string;
}

export interface ValidateRunResult {
  runDir: string;
  stage2EpisodeCount: number;
  stage3EpisodeCount: number;
  validatedEpisodeIds: string[];
}

function toRelativePath(filePath: string): string {
  return path.relative(process.cwd(), filePath) || ".";
}

function ensureHasAllSections(scriptText: string, scriptPath: string): void {
  const sectionIds = new Set<number>();
  let hasTotalTime = false;

  for (const line of scriptText.split(/\r?\n/)) {
    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch?.[1]) {
      sectionIds.add(Number(sectionMatch[1]));
    }
    if (TOTAL_TIME_RE.test(line)) {
      hasTotalTime = true;
    }
  }

  const missingSections = Array.from({ length: 8 }, (_, index) => index + 1).filter(
    (id) => !sectionIds.has(id)
  );
  if (missingSections.length > 0) {
    throw new Error(
      `${toRelativePath(scriptPath)} is missing required sections: ${missingSections.join(", ")}`
    );
  }

  if (!hasTotalTime) {
    throw new Error(`${toRelativePath(scriptPath)} is missing "合計想定時間:" line`);
  }
}

function collectEpisodeIds(fileNames: string[], pattern: RegExp): string[] {
  const episodeIds: string[] = [];
  for (const name of fileNames) {
    const match = name.match(pattern);
    if (!match?.[1]) {
      continue;
    }
    episodeIds.push(match[1]);
  }
  return episodeIds.sort();
}

function diffEpisodes(baseIds: string[], compareIds: string[]): string[] {
  const compareSet = new Set(compareIds);
  return baseIds.filter((id) => !compareSet.has(id));
}

export async function validateStage123Run({ runDir }: ValidateRunOptions): Promise<ValidateRunResult> {
  const resolvedRunDir = path.resolve(runDir);

  const stage1Path = path.join(resolvedRunDir, "stage1", "book_blueprint.json");
  const stage2Dir = path.join(resolvedRunDir, "stage2");
  const stage3Dir = path.join(resolvedRunDir, "stage3");

  await loadJson<unknown>(
    stage1Path,
    path.resolve(process.cwd(), "schemas/stage1.book-blueprint.schema.json")
  );

  const stage2Files = (await readdir(stage2Dir)).filter((name) => STAGE2_FILE_RE.test(name)).sort();
  if (stage2Files.length === 0) {
    throw new Error(`${toRelativePath(stage2Dir)} has no E##_variables.json files`);
  }
  const stage2EpisodeIds = collectEpisodeIds(stage2Files, STAGE2_FILE_RE);
  for (const fileName of stage2Files) {
    const filePath = path.join(stage2Dir, fileName);
    await loadJson<unknown>(
      filePath,
      path.resolve(process.cwd(), "schemas/stage2.episode-variables.schema.json")
    );
  }

  const stage3Files = (await readdir(stage3Dir)).filter((name) => STAGE3_FILE_RE.test(name)).sort();
  if (stage3Files.length === 0) {
    throw new Error(`${toRelativePath(stage3Dir)} has no E##_script.md files`);
  }
  const stage3EpisodeIds = collectEpisodeIds(stage3Files, STAGE3_FILE_RE);
  for (const fileName of stage3Files) {
    const filePath = path.join(stage3Dir, fileName);
    const scriptText = await readFile(filePath, "utf-8");
    ensureHasAllSections(scriptText, filePath);
  }

  const missingInStage3 = diffEpisodes(stage2EpisodeIds, stage3EpisodeIds);
  if (missingInStage3.length > 0) {
    throw new Error(`stage3 is missing scripts for episodes: ${missingInStage3.join(", ")}`);
  }

  const extraInStage3 = diffEpisodes(stage3EpisodeIds, stage2EpisodeIds);
  if (extraInStage3.length > 0) {
    throw new Error(`stage3 has episodes not in stage2 variables: ${extraInStage3.join(", ")}`);
  }

  return {
    runDir: resolvedRunDir,
    stage2EpisodeCount: stage2EpisodeIds.length,
    stage3EpisodeCount: stage3EpisodeIds.length,
    validatedEpisodeIds: stage2EpisodeIds
  };
}
