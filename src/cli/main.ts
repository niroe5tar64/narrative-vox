#!/usr/bin/env bun
import path from "node:path";
import { buildText } from "../pipeline/build_text.ts";
import { buildProject } from "../pipeline/build_project.ts";
import { checkRun } from "../quality/check_run.ts";
import { ensureOption, optionAsNumber, optionAsString, parseCliArgs } from "../shared/cli_args.ts";
import type { CliOptions } from "../shared/cli_args.ts";

type CommandName = "build-text" | "build-project" | "build-all" | "check-run";
type CommandHandler = (options: CliOptions) => Promise<void>;

const usageByCommand: Record<CommandName, string> = {
  "build-text":
    "Usage:\n  bun src/cli/main.ts build-text --script <stage3/E##_script.md> [--run-dir <projects/.../run-...>] [--episode-id E##] [--project-id <id>] [--run-id <run-YYYYMMDD-HHMM>]",
  "build-project":
    "Usage:\n  bun src/cli/main.ts build-project --stage4-json <stage4/E##_voicevox_text.json> [--run-dir <projects/.../run-...>] [--profile configs/voicevox/default_profile.json|default_profile.example.json] [--engine-id <id>] [--speaker-id <id>] [--style-id <num>] [--app-version <version>] [--prefill-query none|minimal]",
  "build-all":
    "Usage:\n  bun src/cli/main.ts build-all --script <stage3/E##_script.md> [--run-dir <projects/.../run-...>] [--run-id <run-YYYYMMDD-HHMM>] [build-text/build-project options]",
  "check-run":
    "Usage:\n  bun src/cli/main.ts check-run --run-dir <projects/.../run-YYYYMMDD-HHMM>"
};

function printUsage(command?: string) {
  if (command && command in usageByCommand) {
    console.log(usageByCommand[command as CommandName]);
    return;
  }

  console.log(`Usage:
  ${usageByCommand["build-text"].replace("Usage:\n  ", "")}
  ${usageByCommand["build-project"].replace("Usage:\n  ", "")}
  ${usageByCommand["build-all"].replace("Usage:\n  ", "")}
  ${usageByCommand["check-run"].replace("Usage:\n  ", "")}
`);
}

function buildStage5Options(options: CliOptions) {
  return {
    runDir: optionAsString(options, "run-dir"),
    profilePath: optionAsString(options, "profile"),
    engineId: optionAsString(options, "engine-id"),
    speakerId: optionAsString(options, "speaker-id"),
    styleId: optionAsNumber(options, "style-id"),
    appVersion: optionAsString(options, "app-version"),
    prefillQuery: optionAsString(options, "prefill-query")
  };
}

const commandHandlers: Record<CommandName, CommandHandler> = {
  "build-text": async (options) => {
    const result = await buildText({
      scriptPath: ensureOption(options, "script", "build-text"),
      runDir: optionAsString(options, "run-dir"),
      projectId: optionAsString(options, "project-id"),
      runId: optionAsString(options, "run-id"),
      episodeId: optionAsString(options, "episode-id")
    });

    console.log(
      `Build text done: episode=${result.episodeId}, utterances=${result.utteranceCount}, dict=${result.dictionaryCount}`
    );
    console.log(`- ${path.relative(process.cwd(), result.stage4JsonPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.stage4TxtPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.dictCsvPath)}`);
  },
  "build-project": async (options) => {
    const result = await buildProject({
      stage4JsonPath: ensureOption(options, "stage4-json", "build-project"),
      ...buildStage5Options(options)
    });

    console.log(`Build project done: episode=${result.episodeId}, audioItems=${result.audioItemCount}`);
    console.log(`- ${path.relative(process.cwd(), result.importJsonPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.vvprojPath)}`);
  },
  "build-all": async (options) => {
    const runDir = optionAsString(options, "run-dir");
    const stage4Result = await buildText({
      scriptPath: ensureOption(options, "script", "build-all"),
      runDir,
      projectId: optionAsString(options, "project-id"),
      runId: optionAsString(options, "run-id"),
      episodeId: optionAsString(options, "episode-id")
    });

    const result = await buildProject({
      stage4JsonPath: stage4Result.stage4JsonPath,
      ...buildStage5Options(options),
      runDir
    });

    console.log(`Build all done: episode=${result.episodeId}`);
    console.log(
      `- stage4: ${path.relative(process.cwd(), stage4Result.stage4JsonPath)}, ${path.relative(process.cwd(), stage4Result.stage4TxtPath)}, ${path.relative(process.cwd(), stage4Result.dictCsvPath)}`
    );
    console.log(
      `- stage5: ${path.relative(process.cwd(), result.importJsonPath)}, ${path.relative(process.cwd(), result.vvprojPath)}`
    );
  },
  "check-run": async (options) => {
    const result = await checkRun({
      runDir: ensureOption(options, "run-dir", "check-run")
    });

    console.log(
      `Check run done: episodes=${result.validatedEpisodeIds.length}, stage2=${result.stage2EpisodeCount}, stage3=${result.stage3EpisodeCount}`
    );
    console.log(`- run: ${path.relative(process.cwd(), result.runDir)}`);
  }
};

async function main() {
  const command = process.argv[2] ?? "";
  const options = parseCliArgs(process.argv.slice(3));

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }
  if (options.help || options.h) {
    printUsage(command);
    return;
  }

  const handler = commandHandlers[command as CommandName];
  if (!handler) {
    printUsage();
    throw new Error(`Unknown command: ${command}`);
  }
  await handler(options);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
