#!/usr/bin/env bun
import path from "node:path";
import { runStage4 } from "../pipeline/stage4_voicevox_text.ts";
import { runStage5 } from "../pipeline/stage5_voicevox_import.ts";
import { validateStage123Run } from "../quality/stage123_run_validator.ts";

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
    throw new Error(`Missing required option --${key} for ${command}. See --help.`);
  }
  return String(value);
}

type CommandName = "build-text" | "build-project" | "build-all" | "check-run";

function printUsage(command?: string) {
  if (command === "build-text") {
    console.log(
      "Usage:\n  bun src/cli/main.ts build-text --script <stage3/E##_script.md> --run-dir <projects/.../run-...> [--episode-id E##] [--project-id <id>] [--run-id <run-YYYYMMDD-HHMM>]"
    );
    return;
  }
  if (command === "build-project") {
    console.log(
      "Usage:\n  bun src/cli/main.ts build-project --stage4-json <stage4/E##_voicevox_text.json> --run-dir <projects/.../run-...> [--profile configs/voicevox/default_profile.json|default_profile.example.json] [--engine-id <id>] [--speaker-id <id>] [--style-id <num>] [--app-version <version>] [--prefill-query none|minimal]"
    );
    return;
  }
  if (command === "build-all") {
    console.log(
      "Usage:\n  bun src/cli/main.ts build-all --script <stage3/E##_script.md> --run-dir <projects/.../run-...> [--run-id <run-YYYYMMDD-HHMM>] [build-text/build-project options]"
    );
    return;
  }
  if (command === "check-run") {
    console.log(
      "Usage:\n  bun src/cli/main.ts check-run --run-dir <projects/.../run-YYYYMMDD-HHMM>"
    );
    return;
  }

  console.log(`Usage:
  bun src/cli/main.ts build-text --script <stage3/E##_script.md> --run-dir <projects/.../run-...> [--episode-id E##] [--project-id <id>] [--run-id <run-YYYYMMDD-HHMM>]
  bun src/cli/main.ts build-project --stage4-json <stage4/E##_voicevox_text.json> --run-dir <projects/.../run-...> [--profile configs/voicevox/default_profile.json|default_profile.example.json] [--engine-id <id>] [--speaker-id <id>] [--style-id <num>] [--app-version <version>] [--prefill-query none|minimal]
  bun src/cli/main.ts build-all --script <stage3/E##_script.md> --run-dir <projects/.../run-...> [--run-id <run-YYYYMMDD-HHMM>] [build-text/build-project options]
  bun src/cli/main.ts check-run --run-dir <projects/.../run-YYYYMMDD-HHMM>
`);
}

async function main() {
  const command = process.argv[2] ?? "";
  const options = parseArgs(process.argv.slice(3));

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }
  if (options.help || options.h) {
    printUsage(command);
    return;
  }

  if (command === "build-text") {
    const result = await runStage4({
      scriptPath: ensureOption(options, "script", command),
      runDir: ensureOption(options, "run-dir", command),
      projectId: options["project-id"] ? String(options["project-id"]) : undefined,
      runId: options["run-id"] ? String(options["run-id"]) : undefined,
      episodeId: options["episode-id"] ? String(options["episode-id"]) : undefined
    });

    console.log(
      `Build text done: episode=${result.episodeId}, utterances=${result.utteranceCount}, dict=${result.dictionaryCount}`
    );
    console.log(`- ${path.relative(process.cwd(), result.stage4JsonPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.stage4TxtPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.dictCsvPath)}`);
    return;
  }

  if (command === "build-project") {
    const result = await runStage5({
      stage4JsonPath: ensureOption(options, "stage4-json", command),
      runDir: ensureOption(options, "run-dir", command),
      profilePath: options.profile ? String(options.profile) : undefined,
      engineId: options["engine-id"] ? String(options["engine-id"]) : undefined,
      speakerId: options["speaker-id"] ? String(options["speaker-id"]) : undefined,
      styleId: options["style-id"] ? Number(options["style-id"]) : undefined,
      appVersion: options["app-version"] ? String(options["app-version"]) : undefined,
      prefillQuery: options["prefill-query"] ? String(options["prefill-query"]) : undefined
    });

    console.log(`Build project done: episode=${result.episodeId}, audioItems=${result.audioItemCount}`);
    console.log(`- ${path.relative(process.cwd(), result.importJsonPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.vvprojPath)}`);
    return;
  }

  if (command === "build-all") {
    const runDir = ensureOption(options, "run-dir", command);
    const stage4Result = await runStage4({
      scriptPath: ensureOption(options, "script", command),
      runDir,
      projectId: options["project-id"] ? String(options["project-id"]) : undefined,
      runId: options["run-id"] ? String(options["run-id"]) : undefined,
      episodeId: options["episode-id"] ? String(options["episode-id"]) : undefined
    });

    const stage5Result = await runStage5({
      stage4JsonPath: stage4Result.stage4JsonPath,
      runDir,
      profilePath: options.profile ? String(options.profile) : undefined,
      engineId: options["engine-id"] ? String(options["engine-id"]) : undefined,
      speakerId: options["speaker-id"] ? String(options["speaker-id"]) : undefined,
      styleId: options["style-id"] ? Number(options["style-id"]) : undefined,
      appVersion: options["app-version"] ? String(options["app-version"]) : undefined,
      prefillQuery: options["prefill-query"] ? String(options["prefill-query"]) : undefined
    });

    console.log(`Build all done: episode=${stage5Result.episodeId}`);
    console.log(
      `- stage4: ${path.relative(process.cwd(), stage4Result.stage4JsonPath)}, ${path.relative(process.cwd(), stage4Result.stage4TxtPath)}, ${path.relative(process.cwd(), stage4Result.dictCsvPath)}`
    );
    console.log(
      `- stage5: ${path.relative(process.cwd(), stage5Result.importJsonPath)}, ${path.relative(process.cwd(), stage5Result.vvprojPath)}`
    );
    return;
  }

  if (command === "check-run") {
    const result = await validateStage123Run({
      runDir: ensureOption(options, "run-dir", command)
    });

    console.log(
      `Check run done: episodes=${result.validatedEpisodeIds.length}, stage2=${result.stage2EpisodeCount}, stage3=${result.stage3EpisodeCount}`
    );
    console.log(`- run: ${path.relative(process.cwd(), result.runDir)}`);
    return;
  }

  const knownCommands = new Set<CommandName>(["build-text", "build-project", "build-all", "check-run"]);
  if (!knownCommands.has(command as CommandName)) {
    printUsage();
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
