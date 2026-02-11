#!/usr/bin/env bun
import { access, cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { parseCliArgs, optionAsString } from "../shared/cli_args.ts";
import { RUN_ID_RE, makeRunIdNow, validateRunId } from "../shared/run_id.ts";

export { makeRunIdNow, validateRunId };

const STAGES_TO_COPY = ["stage1", "stage2", "stage3"] as const;

interface CloneRunOptions {
	sourceRunDir: string;
	runDir: string;
	stages?: ReadonlyArray<string>;
}

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
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

export async function findLatestRunDir(
	projectDir: string,
): Promise<string | null> {
	const runIds = await listRunIds(projectDir);
	if (runIds.length === 0) {
		return null;
	}
	return path.join(projectDir, runIds[runIds.length - 1]);
}

function printUsage() {
	console.log(`Usage:
  bun src/cli/new_run.ts [--run-dir <projects/.../run-YYYYMMDD-HHMM>] [--source-run-dir <projects/.../run-YYYYMMDD-HHMM>] [--project-id <id>] [--run-id <run-YYYYMMDD-HHMM>] [--projects-dir <projects>] [--default-project-id <id>] [--default-source-run-dir <projects/.../run-YYYYMMDD-HHMM>] [--default-run-id <run-YYYYMMDD-HHMM>] [--no-prompt]

Behavior:
  - Missing arguments are asked interactively when TTY is available.
  - Default values can be overridden by --default-* options.
  - Copies stage1/stage2/stage3 from source run into target run directory.
`);
}

async function askWithDefault(
	rl: ReturnType<typeof createInterface>,
	prompt: string,
	defaultValue?: string,
): Promise<string> {
	const hint = defaultValue ? ` [${defaultValue}]` : "";
	const answer = (await rl.question(`${prompt}${hint}: `)).trim();
	return answer || defaultValue || "";
}

function deriveProjectIdFromRunDir(runDir: string): string {
	return path.basename(path.dirname(path.resolve(runDir)));
}

async function inferDefaultProjectId(
	projectsRoot: string,
): Promise<string | undefined> {
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
	sourceRunDir,
	runDir,
	stages = STAGES_TO_COPY,
}: CloneRunOptions): Promise<void> {
	const resolvedSourceRunDir = path.resolve(sourceRunDir);
	const resolvedRunDir = path.resolve(runDir);

	if (!(await pathExists(resolvedSourceRunDir))) {
		throw new Error(
			`Source run directory does not exist: ${resolvedSourceRunDir}`,
		);
	}
	if (await pathExists(resolvedRunDir)) {
		throw new Error(`Target run directory already exists: ${resolvedRunDir}`);
	}

	for (const stageName of stages) {
		const stagePath = path.join(resolvedSourceRunDir, stageName);
		if (!(await pathExists(stagePath))) {
			throw new Error(`Required stage directory not found: ${stagePath}`);
		}
	}

	await mkdir(resolvedRunDir, { recursive: true });
	for (const stageName of stages) {
		await cp(
			path.join(resolvedSourceRunDir, stageName),
			path.join(resolvedRunDir, stageName),
			{
				recursive: true,
				force: false,
				errorOnExist: true,
			},
		);
	}
}

async function main() {
	const options = parseCliArgs(process.argv.slice(2));
	const showHelp = Boolean(options.help || options.h);
	if (showHelp) {
		printUsage();
		return;
	}

	const projectsDir = path.resolve(
		optionAsString(options, "projects-dir") || "projects",
	);
	const noPrompt = Boolean(options["no-prompt"] || options["non-interactive"]);
	const interactive = !noPrompt && process.stdin.isTTY && process.stdout.isTTY;

	let runDir = optionAsString(options, "run-dir");
	let sourceRunDir = optionAsString(options, "source-run-dir");
	let projectId = optionAsString(options, "project-id");
	let runId = optionAsString(options, "run-id");
	const defaultProjectId = optionAsString(options, "default-project-id");
	const defaultSourceRunDir = optionAsString(options, "default-source-run-dir");
	const defaultRunId = optionAsString(options, "default-run-id");

	if (runDir && runId) {
		throw new Error("Specify either --run-dir or --run-id, not both.");
	}

	if (!projectId && sourceRunDir) {
		projectId = deriveProjectIdFromRunDir(sourceRunDir);
	}
	if (!projectId && runDir) {
		projectId = deriveProjectIdFromRunDir(runDir);
	}

	const rl = interactive ? createInterface({ input, output }) : null;

	try {
		if (!projectId) {
			const inferred = defaultProjectId || (await inferDefaultProjectId(projectsDir));
			if (interactive && rl) {
				projectId = await askWithDefault(rl, "project-id", inferred);
			} else {
				projectId = inferred;
			}
		}
		if (!projectId) {
			throw new Error(
				"Could not determine project-id. Pass --project-id or run in TTY interactive mode.",
			);
		}

		if (!sourceRunDir) {
			const latestRunDir = await findLatestRunDir(
				path.join(projectsDir, projectId),
			);
			const inferredSourceRunDir = defaultSourceRunDir
				? path.resolve(defaultSourceRunDir)
				: latestRunDir || undefined;
			if (interactive && rl) {
				const promptDefaultSourceRun = inferredSourceRunDir
					? path.relative(process.cwd(), inferredSourceRunDir)
					: undefined;
				const answer = await askWithDefault(
					rl,
					"source-run-dir",
					promptDefaultSourceRun,
				);
				sourceRunDir = answer ? path.resolve(answer) : undefined;
			} else {
				sourceRunDir = inferredSourceRunDir;
			}
		} else {
			sourceRunDir = path.resolve(sourceRunDir);
		}
		if (!sourceRunDir) {
			throw new Error("Could not determine source run. Pass --source-run-dir.");
		}

		if (!runDir) {
			if (!runId) {
				const selectedDefaultRunId = defaultRunId || makeRunIdNow();
				if (interactive && rl) {
					runId = await askWithDefault(rl, "run-id", selectedDefaultRunId);
				} else {
					runId = selectedDefaultRunId;
				}
			}
			const finalRunId = validateRunId(runId);
			runDir = path.join(projectsDir, projectId, finalRunId);
		} else {
			runDir = path.resolve(runDir);
		}

		if (path.resolve(sourceRunDir) === path.resolve(runDir)) {
			throw new Error(
				"source-run-dir and run-dir are the same path. Choose a different target.",
			);
		}

		await cloneRunDirectories({
			sourceRunDir,
			runDir,
		});

		console.log("Run prepared");
		console.log(`- project: ${projectId}`);
		console.log(
			`- source: ${path.relative(process.cwd(), path.resolve(sourceRunDir))}`,
		);
		console.log(`- target: ${path.relative(process.cwd(), runDir)}`);
	} finally {
		await rl?.close();
	}
}

if (import.meta.main) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
