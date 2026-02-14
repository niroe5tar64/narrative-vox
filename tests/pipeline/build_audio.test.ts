import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { buildAudio } from "../../src/pipeline/build_audio.ts";
import type { VoicevoxAudioQuery } from "../../src/pipeline/voicevox_engine.ts";

interface BuildAudioManifest {
  schema_version: "1.0";
  meta: {
    project_id: string;
    run_id: string;
    episode_id: string;
    source_stage5_vvproj: string;
    generated_at: string;
  };
  voicevox: {
    url: string;
    app_version: string;
  };
  parameters: {
    retry_max_attempts: number;
    retry_base_delay_ms: number;
    request_timeout_ms: number;
  };
  output: {
    merged_wav_path?: string;
  };
  utterances: Array<{
    audio_key: string;
    text: string;
    query_source: "stage5_vvproj" | "engine_audio_query";
    wav_path: string;
    status: "succeeded" | "failed";
    attempts: {
      audio_query: number;
      synthesis?: number;
    };
    error?: {
      stage: "audio_query" | "synthesis";
      message: string;
      status_code?: number;
      retriable: boolean;
    };
  }>;
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

function sampleQuery(pitchScale: number): VoicevoxAudioQuery {
  return {
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
    speedScale: 1,
    pitchScale,
    intonationScale: 1,
    volumeScale: 1,
    pauseLengthScale: 1,
    prePhonemeLength: 0.1,
    postPhonemeLength: 0.1,
    outputSamplingRate: "engineDefault",
    outputStereo: false
  };
}

function buildMockWav(samples: number[]): Buffer {
  const numChannels = 1;
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, 4, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, 4, "ascii");
  buffer.write("fmt ", 12, 4, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, 4, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i += 1) {
    buffer.writeInt16LE(samples[i], 44 + i * 2);
  }

  return buffer;
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

async function createStage5Fixture(withQuery: boolean): Promise<{
  runDir: string;
  stage5VvprojPath: string;
  query: VoicevoxAudioQuery;
}> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-audio-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-20260214-1020");
  const stage5Dir = path.join(runDir, "voicevox_project");
  await mkdir(stage5Dir, { recursive: true });

  const query = sampleQuery(0.42);
  const vvproj = {
    appVersion: "0.25.0",
    talk: {
      audioKeys: ["E01_U001"],
      audioItems: {
        E01_U001: {
          text: "これはテストです。",
          voice: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 67
          },
          ...(withQuery ? { query } : {})
        }
      }
    },
    song: {
      tpqn: 480,
      tempos: [{ position: 0, bpm: 120 }],
      timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }],
      tracks: {},
      trackOrder: []
    }
  };

  const stage5VvprojPath = path.join(stage5Dir, "E01.vvproj");
  await writeFile(stage5VvprojPath, `${JSON.stringify(vvproj, null, 2)}\n`, "utf-8");
  return { runDir, stage5VvprojPath, query };
}

async function createStage5FixtureMultiple(withQuery: boolean): Promise<{
  runDir: string;
  stage5VvprojPath: string;
}> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-audio-test-"));
  const runDir = path.join(tempRoot, "introducing-rescript", "run-20260214-1020");
  const stage5Dir = path.join(runDir, "voicevox_project");
  await mkdir(stage5Dir, { recursive: true });

  const query = sampleQuery(0.3);
  const vvproj = {
    appVersion: "0.25.0",
    talk: {
      audioKeys: ["E01_U001", "E01_U002"],
      audioItems: {
        E01_U001: {
          text: "これは1つ目のテストです。",
          voice: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 67
          },
          ...(withQuery ? { query } : {})
        },
        E01_U002: {
          text: "これは2つ目のテストです。",
          voice: {
            engineId: "074fc39e-678b-4c13-8916-ffca8d505d1d",
            speakerId: "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
            styleId: 67
          },
          ...(withQuery ? { query } : {})
        }
      }
    },
    song: {
      tpqn: 480,
      tempos: [{ position: 0, bpm: 120 }],
      timeSignatures: [{ measureNumber: 1, beats: 4, beatType: 4 }],
      tracks: {},
      trackOrder: []
    }
  };

  const stage5VvprojPath = path.join(stage5Dir, "E01.vvproj");
  await writeFile(stage5VvprojPath, `${JSON.stringify(vvproj, null, 2)}\n`, "utf-8");
  return { runDir, stage5VvprojPath };
}

function respondHealthCheck(req: IncomingMessage, res: ServerResponse): boolean {
  const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET" && requestUrl.pathname === "/version") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify("0.25.1"));
    return true;
  }
  if (req.method === "GET" && requestUrl.pathname === "/speakers") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify([]));
    return true;
  }
  return false;
}

test("build-audio uses stage5 query directly when present", async () => {
  const { runDir, stage5VvprojPath, query } = await createStage5Fixture(true);

  let audioQueryCount = 0;
  let synthesisCount = 0;
  let receivedSynthesisPitchScale = 0;
  let receivedHasAccentPhrases = false;
  let receivedHasAccentPhrasesSnake = false;
  let receivedSamplingRate: unknown = undefined;

  await withMockVoicevoxServer((req, res) => {
    if (respondHealthCheck(req, res)) {
      return;
    }
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "POST" && requestUrl.pathname === "/audio_query") {
      audioQueryCount += 1;
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "audio_query should not be called" }));
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/synthesis") {
      synthesisCount += 1;
      let body = "";
      req.setEncoding("utf-8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        receivedSynthesisPitchScale = Number(parsed.pitchScale);
        receivedHasAccentPhrases = "accentPhrases" in parsed;
        receivedHasAccentPhrasesSnake = "accent_phrases" in parsed;
        receivedSamplingRate = parsed.outputSamplingRate;
        res.writeHead(200, { "content-type": "audio/wav" });
        res.end(buildMockWav([100, 200, 300, 400]));
      });
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  }, async (voicevoxApiUrl) => {
    const result = await buildAudio({
      stage5VvprojPath,
      runDir,
      voicevoxApiUrl
    });

    assert.equal(result.failureCount, 0);
    assert.equal(audioQueryCount, 0);
    assert.equal(synthesisCount, 1);
    assert.equal(receivedSynthesisPitchScale, query.pitchScale);
    assert.equal(receivedHasAccentPhrases, false);
    assert.equal(receivedHasAccentPhrasesSnake, true);
    assert.equal(receivedSamplingRate, 24000);

    const manifest = JSON.parse(await readFile(result.manifestPath, "utf-8")) as BuildAudioManifest;
    assert.equal(manifest.summary.failed, 0);
    assert.equal(manifest.utterances[0]?.query_source, "stage5_vvproj");
    assert.equal(manifest.utterances[0]?.attempts.audio_query, 0);
    assert.equal(manifest.output.merged_wav_path, path.join("audio", "E01.wav"));
    assert.equal(manifest.utterances[0]?.wav_path, path.join("audio", "E01.wav"));
    const mergedWav = await readFile(path.join(runDir, "audio", "E01.wav"));
    assert.equal(mergedWav.length > 44, true);
  });
});

test("build-audio falls back to audio_query when stage5 query is missing", async () => {
  const { runDir, stage5VvprojPath } = await createStage5Fixture(false);

  let audioQueryCount = 0;
  await withMockVoicevoxServer((req, res) => {
    if (respondHealthCheck(req, res)) {
      return;
    }
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "POST" && requestUrl.pathname === "/audio_query") {
      audioQueryCount += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(sampleQuery(0)));
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/synthesis") {
      res.writeHead(200, { "content-type": "audio/wav" });
      res.end(buildMockWav([10, 20, 30, 40]));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  }, async (voicevoxApiUrl) => {
    const result = await buildAudio({
      stage5VvprojPath,
      runDir,
      voicevoxApiUrl
    });

    assert.equal(result.failureCount, 0);
    assert.equal(audioQueryCount, 1);

    const manifest = JSON.parse(await readFile(result.manifestPath, "utf-8")) as BuildAudioManifest;
    assert.equal(manifest.summary.failed, 0);
    assert.equal(manifest.utterances[0]?.query_source, "engine_audio_query");
    assert.equal(manifest.utterances[0]?.attempts.audio_query, 1);
  });
});

test("build-audio retries 5xx and eventually succeeds", async () => {
  const { runDir, stage5VvprojPath } = await createStage5Fixture(false);

  let audioQueryCount = 0;
  await withMockVoicevoxServer((req, res) => {
    if (respondHealthCheck(req, res)) {
      return;
    }
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "POST" && requestUrl.pathname === "/audio_query") {
      audioQueryCount += 1;
      if (audioQueryCount === 1) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "temporary" }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(sampleQuery(0)));
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/synthesis") {
      res.writeHead(200, { "content-type": "audio/wav" });
      res.end(buildMockWav([1, 2, 3, 4]));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  }, async (voicevoxApiUrl) => {
    const result = await buildAudio({
      stage5VvprojPath,
      runDir,
      voicevoxApiUrl
    });

    assert.equal(result.failureCount, 0);
    assert.equal(audioQueryCount, 2);

    const manifest = JSON.parse(await readFile(result.manifestPath, "utf-8")) as BuildAudioManifest;
    assert.equal(manifest.utterances[0]?.attempts.audio_query, 2);
  });
});

test("build-audio does not retry 4xx and records failure in manifest", async () => {
  const { runDir, stage5VvprojPath } = await createStage5Fixture(false);

  let audioQueryCount = 0;
  await withMockVoicevoxServer((req, res) => {
    if (respondHealthCheck(req, res)) {
      return;
    }
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "POST" && requestUrl.pathname === "/audio_query") {
      audioQueryCount += 1;
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "bad request" }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  }, async (voicevoxApiUrl) => {
    const result = await buildAudio({
      stage5VvprojPath,
      runDir,
      voicevoxApiUrl
    });

    assert.equal(result.successCount, 0);
    assert.equal(result.failureCount, 1);
    assert.equal(audioQueryCount, 1);
    assert.equal(result.failures[0]?.stage, "audio_query");
    assert.equal(result.failures[0]?.statusCode, 400);

    const manifest = JSON.parse(await readFile(result.manifestPath, "utf-8")) as BuildAudioManifest;
    assert.equal(manifest.summary.failed, 1);
    assert.equal(manifest.utterances[0]?.status, "failed");
    assert.equal(manifest.utterances[0]?.error?.stage, "audio_query");
  });
});

test("build-audio manifest keeps major values stable for same input", async () => {
  const { runDir, stage5VvprojPath } = await createStage5Fixture(true);

  await withMockVoicevoxServer((req, res) => {
    if (respondHealthCheck(req, res)) {
      return;
    }
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "POST" && requestUrl.pathname === "/synthesis") {
      res.writeHead(200, { "content-type": "audio/wav" });
      res.end(buildMockWav([7, 8, 9, 10]));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  }, async (voicevoxApiUrl) => {
    const first = await buildAudio({
      stage5VvprojPath,
      runDir,
      voicevoxApiUrl
    });
    const firstManifest = JSON.parse(await readFile(first.manifestPath, "utf-8")) as BuildAudioManifest;

    const second = await buildAudio({
      stage5VvprojPath,
      runDir,
      voicevoxApiUrl
    });
    const secondManifest = JSON.parse(await readFile(second.manifestPath, "utf-8")) as BuildAudioManifest;

    const pickMajor = (manifest: BuildAudioManifest) => ({
      meta: {
        project_id: manifest.meta.project_id,
        run_id: manifest.meta.run_id,
        episode_id: manifest.meta.episode_id,
        source_stage5_vvproj: manifest.meta.source_stage5_vvproj
      },
      voicevox: manifest.voicevox,
      parameters: manifest.parameters,
      output: manifest.output,
      utterances: manifest.utterances,
      summary: manifest.summary
    });

    assert.deepEqual(pickMajor(secondManifest), pickMajor(firstManifest));
  });
});

test("build-audio outputs one merged wav for multiple utterances", async () => {
  const { runDir, stage5VvprojPath } = await createStage5FixtureMultiple(true);

  let synthesisCount = 0;
  await withMockVoicevoxServer((req, res) => {
    if (respondHealthCheck(req, res)) {
      return;
    }
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");

    if (req.method === "POST" && requestUrl.pathname === "/synthesis") {
      synthesisCount += 1;
      res.writeHead(200, { "content-type": "audio/wav" });
      if (synthesisCount === 1) {
        res.end(buildMockWav([100, 200, 300, 400]));
        return;
      }
      res.end(buildMockWav([500, 600, 700, 800]));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  }, async (voicevoxApiUrl) => {
    const result = await buildAudio({
      stage5VvprojPath,
      runDir,
      voicevoxApiUrl
    });

    assert.equal(result.failureCount, 0);
    assert.equal(synthesisCount, 2);

    const mergedPath = path.join(runDir, "audio", "E01.wav");
    const mergedWav = await readFile(mergedPath);
    assert.equal(mergedWav.length, 44 + 16);

    const manifest = JSON.parse(await readFile(result.manifestPath, "utf-8")) as BuildAudioManifest;
    assert.equal(manifest.summary.total, 2);
    assert.equal(manifest.output.merged_wav_path, path.join("audio", "E01.wav"));
    assert.equal(manifest.utterances[0]?.wav_path, path.join("audio", "E01.wav"));
    assert.equal(manifest.utterances[1]?.wav_path, path.join("audio", "E01.wav"));
  });
});
