#!/usr/bin/env bun
import path from "node:path";
import { runStage4 } from "../pipeline/stage4_voicevox_text.ts";
import { runStage5 } from "../pipeline/stage5_voicevox_import.ts";
import { validateStage123Run } from "../quality/stage123_run_validator.ts";
import { ensureOption, optionAsString, parseCliArgs } from "../shared/cli_args.ts";

type CommandName = "build-text" | "build-project" | "build-all" | "check-run";

function printUsage(command?: string) {
  if (command === "build-text") {
    console.log(
      "Usage:\n  bun src/cli/main.ts build-text --script <stage3/E##_script.md> [--run-dir <projects/.../run-...>] [--episode-id E##] [--project-id <id>] [--run-id <run-YYYYMMDD-HHMM>]"
    );
    return;
  }
  if (command === "build-project") {
    console.log(
      "Usage:\n  bun src/cli/main.ts build-project --stage4-json <stage4/E##_voicevox_text.json> [--run-dir <projects/.../run-...>] [--profile configs/voicevox/default_profile.json|default_profile.example.json] [--engine-id <id>] [--speaker-id <id>] [--style-id <num>] [--app-version <version>] [--prefill-query none|minimal]"
    );
    return;
  }
  if (command === "build-all") {
    console.log(
      "Usage:\n  bun src/cli/main.ts build-all --script <stage3/E##_script.md> [--run-dir <projects/.../run-...>] [--run-id <run-YYYYMMDD-HHMM>] [build-text/build-project options]"
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
  bun src/cli/main.ts build-text --script <stage3/E##_script.md> [--run-dir <projects/.../run-...>] [--episode-id E##] [--project-id <id>] [--run-id <run-YYYYMMDD-HHMM>]
  bun src/cli/main.ts build-project --stage4-json <stage4/E##_voicevox_text.json> [--run-dir <projects/.../run-...>] [--profile configs/voicevox/default_profile.json|default_profile.example.json] [--engine-id <id>] [--speaker-id <id>] [--style-id <num>] [--app-version <version>] [--prefill-query none|minimal]
  bun src/cli/main.ts build-all --script <stage3/E##_script.md> [--run-dir <projects/.../run-...>] [--run-id <run-YYYYMMDD-HHMM>] [build-text/build-project options]
  bun src/cli/main.ts check-run --run-dir <projects/.../run-YYYYMMDD-HHMM>
`);
}

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

  if (command === "build-text") {
    const result = await runStage4({
      scriptPath: ensureOption(options, "script", command),
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
    return;
  }

  if (command === "build-project") {
    const styleId = optionAsString(options, "style-id");
    const result = await runStage5({
      stage4JsonPath: ensureOption(options, "stage4-json", command),
      runDir: optionAsString(options, "run-dir"),
      profilePath: optionAsString(options, "profile"),
      engineId: optionAsString(options, "engine-id"),
      speakerId: optionAsString(options, "speaker-id"),
      styleId: styleId ? Number(styleId) : undefined,
      appVersion: optionAsString(options, "app-version"),
      prefillQuery: optionAsString(options, "prefill-query")
    });

    console.log(`Build project done: episode=${result.episodeId}, audioItems=${result.audioItemCount}`);
    console.log(`- ${path.relative(process.cwd(), result.importJsonPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.vvprojPath)}`);
    return;
  }

  if (command === "build-all") {
    const runDir = optionAsString(options, "run-dir");
    const styleId = optionAsString(options, "style-id");
    const stage4Result = await runStage4({
      scriptPath: ensureOption(options, "script", command),
      runDir,
      projectId: optionAsString(options, "project-id"),
      runId: optionAsString(options, "run-id"),
      episodeId: optionAsString(options, "episode-id")
    });

    const stage5Result = await runStage5({
      stage4JsonPath: stage4Result.stage4JsonPath,
      runDir,
      profilePath: optionAsString(options, "profile"),
      engineId: optionAsString(options, "engine-id"),
      speakerId: optionAsString(options, "speaker-id"),
      styleId: styleId ? Number(styleId) : undefined,
      appVersion: optionAsString(options, "app-version"),
      prefillQuery: optionAsString(options, "prefill-query")
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
