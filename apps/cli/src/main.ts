#!/usr/bin/env bun
import path from "node:path";
import { buildAudio } from "@narrative-vox/application/build-audio.ts";
import { buildProject } from "@narrative-vox/application/build-project.ts";
import { buildText } from "@narrative-vox/application/build-text.ts";
import { syncUserDict } from "@narrative-vox/application/dict-sync/index.ts";
import { patchVoicevoxText } from "@narrative-vox/application/patch-voicevox-text.ts";
import { resolveVoicevoxApiUrl } from "@narrative-vox/infrastructure/voicevox-engine.ts";
import { validateBuildPrerequisites } from "@narrative-vox/quality/build-prerequisites.ts";
import { checkRun } from "@narrative-vox/quality/check-run.ts";
import type { CliOptions } from "./cli-args.ts";
import {
  ensureOption,
  optionAsNumber,
  optionAsString,
  parseCliArgs,
} from "./cli-args.ts";
import {
  genBlueprint,
  genEpisodePack,
  genScript,
  genSourceIndex,
  updateSeriesContext,
} from "@narrative-vox/authoring";
import { renderPrompt } from "./render-prompt.ts";

type CommandName =
  | "gen-source-index"
  | "gen-blueprint"
  | "gen-episode-pack"
  | "gen-script"
  | "update-series-context"
  | "build-text"
  | "patch-voicevox-text"
  | "build-project"
  | "build-audio"
  | "build-all"
  | "check-run"
  | "render-prompt"
  | "dict-sync";
type CommandHandler = (options: CliOptions) => Promise<void>;

const usageByCommand: Record<CommandName, string> = {
  "gen-source-index":
    "Usage:\n  bun apps/cli/src/main.ts gen-source-index --project-id <id> [--run-dir <data/projects/.../run-...>]",
  "gen-blueprint":
    "Usage:\n  bun apps/cli/src/main.ts gen-blueprint --project-id <id>",
  "gen-episode-pack":
    "Usage:\n  bun apps/cli/src/main.ts gen-episode-pack --project-id <id> --episode-id <E01> --run-dir <data/projects/.../run-...>",
  "gen-script":
    "Usage:\n  bun apps/cli/src/main.ts gen-script --project-id <id> --episode-id <E01> --run-dir <data/projects/.../run-...>",
  "update-series-context":
    "Usage:\n  bun apps/cli/src/main.ts update-series-context --project-id <id> --episode-id <E01> --run-dir <data/projects/.../run-...>",
  "build-text":
    "Usage:\n  bun apps/cli/src/main.ts build-text --script <script/E##_script.md> [--build-text-config <configs/voice/voicevox/build-text-config.json>] [--run-dir <data/projects/.../run-...>] [--episode-id E##] [--project-id <id>] [--run-id <run-YYYYMMDD-HHMM>]",
  "patch-voicevox-text":
    "Usage:\n  bun apps/cli/src/main.ts patch-voicevox-text --voicevox-text-json <voicevox_text/E##_voicevox_text.json> [--patch-config <configs/voice/voicevox/patch-config.json>] [--run-dir <data/projects/.../run-...>]",
  "build-project":
    "Usage:\n  bun apps/cli/src/main.ts build-project --voicevox-text-json <voicevox_text/E##_voicevox_text.json> [--use-patched] [--run-dir <data/projects/.../run-...>] [--synthesis-defaults configs/voice/voicevox/synthesis-defaults.json|synthesis-defaults.example.json] [--character-map configs/voice/voicevox/default_character_map.json] [--character-key <key>] [--engine-id <id>] [--speaker-id <id>] [--style-id <num>] [--emotion <key>] [--app-version <version>] [--voicevox-url <http://127.0.0.1:50021>] [--speed-preset slow|normal|fast] [--speed-profiles <configs/voice/voicevox/speed-profiles.json>] [--intonation-scale <number>]",
  "build-audio":
    "Usage:\n  bun apps/cli/src/main.ts build-audio --vvproj <voicevox_project/E##.vvproj> [--run-dir <data/projects/.../run-...>] [--voicevox-url <http://127.0.0.1:50021>] [--compressed-format mp3|m4a|ogg|none] [--compressed-bitrate-kbps <num>] [--ffmpeg-path <path>]",
  "build-all":
    "Usage:\n  bun apps/cli/src/main.ts build-all --script <script/E##_script.md> [--patch] [--patch-config <configs/voice/voicevox/patch-config.json>] [--build-text-config <configs/voice/voicevox/build-text-config.json>] [--run-dir <data/projects/.../run-...>] [--run-id <run-YYYYMMDD-HHMM>] [--dict <configs/voice/voicevox/user-dict.json>] [build-text/build-project options]",
  "check-run":
    "Usage:\n  bun apps/cli/src/main.ts check-run --run-dir <data/projects/.../run-YYYYMMDD-HHMM> [--synthesis-defaults configs/voice/voicevox/synthesis-defaults.json|synthesis-defaults.example.json] [--character-map configs/voice/voicevox/default_character_map.json] [--character-key <key>] [--engine-id <id>] [--speaker-id <id>] [--style-id <num>] [--emotion <key>] [--voicevox-url <http://127.0.0.1:50021>] [--speed-preset slow|normal|fast] [--speed-profiles <configs/voice/voicevox/speed-profiles.json>]",
  "render-prompt":
    "Usage:\n  bun apps/cli/src/main.ts render-prompt --genre <genre> --step <blueprint|material> --project-config <configs/pipeline/projects/ID.yaml> [--episode-id E##]",
  "dict-sync":
    "Usage:\n  bun apps/cli/src/main.ts dict-sync [--voicevox-url <http://127.0.0.1:50021>] [--dict <configs/voice/voicevox/user_dict.json>] [--dry-run] [--legacy-sync]",
};

function printUsage(command?: string) {
  if (command && command in usageByCommand) {
    console.log(usageByCommand[command as CommandName]);
    return;
  }

  console.log(`Usage:
  ${usageByCommand["gen-source-index"].replace("Usage:\n  ", "")}
  ${usageByCommand["gen-blueprint"].replace("Usage:\n  ", "")}
  ${usageByCommand["gen-episode-pack"].replace("Usage:\n  ", "")}
  ${usageByCommand["gen-script"].replace("Usage:\n  ", "")}
  ${usageByCommand["update-series-context"].replace("Usage:\n  ", "")}
  ${usageByCommand["build-text"].replace("Usage:\n  ", "")}
  ${usageByCommand["patch-voicevox-text"].replace("Usage:\n  ", "")}
  ${usageByCommand["build-project"].replace("Usage:\n  ", "")}
  ${usageByCommand["build-audio"].replace("Usage:\n  ", "")}
  ${usageByCommand["build-all"].replace("Usage:\n  ", "")}
  ${usageByCommand["check-run"].replace("Usage:\n  ", "")}
  ${usageByCommand["render-prompt"].replace("Usage:\n  ", "")}
  ${usageByCommand["dict-sync"].replace("Usage:\n  ", "")}
`);
}

function insertPatchedStemInPath(filePath: string): string {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const extIndex = base.indexOf(".");
  if (extIndex === -1) {
    return path.join(dir, `${base}.patched`);
  }
  const stem = base.slice(0, extIndex);
  const ext = base.slice(extIndex);
  return path.join(dir, `${stem}.patched${ext}`);
}

function buildProjectOptions(options: CliOptions) {
  return {
    runDir: optionAsString(options, "run-dir"),
    synthesisDefaultsPath: optionAsString(options, "synthesis-defaults"),
    characterMapPath: optionAsString(options, "character-map"),
    characterKey: optionAsString(options, "character-key"),
    engineId: optionAsString(options, "engine-id"),
    speakerId: optionAsString(options, "speaker-id"),
    styleId: optionAsNumber(options, "style-id"),
    emotion: optionAsString(options, "emotion"),
    appVersion: optionAsString(options, "app-version"),
    voicevoxApiUrl: optionAsString(options, "voicevox-url"),
    speedPreset: optionAsString(options, "speed-preset"),
    speedProfilesPath: optionAsString(options, "speed-profiles"),
    intonationScale: optionAsNumber(options, "intonation-scale"),
  };
}

function buildPrerequisiteOptionFields(options: CliOptions) {
  return {
    synthesisDefaultsPath: optionAsString(options, "synthesis-defaults"),
    characterMapPath: optionAsString(options, "character-map"),
    characterKey: optionAsString(options, "character-key"),
    engineId: optionAsString(options, "engine-id"),
    speakerId: optionAsString(options, "speaker-id"),
    styleId: optionAsNumber(options, "style-id"),
    emotion: optionAsString(options, "emotion"),
    voicevoxApiUrl: optionAsString(options, "voicevox-url"),
    speedPreset: optionAsString(options, "speed-preset"),
    speedProfilesPath: optionAsString(options, "speed-profiles"),
  };
}

const commandHandlers: Record<CommandName, CommandHandler> = {
  "gen-source-index": async (options) => {
    await genSourceIndex({
      projectId: ensureOption(options, "project-id", "gen-source-index"),
      runDir: optionAsString(options, "run-dir"),
    });
  },
  "gen-blueprint": async (options) => {
    if (optionAsString(options, "episode-id")) {
      throw new Error(
        "--episode-id is not supported for gen-blueprint. Remove this option.",
      );
    }
    await genBlueprint({
      projectId: ensureOption(options, "project-id", "gen-blueprint"),
    });
  },
  "gen-episode-pack": async (options) => {
    await genEpisodePack({
      projectId: ensureOption(options, "project-id", "gen-episode-pack"),
      episodeId: ensureOption(options, "episode-id", "gen-episode-pack"),
      runDir: ensureOption(options, "run-dir", "gen-episode-pack"),
    });
  },
  "gen-script": async (options) => {
    await genScript({
      projectId: ensureOption(options, "project-id", "gen-script"),
      episodeId: ensureOption(options, "episode-id", "gen-script"),
      runDir: ensureOption(options, "run-dir", "gen-script"),
    });
  },
  "update-series-context": async (options) => {
    await updateSeriesContext({
      projectId: ensureOption(options, "project-id", "update-series-context"),
      episodeId: ensureOption(options, "episode-id", "update-series-context"),
      runDir: ensureOption(options, "run-dir", "update-series-context"),
    });
  },
  "build-text": async (options) => {
    const result = await buildText({
      scriptPath: ensureOption(options, "script", "build-text"),
      runDir: optionAsString(options, "run-dir"),
      projectId: optionAsString(options, "project-id"),
      runId: optionAsString(options, "run-id"),
      episodeId: optionAsString(options, "episode-id"),
      buildTextConfigPath: optionAsString(options, "build-text-config"),
    });

    console.log(
      `Build text done: episode=${result.episodeId}, utterances=${result.utteranceCount}, dict=${result.dictionaryCount}`,
    );
    console.log(
      `- ${path.relative(process.cwd(), result.voicevoxTextJsonPath)}`,
    );
    console.log(`- ${path.relative(process.cwd(), result.voicevoxTextPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.dictionaryCsvPath)}`);
  },
  "patch-voicevox-text": async (options) => {
    const result = await patchVoicevoxText({
      voicevoxTextJsonPath: ensureOption(
        options,
        "voicevox-text-json",
        "patch-voicevox-text",
      ),
      patchConfigPath: optionAsString(options, "patch-config"),
      runDir: optionAsString(options, "run-dir"),
    });
    console.log(
      `Patch done: normalized=${result.normalizedUtteranceCount}, added=${result.addedCandidateCount}, removed=${result.removedCandidateCount}`,
    );
    console.log(`- ${path.relative(process.cwd(), result.patchedJsonPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.patchedCsvPath)}`);
  },
  "build-project": async (options) => {
    const voicevoxTextJsonPath = ensureOption(
      options,
      "voicevox-text-json",
      "build-project",
    );
    const usePatched = Boolean(options["use-patched"]);
    const resolvedJsonPath = usePatched
      ? insertPatchedStemInPath(voicevoxTextJsonPath)
      : voicevoxTextJsonPath;
    const result = await buildProject({
      voicevoxTextJsonPath: resolvedJsonPath,
      ...buildProjectOptions(options),
    });

    console.log(
      `Build project done: episode=${result.episodeId}, audioItems=${result.audioItemCount}`,
    );
    console.log(`- ${path.relative(process.cwd(), result.importJsonPath)}`);
    console.log(`- ${path.relative(process.cwd(), result.vvprojPath)}`);
    console.log(
      `- ${path.relative(process.cwd(), result.projectMetaJsonPath)}`,
    );
  },
  "build-audio": async (options) => {
    const result = await buildAudio({
      stage5VvprojPath: ensureOption(options, "vvproj", "build-audio"),
      runDir: optionAsString(options, "run-dir"),
      voicevoxApiUrl: optionAsString(options, "voicevox-url"),
      compressedAudioFormat: optionAsString(options, "compressed-format"),
      compressedAudioBitrateKbps: optionAsNumber(
        options,
        "compressed-bitrate-kbps",
      ),
      ffmpegPath: optionAsString(options, "ffmpeg-path"),
    });

    console.log(
      `Build audio done: episode=${result.episodeId}, utterances=${result.utteranceCount}, succeeded=${result.successCount}, failed=${result.failureCount}`,
    );
    if (result.mergedWavPath) {
      console.log(`- ${path.relative(process.cwd(), result.mergedWavPath)}`);
    }
    if (result.compressedAudioPath) {
      console.log(
        `- ${path.relative(process.cwd(), result.compressedAudioPath)}`,
      );
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
            typeof failure.statusCode === "number"
              ? ` status=${failure.statusCode}`
              : ""
          } ${failure.message}`,
        );
      }
    }

    if (result.compression.status === "failed") {
      hasError = true;
      console.log(
        `Compressed audio conversion failed (${result.compression.format}): ${result.compression.error ?? "unknown error"}`,
      );
    }

    if (hasError) {
      throw new Error(
        `build-audio failed (utterance failures=${result.failureCount}, compression=${result.compression.status}).`,
      );
    }
  },
  "build-all": async (options) => {
    const scriptPath = ensureOption(options, "script", "build-all");
    await validateBuildPrerequisites({
      scriptPaths: [scriptPath],
      ...buildPrerequisiteOptionFields(options),
    });

    const runDir = optionAsString(options, "run-dir");
    const buildTextResult = await buildText({
      scriptPath,
      runDir,
      projectId: optionAsString(options, "project-id"),
      runId: optionAsString(options, "run-id"),
      episodeId: optionAsString(options, "episode-id"),
      buildTextConfigPath: optionAsString(options, "build-text-config"),
    });

    const usePatch = Boolean(options.patch);
    let voicevoxTextJsonPath = buildTextResult.voicevoxTextJsonPath;
    if (usePatch) {
      const patchResult = await patchVoicevoxText({
        voicevoxTextJsonPath,
        patchConfigPath: optionAsString(options, "patch-config"),
        runDir: runDir ?? undefined,
      });
      voicevoxTextJsonPath = patchResult.patchedJsonPath;
      console.log(
        `- patch: normalized=${patchResult.normalizedUtteranceCount}, added=${patchResult.addedCandidateCount}`,
      );
    }

    const apiUrl = await resolveVoicevoxApiUrl(
      optionAsString(options, "voicevox-url"),
    );
    const syncResult = await syncUserDict({
      apiUrl,
      dictPath: optionAsString(options, "dict"),
    });
    if (syncResult.errors.length > 0) {
      for (const err of syncResult.errors) {
        console.log(`  [error] [${err.op}] "${err.surface}": ${err.error}`);
      }
      throw new Error(
        `dict-sync completed with ${syncResult.errors.length} error(s)`,
      );
    }

    const result = await buildProject({
      voicevoxTextJsonPath,
      ...buildProjectOptions(options),
      runDir,
    });

    console.log(`Build all done: episode=${result.episodeId}`);
    console.log(
      `- build-text: ${path.relative(process.cwd(), buildTextResult.voicevoxTextJsonPath)}, ${path.relative(process.cwd(), buildTextResult.voicevoxTextPath)}, ${path.relative(process.cwd(), buildTextResult.dictionaryCsvPath)}`,
    );
    console.log(
      `- dict-sync: updated=${syncResult.applied.updated}, added=${syncResult.applied.added}, deleted=${syncResult.applied.deleted} (unchanged: ${syncResult.diff.unchanged})`,
    );
    console.log(
      `- build-project: ${path.relative(process.cwd(), result.importJsonPath)}, ${path.relative(process.cwd(), result.vvprojPath)}, ${path.relative(process.cwd(), result.projectMetaJsonPath)}`,
    );
  },
  "check-run": async (options) => {
    const result = await checkRun({
      runDir: ensureOption(options, "run-dir", "check-run"),
    });

    console.log(
      `Check run done: projectId=${result.projectId}, planned=${result.plannedEpisodeIds.join(",")}, validated=${result.validatedEpisodeIds.join(",")}`,
    );
    console.log(`- run: ${path.relative(process.cwd(), result.runDir)}`);
    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        console.log(`  [warning] ${warning}`);
      }
    }
  },
  "render-prompt": async (options) => {
    const result = await renderPrompt({
      genre: ensureOption(options, "genre", "render-prompt"),
      step: ensureOption(options, "step", "render-prompt"),
      projectConfigPath: ensureOption(
        options,
        "project-config",
        "render-prompt",
      ),
      episodeId: optionAsString(options, "episode-id"),
    });

    process.stdout.write(result.resolvedPrompt);
  },
  "dict-sync": async (options) => {
    const apiUrl = await resolveVoicevoxApiUrl(
      optionAsString(options, "voicevox-url"),
    );
    const dryRun = Boolean(options["dry-run"]);
    const legacySync = Boolean(options["legacy-sync"]);
    const result = await syncUserDict({
      apiUrl,
      dictPath: optionAsString(options, "dict"),
      dryRun,
      legacySync,
    });

    console.log(
      `Dict sync done: updated=${result.applied.updated}, added=${result.applied.added}, deleted=${result.applied.deleted} (unchanged: ${result.diff.unchanged})`,
    );
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.log(`  [error] [${err.op}] "${err.surface}": ${err.error}`);
      }
      if (result.aborted) {
        throw new Error("dict-sync aborted due to consecutive errors");
      }
      throw new Error(
        `dict-sync completed with ${result.errors.length} error(s)`,
      );
    }
  },
};

async function main() {
  const command = process.argv[2] ?? "";
  const options = parseCliArgs(process.argv.slice(3));

  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }
  if (options.help) {
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
  const options = parseCliArgs(process.argv.slice(3));
  const isVerbose = Boolean(options.verbose);
  if (error instanceof Error) {
    console.error(error.message);
    if (isVerbose && error.stack) {
      console.error(error.stack);
    }
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
