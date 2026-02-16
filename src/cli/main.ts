#!/usr/bin/env bun
import path from "node:path";
import { buildText } from "../pipeline/build_text.ts";
import { buildProject } from "../pipeline/build_project.ts";
import { buildAudio } from "../pipeline/build_audio.ts";
import { runPrepareRun } from "./prepare_run.ts";
import { checkRun } from "../quality/check_run.ts";
import { renderPrompt } from "./render_prompt.ts";
import { ensureOption, optionAsNumber, optionAsString, parseCliArgs } from "../shared/cli_args.ts";
import type { CliOptions } from "../shared/cli_args.ts";

type CommandName = "build-text" | "build-project" | "build-audio" | "build-all" | "check-run" | "prepare-run" | "render-prompt";
type CommandHandler = (options: CliOptions) => Promise<void>;

const usageByCommand: Record<CommandName, string> = {
  "build-text":
    "Usage:\n  bun src/cli/main.ts build-text --script <script/E##_script.md> [--build-text-config <configs/voicevox/build_text_config.json>] [--reading-dictionary <configs/voicevox/reading_dictionary.json>] [--run-dir <projects/.../run-...>] [--episode-id E##] [--project-id <id>] [--run-id <run-YYYYMMDD-HHMM>]",
  "build-project":
    "Usage:\n  bun src/cli/main.ts build-project --voicevox-text-json <voicevox_text/E##_voicevox_text.json> [--run-dir <projects/.../run-...>] [--profile configs/voicevox/default_profile.json|default_profile.example.json] [--character-map configs/voicevox/default_character_map.json] [--character-key <key>] [--engine-id <id>] [--speaker-id <id>] [--style-id <num>] [--app-version <version>] [--voicevox-url <http://127.0.0.1:50021>]",
  "build-audio":
    "Usage:\n  bun src/cli/main.ts build-audio --vvproj <voicevox_project/E##.vvproj> [--run-dir <projects/.../run-...>] [--voicevox-url <http://127.0.0.1:50021>] [--compressed-format mp3|m4a|ogg|none] [--compressed-bitrate-kbps <num>] [--ffmpeg-path <path>]",
  "build-all":
    "Usage:\n  bun src/cli/main.ts build-all --script <script/E##_script.md> [--build-text-config <configs/voicevox/build_text_config.json>] [--run-dir <projects/.../run-...>] [--run-id <run-YYYYMMDD-HHMM>] [build-text/build-project options]",
  "check-run":
    "Usage:\n  bun src/cli/main.ts check-run --run-dir <projects/.../run-YYYYMMDD-HHMM>",
  "prepare-run":
    "Usage:\n  bun src/cli/main.ts prepare-run [--run-dir <projects/.../run-YYYYMMDD-HHMM>] [--source-run-dir <projects/.../run-YYYYMMDD-HHMM>] [--project-id <id>] [--run-id <run-YYYYMMDD-HHMM>] [--projects-dir <projects>] [--default-project-id <id>] [--default-source-run-dir <projects/.../run-YYYYMMDD-HHMM>] [--default-run-id <run-YYYYMMDD-HHMM>] [--no-prompt]",
  "render-prompt":
    "Usage:\n  bun src/cli/main.ts render-prompt --genre <genre> --step <blueprint|variables> --project-config <configs/projects/ID.json> [--episode-id E##]"
};

function printUsage(command?: string) {
  if (command && command in usageByCommand) {
    console.log(usageByCommand[command as CommandName]);
    return;
  }

  console.log(`Usage:
  ${usageByCommand["build-text"].replace("Usage:\n  ", "")}
  ${usageByCommand["build-project"].replace("Usage:\n  ", "")}
  ${usageByCommand["build-audio"].replace("Usage:\n  ", "")}
  ${usageByCommand["build-all"].replace("Usage:\n  ", "")}
  ${usageByCommand["check-run"].replace("Usage:\n  ", "")}
  ${usageByCommand["prepare-run"].replace("Usage:\n  ", "")}
  ${usageByCommand["render-prompt"].replace("Usage:\n  ", "")}
`);
}

function buildProjectOptions(options: CliOptions) {
  return {
    runDir: optionAsString(options, "run-dir"),
    profilePath: optionAsString(options, "profile"),
    characterMapPath: optionAsString(options, "character-map"),
    characterKey: optionAsString(options, "character-key"),
    engineId: optionAsString(options, "engine-id"),
    speakerId: optionAsString(options, "speaker-id"),
    styleId: optionAsNumber(options, "style-id"),
    appVersion: optionAsString(options, "app-version"),
    voicevoxApiUrl: optionAsString(options, "voicevox-url")
  };
}

const commandHandlers: Record<CommandName, CommandHandler> = {
  "build-text": async (options) => {
    const result = await buildText({
      scriptPath: ensureOption(options, "script", "build-text"),
      runDir: optionAsString(options, "run-dir"),
      projectId: optionAsString(options, "project-id"),
      runId: optionAsString(options, "run-id"),
      episodeId: optionAsString(options, "episode-id"),
      buildTextConfigPath: optionAsString(options, "build-text-config"),
      readingDictionaryPath: optionAsString(options, "reading-dictionary")
    });

    console.log(
      `Build text done: episode=${result.episodeId}, utterances=${result.utteranceCount}, dict=${result.dictionaryCount}`
    );
    console.log(`- ${path.relative(process.cwd(), result.voicevoxTextJsonPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.voicevoxTextPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.dictionaryCsvPath)}`);
  },
  "build-project": async (options) => {
    const result = await buildProject({
      voicevoxTextJsonPath: ensureOption(options, "voicevox-text-json", "build-project"),
      ...buildProjectOptions(options)
    });

    console.log(`Build project done: episode=${result.episodeId}, audioItems=${result.audioItemCount}`);
    console.log(`- ${path.relative(process.cwd(), result.importJsonPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.vvprojPath)}`);
  },
  "build-audio": async (options) => {
    const result = await buildAudio({
      stage5VvprojPath: ensureOption(options, "vvproj", "build-audio"),
      runDir: optionAsString(options, "run-dir"),
      voicevoxApiUrl: optionAsString(options, "voicevox-url"),
      compressedAudioFormat: optionAsString(options, "compressed-format"),
      compressedAudioBitrateKbps: optionAsNumber(options, "compressed-bitrate-kbps"),
      ffmpegPath: optionAsString(options, "ffmpeg-path")
    });

    console.log(
      `Build audio done: episode=${result.episodeId}, utterances=${result.utteranceCount}, succeeded=${result.successCount}, failed=${result.failureCount}`
    );
    if (result.mergedWavPath) {
      console.log(`- ${path.relative(process.cwd(), result.mergedWavPath)}`);
    }
    if (result.compressedAudioPath) {
      console.log(`- ${path.relative(process.cwd(), result.compressedAudioPath)}`);
    }
    console.log(`- ${path.relative(process.cwd(), result.audioDir)}`);
    console.log(`- ${path.relative(process.cwd(), result.manifestPath)}`);

    let hasError = false;
    if (result.failureCount > 0) {
      hasError = true;
      console.log("Failed utterances:");
      for (const failure of result.failures) {
        console.log(
          `- ${failure.audioKey} [${failure.stage}] attempts=${failure.attempts}${
            typeof failure.statusCode === "number" ? ` status=${failure.statusCode}` : ""
          } ${failure.message}`
        );
      }
    }

    if (result.compression.status === "failed") {
      hasError = true;
      console.log(
        `Compressed audio conversion failed (${result.compression.format}): ${result.compression.error ?? "unknown error"}`
      );
    }

    if (hasError) {
      throw new Error(
        `build-audio failed (utterance failures=${result.failureCount}, compression=${result.compression.status}).`
      );
    }
  },
  "build-all": async (options) => {
    const runDir = optionAsString(options, "run-dir");
    const buildTextResult = await buildText({
      scriptPath: ensureOption(options, "script", "build-all"),
      runDir,
      projectId: optionAsString(options, "project-id"),
      runId: optionAsString(options, "run-id"),
      episodeId: optionAsString(options, "episode-id"),
      buildTextConfigPath: optionAsString(options, "build-text-config"),
      readingDictionaryPath: optionAsString(options, "reading-dictionary")
    });

    const result = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      ...buildProjectOptions(options),
      runDir
    });

    console.log(`Build all done: episode=${result.episodeId}`);
    console.log(
      `- build-text: ${path.relative(process.cwd(), buildTextResult.voicevoxTextJsonPath)}, ${path.relative(process.cwd(), buildTextResult.voicevoxTextPath)}, ${path.relative(process.cwd(), buildTextResult.dictionaryCsvPath)}`
    );
    console.log(
      `- build-project: ${path.relative(process.cwd(), result.importJsonPath)}, ${path.relative(process.cwd(), result.vvprojPath)}`
    );
  },
  "check-run": async (options) => {
    const result = await checkRun({
      runDir: ensureOption(options, "run-dir", "check-run")
    });

    console.log(
      `Check run done: episodes=${result.validatedEpisodeIds.length}, variables=${result.variablesEpisodeCount}, script=${result.scriptEpisodeCount}`
    );
    console.log(`- run: ${path.relative(process.cwd(), result.runDir)}`);
  },
  "prepare-run": async (options) => {
    await runPrepareRun(options);
  },
  "render-prompt": async (options) => {
    const result = await renderPrompt({
      genre: ensureOption(options, "genre", "render-prompt"),
      step: ensureOption(options, "step", "render-prompt"),
      projectConfigPath: ensureOption(options, "project-config", "render-prompt"),
      episodeId: optionAsString(options, "episode-id"),
    });

    process.stdout.write(result.resolvedPrompt);
  },
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
