#!/usr/bin/env bun
import { access, cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const RUN_ID_RE = /^run-\d{8}-\d{4}$/;
const STAGES_TO_COPY = ["stage1", "stage2", "stage3"] as const;

type CliOptions = Record<string, string | boolean>;

interface CloneRunOptions {
  baseRunDir: string;
  targetRunDir: string;
  stages?: ReadonlyArray<string>;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = value;
    i += 1;
  }
  return options;
}

function optionAsString(options: CliOptions, key: string): string | undefined {
  const value = options[key];
  if (!value || value === true) {
    return undefined;
  }
  return String(value);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function toRunIdTimestampPart(value: number): string {
  return String(value).padStart(2, "0");
}

export function makeRunIdNow(now: Date = new Date()): string {
  const year = String(now.getFullYear());
  const month = toRunIdTimestampPart(now.getMonth() + 1);
  const day = toRunIdTimestampPart(now.getDate());
  const hour = toRunIdTimestampPart(now.getHours());
  const minute = toRunIdTimestampPart(now.getMinutes());
  return `run-${year}${month}${day}-${hour}${minute}`;
}

export function validateRunId(runId: string): string {
  if (RUN_ID_RE.test(runId)) {
    return runId;
  }
  throw new Error(`Invalid --run-id "${runId}". Expected format: run-YYYYMMDD-HHMM`);
}

async function listRunIds(projectDir: string): Promise<string[]> {
  if (!(await pathExists(projectDir))) {
    return [];
  }

  const entries = await readdir(projectDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && RUN_ID_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function listProjectIds(projectsRoot: string): Promise<string[]> {
  if (!(await pathExists(projectsRoot))) {
    return [];
  }

  const entries = await readdir(projectsRoot, { withFileTypes: true });
  const projectIds: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const runIds = await listRunIds(path.join(projectsRoot, entry.name));
    if (runIds.length > 0) {
      projectIds.push(entry.name);
    }
  }
  return projectIds.sort();
}

export async function findLatestRunDir(projectDir: string): Promise<string | null> {
  const runIds = await listRunIds(projectDir);
  if (runIds.length === 0) {
    return null;
  }
  return path.join(projectDir, runIds[runIds.length - 1]);
}

function printUsage() {
  console.log(`Usage:
  bun src/cli/new_run.ts [--project-id <id>] [--base-run <projects/.../run-YYYYMMDD-HHMM>] [--run-id <run-YYYYMMDD-HHMM>] [--projects-root <projects>] [--no-prompt]

Behavior:
  - Missing arguments are asked interactively when TTY is available.
  - Copies stage1/stage2/stage3 from base run into new run directory.
`);
}

async function askWithDefault(
  rl: ReturnType<typeof createInterface>,
  prompt: string,
  defaultValue?: string
): Promise<string> {
  const hint = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${prompt}${hint}: `)).trim();
  return answer || defaultValue || "";
}

function deriveProjectIdFromBaseRun(baseRunDir: string): string {
  return path.basename(path.dirname(path.resolve(baseRunDir)));
}

async function inferDefaultProjectId(projectsRoot: string): Promise<string | undefined> {
  const projectIds = await listProjectIds(projectsRoot);
  if (projectIds.includes("introducing-rescript")) {
    return "introducing-rescript";
  }
  if (projectIds.length === 1) {
    return projectIds[0];
  }
  return undefined;
}

export async function cloneRunDirectories({
  baseRunDir,
  targetRunDir,
  stages = STAGES_TO_COPY
}: CloneRunOptions): Promise<void> {
  const resolvedBaseRunDir = path.resolve(baseRunDir);
  const resolvedTargetRunDir = path.resolve(targetRunDir);

  if (!(await pathExists(resolvedBaseRunDir))) {
    throw new Error(`Base run directory does not exist: ${resolvedBaseRunDir}`);
  }
  if (await pathExists(resolvedTargetRunDir)) {
    throw new Error(`Target run directory already exists: ${resolvedTargetRunDir}`);
  }

  for (const stageName of stages) {
    const stagePath = path.join(resolvedBaseRunDir, stageName);
    if (!(await pathExists(stagePath))) {
      throw new Error(`Required stage directory not found: ${stagePath}`);
    }
  }

  await mkdir(resolvedTargetRunDir, { recursive: true });
  for (const stageName of stages) {
    await cp(path.join(resolvedBaseRunDir, stageName), path.join(resolvedTargetRunDir, stageName), {
      recursive: true,
      force: false,
      errorOnExist: true
    });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const showHelp = Boolean(options.help || options.h);
  if (showHelp) {
    printUsage();
    return;
  }

  const projectsRoot = path.resolve(optionAsString(options, "projects-root") || "projects");
  const noPrompt = Boolean(options["no-prompt"] || options["non-interactive"]);
  const interactive = !noPrompt && process.stdin.isTTY && process.stdout.isTTY;

  let projectId = optionAsString(options, "project-id");
  let baseRunDir = optionAsString(options, "base-run");
  let runId = optionAsString(options, "run-id");

  if (!projectId && baseRunDir) {
    projectId = deriveProjectIdFromBaseRun(baseRunDir);
  }

  const rl = interactive ? createInterface({ input, output }) : null;

  try {
    if (!projectId) {
      const inferred = await inferDefaultProjectId(projectsRoot);
      if (interactive && rl) {
        projectId = await askWithDefault(rl, "project-id", inferred);
      } else {
        projectId = inferred;
      }
    }
    if (!projectId) {
      throw new Error(
        "Could not determine project-id. Pass --project-id or run in TTY interactive mode."
      );
    }

    if (!baseRunDir) {
      const latestRunDir = await findLatestRunDir(path.join(projectsRoot, projectId));
      if (interactive && rl) {
        const defaultBaseRun = latestRunDir ? path.relative(process.cwd(), latestRunDir) : undefined;
        const answer = await askWithDefault(rl, "base-run", defaultBaseRun);
        baseRunDir = answer ? path.resolve(answer) : undefined;
      } else {
        baseRunDir = latestRunDir || undefined;
      }
    } else {
      baseRunDir = path.resolve(baseRunDir);
    }
    if (!baseRunDir) {
      throw new Error("Could not determine base run. Pass --base-run.");
    }

    if (!runId) {
      const defaultRunId = makeRunIdNow();
      if (interactive && rl) {
        runId = await askWithDefault(rl, "run-id", defaultRunId);
      } else {
        runId = defaultRunId;
      }
    }
    const finalRunId = validateRunId(runId);

    const targetRunDir = path.join(projectsRoot, projectId, finalRunId);
    if (path.resolve(baseRunDir) === path.resolve(targetRunDir)) {
      throw new Error("base-run and target run are the same path. Choose a different --run-id.");
    }

    await cloneRunDirectories({
      baseRunDir,
      targetRunDir
    });

    console.log("New run created");
    console.log(`- project: ${projectId}`);
    console.log(`- base: ${path.relative(process.cwd(), path.resolve(baseRunDir))}`);
    console.log(`- target: ${path.relative(process.cwd(), targetRunDir)}`);
  } finally {
    await rl?.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
