#!/usr/bin/env bun
import path from "node:path";
import { runStage4 } from "../pipeline/stage4_voicevox_text.ts";
import { runStage5 } from "../pipeline/stage5_voicevox_import.ts";

type CliOptions = Record<string, string | boolean>;

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

function ensureOption(options: CliOptions, key: string, command: string): string {
  const value = options[key];
  if (!value || value === true) {
    throw new Error(`Missing required option --${key} for ${command}`);
  }
  return String(value);
}

function printUsage() {
  console.log(`Usage:
  bun src/cli/main.ts stage4 --script <stage3/E##_script.md> --out-dir <projects/.../run-...> [--episode-id E##] [--project-id <id>] [--run-id <run-YYYYMMDD-HHMM>]
  bun src/cli/main.ts stage5 --stage4-json <stage4/E##_voicevox_text.json> --out-dir <projects/.../run-...> [--profile configs/voicevox/default_profile.json|default_profile.example.json] [--engine-id <id>] [--speaker-id <id>] [--style-id <num>] [--app-version <version>]
  bun src/cli/main.ts pipeline --script <stage3/E##_script.md> --out-dir <projects/.../run-...> [--run-id <run-YYYYMMDD-HHMM>] [stage4/stage5 options]
`);
}

async function main() {
  const command = process.argv[2] ?? "";
  const options = parseArgs(process.argv.slice(3));

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "stage4") {
    const result = await runStage4({
      scriptPath: ensureOption(options, "script", command),
      outDir: ensureOption(options, "out-dir", command),
      projectId: options["project-id"] ? String(options["project-id"]) : undefined,
      runId: options["run-id"] ? String(options["run-id"]) : undefined,
      episodeId: options["episode-id"] ? String(options["episode-id"]) : undefined
    });

    console.log(
      `Stage4 done: episode=${result.episodeId}, utterances=${result.utteranceCount}, dict=${result.dictionaryCount}`
    );
    console.log(`- ${path.relative(process.cwd(), result.stage4JsonPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.stage4TxtPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.dictCsvPath)}`);
    return;
  }

  if (command === "stage5") {
    const result = await runStage5({
      stage4JsonPath: ensureOption(options, "stage4-json", command),
      outDir: ensureOption(options, "out-dir", command),
      profilePath: options.profile ? String(options.profile) : undefined,
      engineId: options["engine-id"] ? String(options["engine-id"]) : undefined,
      speakerId: options["speaker-id"] ? String(options["speaker-id"]) : undefined,
      styleId: options["style-id"] ? Number(options["style-id"]) : undefined,
      appVersion: options["app-version"] ? String(options["app-version"]) : undefined
    });

    console.log(`Stage5 done: episode=${result.episodeId}, audioItems=${result.audioItemCount}`);
    console.log(`- ${path.relative(process.cwd(), result.importJsonPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.vvprojPath)}`);
    return;
  }

  if (command === "pipeline") {
    const outDir = ensureOption(options, "out-dir", command);
    const stage4Result = await runStage4({
      scriptPath: ensureOption(options, "script", command),
      outDir,
      projectId: options["project-id"] ? String(options["project-id"]) : undefined,
      runId: options["run-id"] ? String(options["run-id"]) : undefined,
      episodeId: options["episode-id"] ? String(options["episode-id"]) : undefined
    });

    const stage5Result = await runStage5({
      stage4JsonPath: stage4Result.stage4JsonPath,
      outDir,
      profilePath: options.profile ? String(options.profile) : undefined,
      engineId: options["engine-id"] ? String(options["engine-id"]) : undefined,
      speakerId: options["speaker-id"] ? String(options["speaker-id"]) : undefined,
      styleId: options["style-id"] ? Number(options["style-id"]) : undefined,
      appVersion: options["app-version"] ? String(options["app-version"]) : undefined
    });

    console.log(`Pipeline done: episode=${stage5Result.episodeId}`);
    console.log(
      `- stage4: ${path.relative(process.cwd(), stage4Result.stage4JsonPath)}, ${path.relative(process.cwd(), stage4Result.stage4TxtPath)}, ${path.relative(process.cwd(), stage4Result.dictCsvPath)}`
    );
    console.log(
      `- stage5: ${path.relative(process.cwd(), stage5Result.importJsonPath)}, ${path.relative(process.cwd(), stage5Result.vvprojPath)}`
    );
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
