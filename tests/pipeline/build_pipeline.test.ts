import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { buildText as buildTextBase } from "../../src/pipeline/build_text.ts";
import { buildProject } from "../../src/pipeline/build_project.ts";

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

const sampleScriptPath = path.resolve(
  "tests/fixtures/sample-run/script/E01_script.md"
);
const defaultBuildTextConfigPath = path.resolve("configs/voicevox/build_text_config.json");
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

  const projectResult = await buildProject({
    voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
    runDir,
    profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
    ...explicitVoiceOverrides
  });

  const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;
  assert.equal(projectJson.talk.audioKeys.length, textJson.utterances.length);
  const firstAudioItem = projectJson.talk.audioItems[projectJson.talk.audioKeys[0]];
  assert.ok(firstAudioItem);
  assert.equal(firstAudioItem.query, undefined);
});

test("build-project prefill-query=minimal adds query defaults to every audio item", async () => {
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

  const projectResult = await buildProject({
    voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
    runDir,
    profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
    prefillQuery: "minimal",
    ...explicitVoiceOverrides
  });

  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;
  const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;
  assert.equal(projectJson.talk.audioKeys.length > 0, true);
  const textUtteranceById = new Map(
    textJson.utterances.map((utterance) => [utterance.utterance_id, utterance] as const)
  );

  for (const audioKey of projectJson.talk.audioKeys) {
    const audioItem = projectJson.talk.audioItems[audioKey];
    assert.ok(audioItem);
    assert.ok(audioItem.query);
    const utteranceId = audioKey.split("_").slice(1).join("_");
    const sourceUtterance = textUtteranceById.get(utteranceId);
    assert.ok(sourceUtterance);
    assert.deepEqual(audioItem.query?.accentPhrases, []);
    assert.equal(audioItem.query?.speedScale, 1);
    assert.equal(audioItem.query?.pitchScale, 0);
    assert.equal(audioItem.query?.intonationScale, 1);
    assert.equal(audioItem.query?.volumeScale, 1);
    assert.equal(audioItem.query?.pauseLengthScale, 1);
    assert.equal(audioItem.query?.prePhonemeLength, 0.1);
    assert.equal(audioItem.query?.postPhonemeLength, sourceUtterance.pause_length_ms / 1000);
    assert.equal(audioItem.query?.outputSamplingRate, "engineDefault");
    assert.equal(audioItem.query?.outputStereo, false);
  }
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
  assert.equal(
    textJson.quality_checks.warnings.some((message) => message.includes("speaker_key is omitted for")),
    false
  );
});

test("build-text does not emit speaker fallback warning when source lines omit speaker tags", async () => {
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

  assert.equal(
    textJson.quality_checks.warnings.some((message) => message.includes("speaker_key is omitted for")),
    false
  );
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
    profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
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
    profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
    characterMapPath,
    characterKey: "narrator"
  });
  const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;

  for (const audioKey of projectJson.talk.audioKeys) {
    const audioItem = projectJson.talk.audioItems[audioKey];
    assert.equal(audioItem.voice.styleId, 70);
  }
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
        profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
        characterMapPath
      }),
    /Unknown character_key "ghost"/
  );
});

test("build-project normalizes too-old appVersion to supported vvproj format version", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-test");
  await mkdir(runDir, { recursive: true });

  const oldProfilePath = path.join(tempRoot, "old-profile.json");
  await writeFile(
    oldProfilePath,
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
    profilePath: oldProfilePath,
    ...explicitVoiceOverrides
  });

  const projectJson = JSON.parse(await readFile(projectResult.importJsonPath, "utf-8")) as VoicevoxProjectJsonTest;
  assert.equal(projectJson.appVersion, "0.25.0");
});

test("build-project rejects unsupported prefill-query mode", async () => {
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
        profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
        prefillQuery: "invalid" as "minimal"
      }),
    /Expected one of: none, minimal, engine/
  );
});

test("build-project prefill-query=engine fills accentPhrases via VOICEVOX audio_query", async () => {
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
  await withMockVoicevoxServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "POST" || requestUrl.pathname !== "/audio_query") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const text = requestUrl.searchParams.get("text") ?? "";
    requestedTexts.push(text);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        accentPhrases: [
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
            isInterrogative: false
          }
        ],
        speedScale: 1.8,
        pitchScale: -0.2,
        intonationScale: 0.5,
        volumeScale: 0.7,
        pauseLengthScale: 0.9,
        prePhonemeLength: 0.03,
        postPhonemeLength: 0.04,
        outputSamplingRate: 24000,
        outputStereo: true,
        kana: ""
      })
    );
  }, async (voicevoxApiUrl) => {
    const projectResult = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      runDir,
      profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
      prefillQuery: "engine",
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

test("build-project prefill-query=engine supports snake_case audio_query response", async () => {
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

  await withMockVoicevoxServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "POST" || requestUrl.pathname !== "/audio_query") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        accent_phrases: [
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
            is_interrogative: false
          }
        ],
        speedScale: 1.8,
        pitchScale: -0.2,
        intonationScale: 0.5,
        volumeScale: 0.7,
        pauseLengthScale: 0.9,
        prePhonemeLength: 0.03,
        postPhonemeLength: 0.04,
        outputSamplingRate: 24000,
        outputStereo: true,
        kana: ""
      })
    );
  }, async (voicevoxApiUrl) => {
    const projectResult = await buildProject({
      voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
      runDir,
      profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
      prefillQuery: "engine",
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

test("build-project prefill-query=engine rejects empty accentPhrases from VOICEVOX audio_query", async () => {
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

  await withMockVoicevoxServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "POST" || requestUrl.pathname !== "/audio_query") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        accentPhrases: [],
        speedScale: 1,
        pitchScale: 0,
        intonationScale: 1,
        volumeScale: 1,
        pauseLengthScale: 1,
        prePhonemeLength: 0.1,
        postPhonemeLength: 0.1,
        outputSamplingRate: "engineDefault",
        outputStereo: false
      })
    );
  }, async (voicevoxApiUrl) => {
    await assert.rejects(
      () =>
        buildProject({
          voicevoxTextJsonPath: buildTextResult.voicevoxTextJsonPath,
          runDir,
          profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
          prefillQuery: "engine",
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
    profilePath: path.resolve("configs/voicevox/default_profile.example.json"),
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
  const runDir = path.join(tempRoot, "introducing-rescript", "run-20260211-7778");
  await mkdir(runDir, { recursive: true });

  const buildTextResult = await buildTextBase({
    scriptPath: sampleScriptPath,
    runDir,
    episodeId: "E01",
    projectId: "introducing-rescript",
    runId: "run-20260211-7778"
  });

  const textJson = JSON.parse(await readFile(buildTextResult.voicevoxTextJsonPath, "utf-8")) as VoicevoxTextJsonTest;
  assert.equal(textJson.utterances.length > 0, true);
  assert.equal(textJson.quality_checks.speakability.score >= 0, true);
  assert.equal(textJson.quality_checks.speakability.score <= 100, true);
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

  const customConfigPath = path.join(tempRoot, "build_text_config.custom.json");
  await writeFile(
    customConfigPath,
    JSON.stringify(
      {
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
