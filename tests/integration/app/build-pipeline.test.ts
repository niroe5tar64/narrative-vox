import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { buildText as buildTextBase } from "@narrative-vox/application/build-text.ts";
import { buildProject } from "@narrative-vox/application/build-project.ts";
import { DEFAULT_BUILD_TEXT_CONFIG } from "@narrative-vox/application/build-text/build-text-config.ts";

interface VoicevoxTextJsonTest {
  meta: {
    episode_id: string;
    run_id: string;
    source_script_path: string;
  };
  utterances: Array<{
    utterance_id: string;
    speaker_key?: string;
    text: string;
    pause_length_ms: number;
  }>;
  dictionary_candidates: Array<{ surface: string; reading_or_empty: string }>;
  quality_checks: {
    speakability: {
      score: number;
      average_chars_per_utterance: number;
      long_utterance_ratio: number;
      terminal_punctuation_ratio: number;
    };
    warnings: string[];
  };
}

interface VoicevoxProjectJsonTest {
  appVersion?: string;
  talk: {
    audioKeys: string[];
    audioItems: Record<
      string,
      {
        text: string;
        voice: {
          engineId: string;
          speakerId: string;
          styleId: number;
        };
        query?: {
          accentPhrases: unknown[];
          speedScale: number;
          pitchScale: number;
          intonationScale: number;
          volumeScale: number;
          pauseLengthScale: number;
          prePhonemeLength: number;
          postPhonemeLength: number;
          outputSamplingRate: number | "engineDefault";
          outputStereo: boolean;
          kana?: string;
        };
      }
    >;
  };
}

interface VoicevoxProjectMetaJsonTest {
  generated_at: string;
  adjustments: {
    speed_preset?: string;
    emotion?: string;
    intonation_scale?: number;
  };
}

const sampleScriptPath = path.resolve(
  "tests/fixtures/sample-run/script/E01_script.md"
);
const defaultBuildTextConfigPath = path.resolve("configs/voice/voicevox/build-text-config.json");
const explicitVoiceOverrides = {
  engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
  speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
  styleId: 67
} as const;

type BuildTextInput = Omit<Parameters<typeof buildTextBase>[0], "buildTextConfigPath"> & {
  buildTextConfigPath?: string;
};

function buildText(options: BuildTextInput) {
  return buildTextBase({
    ...options,
    buildTextConfigPath: options.buildTextConfigPath ?? defaultBuildTextConfigPath
  });
}

async function withMockVoicevoxServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  run: (baseUrl: string) => Promise<void>
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve mock VOICEVOX server address");
    }
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function mockAudioQueryResponse(params?: {
  snakeCase?: boolean;
  isInterrogative?: boolean;
  emptyAccentPhrases?: boolean;
  overrides?: Record<string, unknown>;
}): Record<string, unknown> {
  const snakeCase = params?.snakeCase ?? false;
  const isInterrogative = params?.isInterrogative ?? false;
  const emptyAccentPhrases = params?.emptyAccentPhrases ?? false;
  const overrides = params?.overrides ?? {};

  const accentPhrases = emptyAccentPhrases
    ? []
    : [
        {
          moras: [
            {
              text: "テ",
              consonant: "t",
              consonantLength: 0.05,
              vowel: "e",
              vowelLength: 0.08,
              pitch: 5.5
            }
          ],
          accent: 1,
          isInterrogative
        }
      ];
  const accentPhrasesSnake = emptyAccentPhrases
    ? []
    : [
        {
          moras: [
            {
              text: "テ",
              consonant: "t",
              consonant_length: 0.05,
              vowel: "e",
              vowel_length: 0.08,
              pitch: 5.5
            }
          ],
          accent: 1,
          pause_mora: null,
          is_interrogative: isInterrogative
        }
      ];

  return {
    ...(snakeCase ? { accent_phrases: accentPhrasesSnake } : { accentPhrases }),
    speedScale: 1.8,
    pitchScale: -0.2,
    intonationScale: 0.5,
    volumeScale: 0.7,
    pauseLengthScale: 0.9,
    prePhonemeLength: 0.03,
    postPhonemeLength: 0.04,
    outputSamplingRate: 24000,
    outputStereo: true,
    kana: "",
    ...overrides
  };
}

interface AudioQueryHandlerContext {
  requestUrl: URL;
  text: string;
  callCount: number;
}

function createAudioQueryHandler(options?: {
  statusCode?: number;
  responseBody?: Record<string, unknown>;
  responseFactory?: (context: AudioQueryHandlerContext) => Record<string, unknown>;
  maxCalls?: number;
  onAudioQuery?: (context: AudioQueryHandlerContext) => void;
}): (req: IncomingMessage, res: ServerResponse) => void {
  let callCount = 0;

  return (req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "POST" || requestUrl.pathname !== "/audio_query") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    callCount += 1;
    const text = requestUrl.searchParams.get("text") ?? "";
    const context: AudioQueryHandlerContext = {
      requestUrl,
      text,
      callCount
    };
    options?.onAudioQuery?.(context);

    if (options?.maxCalls !== undefined && callCount > options.maxCalls) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: `audio_query called too many times: ${callCount} > ${options.maxCalls}`
        })
      );
      return;
    }

    const statusCode = options?.statusCode ?? 200;
    const responseBody = options?.responseFactory
      ? options.responseFactory(context)
      : options?.responseBody ?? mockAudioQueryResponse();
    res.writeHead(statusCode, { "content-type": "application/json" });
    res.end(JSON.stringify(responseBody));
  };
}

test("audio_query mock helper supports status code and max call controls", async () => {
  await withMockVoicevoxServer(
    createAudioQueryHandler({
      statusCode: 201,
      maxCalls: 1,
      responseBody: { ok: true }
    }),
    async (voicevoxApiUrl) => {
      const first = await fetch(
        `${voicevoxApiUrl}/audio_query?text=first&speaker=1`,
        { method: "POST" }
      );
      assert.equal(first.status, 201);
      assert.deepEqual(await first.json(), { ok: true });

      const second = await fetch(
        `${voicevoxApiUrl}/audio_query?text=second&speaker=1`,
        { method: "POST" }
      );
      assert.equal(second.status, 500);
      const secondJson = await second.json() as { error?: string };
      assert.match(secondJson.error ?? "", /called too many times/);
    }
  );
});

test("build-text -> build-project pipeline works with sample script", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;
  assert.equal(textJson.meta.episode_id, "E01");
  assert.ok(textJson.utterances.length > 0);
  assert.equal(textJson.quality_checks.speakability.score >= 0, true);
  assert.equal(textJson.quality_checks.speakability.score <= 100, true);

  await withMockVoicevoxServer(createAudioQueryHandler(), async (voicevoxApiUrl) => {
    const projectResult = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      runDir,
      synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
      voicevoxApiUrl,
      ...explicitVoiceOverrides
    });

    const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;
    assert.equal(projectJson.talk.audioKeys.length, textJson.utterances.length);
    const firstAudioItem = projectJson.talk.audioItems[projectJson.talk.audioKeys[0]];
    assert.ok(firstAudioItem);
    assert.ok(firstAudioItem.query);
    assert.equal((firstAudioItem.query?.accentPhrases.length ?? 0) > 0, true);
  });
});

test("build-text extracts speaker_key from line-head [speaker:<key>] tags", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const scriptPath = path.join(tempRoot, "E01_script.md");
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      "[speaker:teacher] これは先生の発話です。続けて説明します。",
      "[speaker:student] なるほど、わかりました。",
    ].join("\n"),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });
  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;

  assert.equal(textJson.utterances.length, 3);
  assert.equal(textJson.utterances[0]?.speaker_key, "teacher");
  assert.equal(textJson.utterances[1]?.speaker_key, "teacher");
  assert.equal(textJson.utterances[2]?.speaker_key, "student");
});

test("build-text keeps speaker_key undefined for lines without [speaker:<key>] tag", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const scriptPath = path.join(tempRoot, "E01_script.md");
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      "[speaker:teacher] これは先生の発話です。",
      "こちらはタグなしです。",
    ].join("\n"),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });
  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;

  assert.equal(textJson.utterances.length, 2);
  assert.equal(textJson.utterances[0]?.speaker_key, "teacher");
  assert.equal(textJson.utterances[1]?.speaker_key, undefined);
});

test("build-text applies reading dictionary entries to generated utterances", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const scriptPath = path.join(tempRoot, "E01_script.md");
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      "ReScriptで音声合成を試します。",
    ].join("\n"),
    "utf-8"
  );

  const readingDictionaryPath = path.join(tempRoot, "reading-dictionary.json");
  await writeFile(
    readingDictionaryPath,
    JSON.stringify(
      {
        version: 1,
        entries: [
          {
            surface: "ReScript",
            reading: "リスクリプト"
          }
        ]
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234",
    readingDictionaryPath
  });
  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;

  const utteranceTexts = textJson.utterances.map((utterance) => utterance.text);
  assert.equal(utteranceTexts.some((text) => text.includes("リスクリプト")), true);
  assert.equal(utteranceTexts.some((text) => text.includes("ReScript")), false);
});

test("build-text keeps ruby reading precedence over reading dictionary", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const scriptPath = path.join(tempRoot, "E01_script.md");
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      "{ReScript|リ・スクリプト}で検証します。",
    ].join("\n"),
    "utf-8"
  );

  const readingDictionaryPath = path.join(tempRoot, "reading-dictionary.json");
  await writeFile(
    readingDictionaryPath,
    JSON.stringify(
      {
        version: 1,
        entries: [
          {
            surface: "ReScript",
            reading: "リスクリプト"
          }
        ]
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234",
    readingDictionaryPath
  });
  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;

  const utteranceTexts = textJson.utterances.map((utterance) => utterance.text);
  assert.equal(utteranceTexts.some((text) => text.includes("リ・スクリプト")), true);
  assert.equal(utteranceTexts.some((text) => text.includes("リスクリプト")), false);
});

test("build-project resolves character voices per utterance speaker_key", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const scriptPath = path.join(tempRoot, "E01_script.md");
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      "[speaker:teacher] これは先生の発話です。",
      "[speaker:student] こちらは生徒の発話です。",
    ].join("\n"),
    "utf-8"
  );

  const characterMapPath = path.join(tempRoot, "character_map.json");
  await writeFile(
    characterMapPath,
    JSON.stringify(
      {
        defaultCharacterKey: "narrator",
        characters: {
          narrator: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 67
          },
          teacher: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 68
          },
          student: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 69
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });
  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;

  const projectResult = await buildProject({
    voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
    runDir,
    synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
    characterMapPath
  });
  const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;

  const expectedStyleByCharacterKey: Record<string, number> = {
    narrator: 67,
    teacher: 68,
    student: 69
  };

  for (const utterance of textJson.utterances) {
    const audioKey = `E01_${utterance.utterance_id}`;
    const audioItem = projectJson.talk.audioItems[audioKey];
    assert.ok(audioItem);
    const characterKey = utterance.speaker_key ?? "narrator";
    assert.equal(audioItem.voice.styleId, expectedStyleByCharacterKey[characterKey]);
  }
});

test("build-project character-key overrides utterance speaker_key values", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const scriptPath = path.join(tempRoot, "E01_script.md");
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      "[speaker:teacher] これは先生の発話です。",
      "[speaker:student] こちらは生徒の発話です。",
    ].join("\n"),
    "utf-8"
  );

  const characterMapPath = path.join(tempRoot, "character_map.json");
  await writeFile(
    characterMapPath,
    JSON.stringify(
      {
        defaultCharacterKey: "narrator",
        characters: {
          narrator: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 70
          },
          teacher: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 68
          },
          student: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 69
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  const projectResult = await buildProject({
    voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
    runDir,
    synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
    characterMapPath,
    characterKey: "narrator"
  });
  const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;

  for (const audioKey of projectJson.talk.audioKeys) {
    const audioItem = projectJson.talk.audioItems[audioKey];
    assert.equal(audioItem.voice.styleId, 70);
  }
});

test("build-project applies --emotion style mapping from character map", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const characterMapPath = path.join(tempRoot, "character_map.json");
  await writeFile(
    characterMapPath,
    JSON.stringify(
      {
        characters: {
          narrator: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 67
          }
        },
        emotionStyles: {
          narrator: {
            calm: 67,
            energetic: 68
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  await withMockVoicevoxServer(createAudioQueryHandler(), async (voicevoxApiUrl) => {
    const projectResult = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      runDir,
      synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
      characterMapPath,
      characterKey: "narrator",
      emotion: "energetic",
      voicevoxApiUrl
    });
    const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;

    for (const audioKey of projectJson.talk.audioKeys) {
      const audioItem = projectJson.talk.audioItems[audioKey];
      assert.equal(audioItem.voice.styleId, 68);
    }
  });
});

test("build-project rejects unknown --emotion key with available list", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const characterMapPath = path.join(tempRoot, "character_map.json");
  await writeFile(
    characterMapPath,
    JSON.stringify(
      {
        characters: {
          narrator: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 67
          }
        },
        emotionStyles: {
          narrator: {
            calm: 67
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  await assert.rejects(
    () =>
      buildProject({
        voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
        runDir,
        synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
        characterMapPath,
        characterKey: "narrator",
        emotion: "unknown",
        voicevoxApiUrl: "http://127.0.0.1:9"
      }),
    /Emotion "unknown" not found for character "narrator"\. Available: calm/
  );
});

test("build-project rejects --emotion when character has no emotionStyles", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const characterMapPath = path.join(tempRoot, "character_map.json");
  await writeFile(
    characterMapPath,
    JSON.stringify(
      {
        characters: {
          narrator: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 67
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  await assert.rejects(
    () =>
      buildProject({
        voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
        runDir,
        synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
        characterMapPath,
        characterKey: "narrator",
        emotion: "calm",
        voicevoxApiUrl: "http://127.0.0.1:9"
      }),
    /Character "narrator" has no emotionStyles defined/
  );
});

test("build-project keeps --style-id priority over --emotion", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const characterMapPath = path.join(tempRoot, "character_map.json");
  await writeFile(
    characterMapPath,
    JSON.stringify(
      {
        characters: {
          narrator: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 67
          }
        },
        emotionStyles: {
          narrator: {
            energetic: 68
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  await withMockVoicevoxServer(createAudioQueryHandler(), async (voicevoxApiUrl) => {
    const projectResult = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      runDir,
      synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
      characterMapPath,
      characterKey: "narrator",
      emotion: "energetic",
      styleId: 70,
      voicevoxApiUrl
    });
    const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;

    for (const audioKey of projectJson.talk.audioKeys) {
      const audioItem = projectJson.talk.audioItems[audioKey];
      assert.equal(audioItem.voice.styleId, 70);
    }
  });
});

test("build-project rejects unknown character_key in utterance", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const scriptPath = path.join(tempRoot, "E01_script.md");
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      "[speaker:ghost] この話者キーは未定義です。",
    ].join("\n"),
    "utf-8"
  );

  const characterMapPath = path.join(tempRoot, "character_map.json");
  await writeFile(
    characterMapPath,
    JSON.stringify(
      {
        defaultCharacterKey: "narrator",
        characters: {
          narrator: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 67
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  await assert.rejects(
    () =>
      buildProject({
        voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
        runDir,
        synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
        characterMapPath
      }),
    /Unknown character_key "ghost"/
  );
});

test("build-project normalizes too-old appVersion to supported vvproj format version", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const oldSynthesisDefaultsPath = path.join(tempRoot, "old-synthesis-defaults.json");
  await writeFile(
    oldSynthesisDefaultsPath,
    JSON.stringify(
      {
        appVersion: "0.14.7",
        engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
        speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
        styleId: 67,
        tpqn: 480,
        tempoBpm: 120,
        timeSignature: {
          beats: 4,
          beatType: 4
        },
        queryDefaults: {
          speedScale: 1,
          pitchScale: 0,
          intonationScale: 1,
          volumeScale: 1,
          pauseLengthScale: 1,
          prePhonemeLength: 0.1,
          postPhonemeLength: 0.1,
          outputSamplingRate: "engineDefault",
          outputStereo: false
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  const projectResult = await buildProject({
    voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
    runDir,
    synthesisDefaultsPath: oldSynthesisDefaultsPath,
    ...explicitVoiceOverrides
  });

  const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;
  assert.equal(projectJson.appVersion, "0.25.0");
});

test("build-project fills accentPhrases via VOICEVOX audio_query", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });
  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;

  const requestedTexts: string[] = [];
  await withMockVoicevoxServer(createAudioQueryHandler({
    onAudioQuery: ({ text }) => {
      requestedTexts.push(text);
    }
  }), async (voicevoxApiUrl) => {
    const projectResult = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      runDir,
      synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
      voicevoxApiUrl,
      ...explicitVoiceOverrides
    });
    const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;

    assert.equal(projectJson.talk.audioKeys.length, textJson.utterances.length);
    assert.equal(requestedTexts.length, textJson.utterances.length);
    const textUtteranceById = new Map(
      textJson.utterances.map((utterance) => [utterance.utterance_id, utterance] as const)
    );

    for (const audioKey of projectJson.talk.audioKeys) {
      const audioItem = projectJson.talk.audioItems[audioKey];
      assert.ok(audioItem.query);
      assert.equal((audioItem.query?.accentPhrases.length ?? 0) > 0, true);
      assert.equal(audioItem.query?.speedScale, 1);
      assert.equal(audioItem.query?.pitchScale, 0);
      assert.equal(audioItem.query?.intonationScale, 1);
      assert.equal(audioItem.query?.volumeScale, 1);
      assert.equal(audioItem.query?.pauseLengthScale, 1);
      assert.equal(audioItem.query?.prePhonemeLength, 0.1);
      assert.equal(audioItem.query?.outputSamplingRate, "engineDefault");
      assert.equal(audioItem.query?.outputStereo, false);

      const utteranceId = audioKey.split("_").slice(1).join("_");
      const sourceUtterance = textUtteranceById.get(utteranceId);
      assert.ok(sourceUtterance);
      assert.equal(audioItem.query?.postPhonemeLength, sourceUtterance.pause_length_ms / 1000);
    }
  });
});

test("build-project applies speed preset values after synthesis defaults", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const speedProfilesPath = path.join(tempRoot, "speed-profiles.json");
  await writeFile(
    speedProfilesPath,
    JSON.stringify(
      {
        version: 1,
        presets: {
          slow: {
            speedScale: 0.9,
            pauseLengthScale: 1.2,
            postPhonemeLength: 0.14
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  await withMockVoicevoxServer(createAudioQueryHandler(), async (voicevoxApiUrl) => {
    const projectResult = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      runDir,
      synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
      voicevoxApiUrl,
      speedPreset: "slow",
      speedProfilesPath,
      ...explicitVoiceOverrides
    });
    const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;

    for (const audioKey of projectJson.talk.audioKeys) {
      const audioItem = projectJson.talk.audioItems[audioKey];
      assert.ok(audioItem.query);
      assert.equal(audioItem.query?.speedScale, 0.9);
      assert.equal(audioItem.query?.pauseLengthScale, 1.2);
    }
  });
});

test("build-project keeps pause-length lower bound after speed preset overrides", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const speedProfilesPath = path.join(tempRoot, "speed-profiles.json");
  await writeFile(
    speedProfilesPath,
    JSON.stringify(
      {
        version: 1,
        presets: {
          slow: {
            speedScale: 0.9,
            pauseLengthScale: 1.2,
            postPhonemeLength: 0.05
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });
  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;
  const textUtteranceById = new Map(
    textJson.utterances.map((utterance) => [utterance.utterance_id, utterance] as const)
  );

  await withMockVoicevoxServer(createAudioQueryHandler(), async (voicevoxApiUrl) => {
    const projectResult = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      runDir,
      synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
      voicevoxApiUrl,
      speedPreset: "slow",
      speedProfilesPath,
      ...explicitVoiceOverrides
    });
    const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;

    for (const audioKey of projectJson.talk.audioKeys) {
      const audioItem = projectJson.talk.audioItems[audioKey];
      const utteranceId = audioKey.split("_").slice(1).join("_");
      const sourceUtterance = textUtteranceById.get(utteranceId);
      assert.ok(sourceUtterance);
      assert.equal(audioItem.query?.postPhonemeLength, sourceUtterance.pause_length_ms / 1000);
    }
  });
});

test("build-project rejects unknown speed-preset", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  await assert.rejects(
    () =>
      buildProject({
        voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
        runDir,
        synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
        speedPreset: "invalid",
        ...explicitVoiceOverrides
      }),
    /Unknown speed preset "invalid"/
  );
});

test("build-project applies intonation-scale and preserves interrogative accent flags", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  await withMockVoicevoxServer(createAudioQueryHandler({
    responseBody: mockAudioQueryResponse({ isInterrogative: true })
  }), async (voicevoxApiUrl) => {
    const projectResult = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      runDir,
      synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
      voicevoxApiUrl,
      intonationScale: 0.05,
      ...explicitVoiceOverrides
    });
    const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;
    const projectMeta = JSON.parse(
      await readFile(projectResult.projectMetaJsonPath, "utf-8")
    ) as VoicevoxProjectMetaJsonTest;

    for (const audioKey of projectJson.talk.audioKeys) {
      const audioItem = projectJson.talk.audioItems[audioKey];
      assert.equal(audioItem.query?.intonationScale, 0.05);
      const firstAccentPhrase = audioItem.query?.accentPhrases[0] as
        | { isInterrogative?: boolean }
        | undefined;
      assert.equal(firstAccentPhrase?.isInterrogative, true);
    }

    assert.equal(typeof projectMeta.generated_at, "string");
    assert.equal(projectMeta.adjustments.intonation_scale, 0.05);
  });
});

test("build-project clamps intonationScale to zero when intonation-scale is negative", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  await withMockVoicevoxServer(createAudioQueryHandler(), async (voicevoxApiUrl) => {
    const projectResult = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      runDir,
      synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
      voicevoxApiUrl,
      intonationScale: -2,
      ...explicitVoiceOverrides
    });
    const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;

    for (const audioKey of projectJson.talk.audioKeys) {
      const audioItem = projectJson.talk.audioItems[audioKey];
      assert.equal(audioItem.query?.intonationScale, 0);
    }
  });
});

test("build-project writes project meta sidecar with speed, emotion, and prosody adjustments", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const characterMapPath = path.join(tempRoot, "character_map.json");
  await writeFile(
    characterMapPath,
    JSON.stringify(
      {
        characters: {
          narrator: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 67
          }
        },
        emotionStyles: {
          narrator: {
            calm: 67
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const speedProfilesPath = path.join(tempRoot, "speed-profiles.json");
  await writeFile(
    speedProfilesPath,
    JSON.stringify(
      {
        version: 1,
        presets: {
          slow: {
            speedScale: 0.9,
            pauseLengthScale: 1.2,
            postPhonemeLength: 0.14
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  await withMockVoicevoxServer(createAudioQueryHandler(), async (voicevoxApiUrl) => {
    const projectResult = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      runDir,
      synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
      characterMapPath,
      characterKey: "narrator",
      emotion: "calm",
      speedPreset: "slow",
      speedProfilesPath,
      intonationScale: 0.02,
      voicevoxApiUrl
    });
    const projectMeta = JSON.parse(
      await readFile(projectResult.projectMetaJsonPath, "utf-8")
    ) as VoicevoxProjectMetaJsonTest;

    assert.deepEqual(projectMeta.adjustments, {
      speed_preset: "slow",
      emotion: "calm",
      intonation_scale: 0.02
    });
  });
});

test("build-project supports snake_case audio_query response", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  await withMockVoicevoxServer(createAudioQueryHandler({
    responseBody: mockAudioQueryResponse({ snakeCase: true })
  }), async (voicevoxApiUrl) => {
    const projectResult = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      runDir,
      synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
      voicevoxApiUrl,
      ...explicitVoiceOverrides
    });
    const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;

    for (const audioKey of projectJson.talk.audioKeys) {
      const audioItem = projectJson.talk.audioItems[audioKey];
      assert.ok(audioItem.query);
      assert.equal((audioItem.query?.accentPhrases.length ?? 0) > 0, true);
      assert.equal(audioItem.query?.outputSamplingRate, "engineDefault");
      assert.equal(audioItem.query?.outputStereo, false);
    }
  });
});

test("build-project rejects empty accentPhrases from VOICEVOX audio_query", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-1234"
  });

  await withMockVoicevoxServer(createAudioQueryHandler({
    responseBody: mockAudioQueryResponse({
      emptyAccentPhrases: true,
      overrides: {
        speedScale: 1,
        pitchScale: 0,
        intonationScale: 1,
        volumeScale: 1,
        pauseLengthScale: 1,
        prePhonemeLength: 0.1,
        postPhonemeLength: 0.1,
        outputSamplingRate: "engineDefault",
        outputStereo: false
      }
    })
  }), async (voicevoxApiUrl) => {
    await assert.rejects(
      () =>
        buildProject({
          voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
          runDir,
          synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
          voicevoxApiUrl,
          ...explicitVoiceOverrides
        }),
      /empty accentPhrases/
    );
  });
});

test("build-text uses run_id from run-dir path when --run-id is omitted", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-20260211-2222", "artifacts");
  await mkdir(runDir, { recursive: true });

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript"
  });

  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;
  assert.equal(textJson.meta.run_id, "run-20260211-2222");
});

test("build-text auto-generates run_id when not found in --run-dir", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "output");
  await mkdir(runDir, { recursive: true });

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript"
  });

  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;
  assert.match(textJson.meta.run_id, /^run-\d{8}-\d{4}$/);
});

test("build-text infers run-dir from --script path when run-dir is omitted", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-20260211-5555");
  const scriptDir = path.join(runDir, "script");
  await mkdir(scriptDir, { recursive: true });

  const scriptPath = path.join(scriptDir, "E03_script.md");
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      "これは推論テストです。",
    ].join("\n"),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath
  });

  assert.equal(path.dirname(buildTextResult.voicevoxTextJsonPath), path.join(runDir, "voicevox_text"));
  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;
  assert.equal(textJson.meta.run_id, "run-20260211-5555");
});

test("build-text stores source_script_path as run-dir relative path", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-20260211-5556");
  const scriptDir = path.join(runDir, "script");
  await mkdir(scriptDir, { recursive: true });

  const scriptPath = path.join(scriptDir, "E01_script.md");
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      "これは source_script_path の検証です。",
    ].join("\n"),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-5556"
  });

  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;
  assert.equal(textJson.meta.source_script_path, "script/E01_script.md");
  assert.notEqual(textJson.meta.source_script_path, path.relative(process.cwd(), scriptPath));
});

test("build-project infers run-dir from --voicevox-text-json path when run-dir is omitted", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-20260211-6666");
  await mkdir(runDir, { recursive: true });

  const buildTextResult = await buildText({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-6666"
  });

  const projectResult = await buildProject({
    voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
    synthesisDefaultsPath: path.resolve("configs/voice/voicevox/synthesis-defaults.example.json"),
    ...explicitVoiceOverrides
  });

  assert.equal(path.dirname(projectResult.importJsonPath), path.join(runDir, "voicevox_project"));
});

test("build-text rejects invalid --run-id format with expected pattern in message", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-20260211-0000");
  await mkdir(runDir, { recursive: true });

  await assert.rejects(
    () =>
      buildText({
        scriptPath: sampleScriptPath,
        runDir,
        episodeId: "E01",
        projectId: "introducing-rescript",
        runId: "run-2026-02-11-1234"
      }),
    /run-YYYYMMDD-HHMM/
  );
});

test("build-text falls back to built-in defaults when build-text config path is omitted", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const withoutConfigRunDir = path.join(tempRoot, "introducing-rescript", "run-20260211-7778");
  const explicitConfigRunDir = path.join(tempRoot, "introducing-rescript", "run-20260211-7779");
  await mkdir(withoutConfigRunDir, { recursive: true });
  await mkdir(explicitConfigRunDir, { recursive: true });

  const builtInConfigPath = path.join(tempRoot, "built-in-build-text-config.json");
  await writeFile(
    builtInConfigPath,
    `${JSON.stringify({ version: 1, ...DEFAULT_BUILD_TEXT_CONFIG }, null, 2)}\n`,
    "utf-8"
  );

  const withoutConfigResult = await buildTextBase({
    scriptPath: sampleScriptPath,
    runDir: withoutConfigRunDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-7778"
  });

  const explicitConfigResult = await buildTextBase({
    scriptPath: sampleScriptPath,
    runDir: explicitConfigRunDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-7779",
    buildTextConfigPath: builtInConfigPath
  });

  const withoutConfigJson = JSON.parse(
    await readFile(withoutConfigResult.voicevoxTextJsonPath, "utf-8")
  ) as VoicevoxTextJsonTest;
  const explicitConfigJson = JSON.parse(
    await readFile(explicitConfigResult.voicevoxTextJsonPath, "utf-8")
  ) as VoicevoxTextJsonTest;

  const pickConfigDependentValues = (data: VoicevoxTextJsonTest) => ({
    utterances: data.utterances.map((utterance) => ({
      text: utterance.text,
      pause_length_ms: utterance.pause_length_ms
    })),
    speakability: data.quality_checks.speakability,
    warnings: data.quality_checks.warnings
  });

  assert.deepEqual(
    pickConfigDependentValues(withoutConfigJson),
    pickConfigDependentValues(explicitConfigJson)
  );
});

test("build-text extracts dictionary candidates with readings from morphological analysis", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-20260211-3333");
  await mkdir(runDir, { recursive: true });

  const scriptPath = path.join(tempRoot, "E99_script.md");
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      "検証の流れを整理する。",
      "APIの挙動も検証する。",
    ].join("\n"),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath,
    runDir,
    episodeId: "E99",
    projectId: "introducing-rescript",
    runId: "run-20260211-3333"
  });

  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;
  const dictionary = textJson.dictionary_candidates;

  const kensho = dictionary.find((item: { surface: string; reading_or_empty: string }) => item.surface === "検証");
  assert.ok(kensho);
  assert.equal(kensho.reading_or_empty.length > 0, true);

  const api = dictionary.find((item: { surface: string; reading_or_empty: string }) => item.surface === "API");
  assert.ok(api);
  assert.equal(api.reading_or_empty, "エーピーアイ");
});

test("build-text adds warning when speakability score is low", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-20260211-4444");
  await mkdir(runDir, { recursive: true });

  const scriptPath = path.join(tempRoot, "E98_script.md");
  const lowSpeakabilityLine = `${"a".repeat(53)}、${"a".repeat(60)}`;
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      lowSpeakabilityLine,
    ].join("\n"),
    "utf-8"
  );

  const buildTextResult = await buildText({
    scriptPath,
    runDir,
    episodeId: "E98",
    projectId: "introducing-rescript",
    runId: "run-20260211-4444"
  });

  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;
  assert.equal(textJson.quality_checks.speakability.score < 70, true);
  assert.equal(
    textJson.quality_checks.warnings.some((message) => message.includes("Speakability score is low")),
    true
  );
});

test("build-text applies build-text config values to pause and warning thresholds", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const baseRunDir = path.join(tempRoot, "introducing-rescript", "run-20260211-4445");
  const customRunDir = path.join(tempRoot, "introducing-rescript", "run-20260211-4446");
  await mkdir(baseRunDir, { recursive: true });
  await mkdir(customRunDir, { recursive: true });

  const scriptPath = path.join(tempRoot, "E97_script.md");
  await writeFile(
    scriptPath,
    [
      "1. 導入",
      "終わり。",
    ].join("\n"),
    "utf-8"
  );

  const baseResult = await buildText({
    scriptPath,
    runDir: baseRunDir,
    episodeId: "E97",
    projectId: "introducing-rescript",
    runId: "run-20260211-4445"
  });
  const baseJson = JSON.parse(await readFile(baseResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;
  assert.equal(baseJson.utterances[0]?.pause_length_ms, 320);
  assert.equal(
    baseJson.quality_checks.warnings.some((message) => message.includes("Speakability score is low")),
    false
  );

  const customConfigPath = path.join(tempRoot, "build-text-config.custom.json");
  await writeFile(
    customConfigPath,
    JSON.stringify(
      {
        version: 1,
        speakability: {
          warningThresholds: {
            scoreThreshold: 101,
            minTerminalPunctuationRatio: 0.65,
            maxLongUtteranceRatio: 0.25
          },
          scoring: {
            targetAverageChars: 32,
            averagePenaltyFactor: 1.2,
            averagePenaltyMax: 35,
            longRatioWeight: 45,
            punctuationWeight: 20
          }
        },
        pause: {
          minMs: 120,
          maxMs: 520,
          bases: {
            default: 190,
            strongEnding: 360,
            clauseEnd: 240,
            fullStop: 410
          },
          lengthBonus: {
            step: 10,
            increment: 20,
            max: 120
          },
          penalties: {
            conjunction: 40,
            continuation: 50
          }
        }
      },
      null,
      2
    ),
    "utf-8"
  );

  const customResult = await buildText({
    scriptPath,
    runDir: customRunDir,
    episodeId: "E97",
    projectId: "introducing-rescript",
    runId: "run-20260211-4446",
    buildTextConfigPath: customConfigPath
  });
  const customJson = JSON.parse(await readFile(customResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;
  assert.equal(customJson.utterances[0]?.pause_length_ms, 410);
  assert.equal(
    customJson.quality_checks.warnings.some((message) => message.includes("Speakability score is low")),
    true
  );
});
