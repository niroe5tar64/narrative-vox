import { mkdir, readdir, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { SchemaPaths } from "../shared/schema_paths.ts";
import { loadJson } from "../shared/json.ts";
import {
  DEFAULT_VOICEVOX_RETRY_CONFIG,
  VoicevoxRequestError,
  fetchAudioQueryFromEngine,
  resolveVoicevoxApiUrl,
  synthesizeVoiceFromEngine,
  type VoicevoxAudioQuery
} from "./voicevox_engine.ts";

interface Stage5AudioItem {
  text: string;
  voice: {
    engineId: string;
    speakerId: string;
    styleId: number;
  };
  query?: VoicevoxAudioQuery;
}

interface Stage5VoicevoxProjectData {
  appVersion: string;
  talk: {
    audioKeys: string[];
    audioItems: Record<string, Stage5AudioItem>;
  };
}

interface BuildAudioOptions {
  stage5VvprojPath: string;
  runDir?: string;
  voicevoxApiUrl?: string;
}

interface BuildAudioFailure {
  audioKey: string;
  stage: "audio_query" | "synthesis";
  message: string;
  statusCode?: number;
  attempts: number;
  retriable: boolean;
}

interface BuildAudioResult {
  manifestPath: string;
  audioDir: string;
  mergedWavPath?: string;
  episodeId: string;
  utteranceCount: number;
  successCount: number;
  failureCount: number;
  failures: BuildAudioFailure[];
}

interface BuildAudioManifestEntry {
  audio_key: string;
  text: string;
  voice: {
    engineId: string;
    speakerId: string;
    styleId: number;
  };
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
}

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
  utterances: BuildAudioManifestEntry[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
}

interface ParsedWav {
  fmtChunkData: Uint8Array;
  dataChunkData: Uint8Array;
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
}

function readAscii(buffer: Uint8Array, start: number, end: number): string {
  return Buffer.from(buffer.slice(start, end)).toString("ascii");
}

function parseWavBytes(wavData: Uint8Array): ParsedWav {
  if (wavData.length < 44) {
    throw new Error("WAV data is too short");
  }
  if (readAscii(wavData, 0, 4) !== "RIFF" || readAscii(wavData, 8, 12) !== "WAVE") {
    throw new Error("Invalid WAV header");
  }

  const view = new DataView(wavData.buffer, wavData.byteOffset, wavData.byteLength);
  let offset = 12;
  let fmtChunkData: Uint8Array | undefined = undefined;
  let dataChunkData: Uint8Array | undefined = undefined;
  let audioFormat = 0;
  let numChannels = 0;
  let sampleRate = 0;
  let byteRate = 0;
  let blockAlign = 0;
  let bitsPerSample = 0;

  while (offset + 8 <= wavData.length) {
    const chunkId = readAscii(wavData, offset, offset + 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = chunkDataStart + chunkSize;
    if (chunkDataEnd > wavData.length) {
      break;
    }

    if (chunkId === "fmt ") {
      fmtChunkData = wavData.slice(chunkDataStart, chunkDataEnd);
      if (fmtChunkData.length < 16) {
        throw new Error("Invalid WAV fmt chunk");
      }
      const fmtView = new DataView(
        fmtChunkData.buffer,
        fmtChunkData.byteOffset,
        fmtChunkData.byteLength
      );
      audioFormat = fmtView.getUint16(0, true);
      numChannels = fmtView.getUint16(2, true);
      sampleRate = fmtView.getUint32(4, true);
      byteRate = fmtView.getUint32(8, true);
      blockAlign = fmtView.getUint16(12, true);
      bitsPerSample = fmtView.getUint16(14, true);
    } else if (chunkId === "data") {
      dataChunkData = wavData.slice(chunkDataStart, chunkDataEnd);
    }

    offset = chunkDataEnd + (chunkSize % 2 === 1 ? 1 : 0);
  }

  if (!fmtChunkData || !dataChunkData) {
    throw new Error("WAV fmt/data chunk was not found");
  }

  return {
    fmtChunkData,
    dataChunkData,
    audioFormat,
    numChannels,
    sampleRate,
    byteRate,
    blockAlign,
    bitsPerSample
  };
}

function concatWavSegments(segments: Uint8Array[]): Uint8Array {
  if (segments.length === 0) {
    throw new Error("No WAV segments to merge");
  }

  const parsed = segments.map((segment) => parseWavBytes(segment));
  const first = parsed[0];
  for (let i = 1; i < parsed.length; i += 1) {
    const current = parsed[i];
    if (
      first.audioFormat !== current.audioFormat ||
      first.numChannels !== current.numChannels ||
      first.sampleRate !== current.sampleRate ||
      first.byteRate !== current.byteRate ||
      first.blockAlign !== current.blockAlign ||
      first.bitsPerSample !== current.bitsPerSample
    ) {
      throw new Error("WAV segments have different audio formats and cannot be merged");
    }
  }

  const dataSize = parsed.reduce((sum, entry) => sum + entry.dataChunkData.length, 0);
  const fmtSize = first.fmtChunkData.length;
  const totalSize = 12 + (8 + fmtSize) + (8 + dataSize);
  const merged = new Uint8Array(totalSize);
  const mergedView = new DataView(merged.buffer);

  merged.set(Buffer.from("RIFF"), 0);
  mergedView.setUint32(4, totalSize - 8, true);
  merged.set(Buffer.from("WAVE"), 8);
  merged.set(Buffer.from("fmt "), 12);
  mergedView.setUint32(16, fmtSize, true);
  merged.set(first.fmtChunkData, 20);

  const dataChunkOffset = 20 + fmtSize;
  merged.set(Buffer.from("data"), dataChunkOffset);
  mergedView.setUint32(dataChunkOffset + 4, dataSize, true);

  let writeOffset = dataChunkOffset + 8;
  for (const entry of parsed) {
    merged.set(entry.dataChunkData, writeOffset);
    writeOffset += entry.dataChunkData.length;
  }

  return merged;
}

function inferRunDirFromVvprojPath(stage5VvprojPath: string): string | undefined {
  const vvprojDir = path.dirname(path.resolve(stage5VvprojPath));
  if (path.basename(vvprojDir) !== "voicevox_project") {
    return undefined;
  }
  return path.dirname(vvprojDir);
}

function inferProjectAndRunIds(runDir: string): { projectId: string; runId: string } {
  const runIdCandidate = path.basename(runDir);
  const runId = /^run-\d{8}-\d{4}$/.test(runIdCandidate) ? runIdCandidate : "unknown";
  const projectIdCandidate = path.basename(path.dirname(runDir));
  const projectId = projectIdCandidate || "unknown";
  return { projectId, runId };
}

function inferEpisodeId(stage5VvprojPath: string, project: Stage5VoicevoxProjectData): string {
  const fileStem = path.basename(stage5VvprojPath, path.extname(stage5VvprojPath));
  if (fileStem) {
    return fileStem;
  }
  const firstKey = project.talk.audioKeys[0] ?? "";
  return firstKey.split("_")[0] || "unknown";
}

function toFailure(
  error: unknown,
  audioKey: string,
  fallbackStage: "audio_query" | "synthesis"
): BuildAudioFailure {
  if (error instanceof VoicevoxRequestError) {
    return {
      audioKey,
      stage: error.operation,
      message: error.message,
      statusCode: error.statusCode,
      attempts: error.attempts,
      retriable: error.retriable
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    audioKey,
    stage: fallbackStage,
    message,
    attempts: 1,
    retriable: false
  };
}

async function cleanupEpisodeAudioOutputs(audioDir: string, episodeId: string): Promise<void> {
  const entries = await readdir(audioDir, { withFileTypes: true });
  const fileNamesToDelete = new Set<string>([`${episodeId}.wav`]);

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name.startsWith(`${episodeId}_`) && entry.name.endsWith(".wav")) {
      fileNamesToDelete.add(entry.name);
    }
  }

  await Promise.all(
    [...fileNamesToDelete].map(async (fileName) => {
      const filePath = path.join(audioDir, fileName);
      try {
        await unlink(filePath);
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError?.code !== "ENOENT") {
          throw error;
        }
      }
    })
  );
}

export async function buildAudio({
  stage5VvprojPath,
  runDir,
  voicevoxApiUrl
}: BuildAudioOptions): Promise<BuildAudioResult> {
  const resolvedStage5VvprojPath = path.resolve(stage5VvprojPath);
  const inferredRunDir = runDir
    ? path.resolve(runDir)
    : inferRunDirFromVvprojPath(resolvedStage5VvprojPath);
  if (!inferredRunDir) {
    throw new Error(
      "Could not infer run directory from --stage5-vvproj path. Expected .../voicevox_project/... or pass --run-dir explicitly."
    );
  }
  const resolvedRunDir = inferredRunDir;
  const resolvedVoicevoxApiUrl = await resolveVoicevoxApiUrl(voicevoxApiUrl);

  const stage5Data = await loadJson<Stage5VoicevoxProjectData>(
    resolvedStage5VvprojPath,
    SchemaPaths.voicevoxProjectImport
  );

  const { projectId, runId } = inferProjectAndRunIds(resolvedRunDir);
  const episodeId = inferEpisodeId(resolvedStage5VvprojPath, stage5Data);

  const audioDir = path.join(resolvedRunDir, "audio");
  const audioQueriesDir = path.join(resolvedRunDir, "audio_queries");
  const mergedWavRelativePath = path.join("audio", `${episodeId}.wav`);
  const mergedWavPath = path.join(resolvedRunDir, mergedWavRelativePath);
  await mkdir(audioDir, { recursive: true });
  await rm(audioQueriesDir, { recursive: true, force: true });
  await cleanupEpisodeAudioOutputs(audioDir, episodeId);

  const failures: BuildAudioFailure[] = [];
  const manifestEntries: BuildAudioManifestEntry[] = [];
  const successfulWavSegments: Uint8Array[] = [];

  for (const audioKey of stage5Data.talk.audioKeys) {
    const audioItem = stage5Data.talk.audioItems[audioKey];
    if (!audioItem) {
      const failure = toFailure(
        new Error(`Missing audio item for key: ${audioKey}`),
        audioKey,
        "audio_query"
      );
      failures.push(failure);
      manifestEntries.push({
        audio_key: audioKey,
        text: "",
        voice: {
          engineId: "",
          speakerId: "",
          styleId: 0
        },
        query_source: "engine_audio_query",
        wav_path: mergedWavRelativePath,
        status: "failed",
        attempts: {
          audio_query: failure.attempts
        },
        error: {
          stage: failure.stage,
          message: failure.message,
          retriable: failure.retriable
        }
      });
      continue;
    }

    let querySource: "stage5_vvproj" | "engine_audio_query" = "stage5_vvproj";
    let queryAttempts = 0;
    let resolvedQuery: VoicevoxAudioQuery | undefined = undefined;

    try {
      if (audioItem.query) {
        resolvedQuery = audioItem.query;
        querySource = "stage5_vvproj";
      } else {
        const { query, attempts } = await fetchAudioQueryFromEngine({
          voicevoxApiUrl: resolvedVoicevoxApiUrl,
          text: audioItem.text,
          styleId: audioItem.voice.styleId,
          audioKey,
          retryConfig: DEFAULT_VOICEVOX_RETRY_CONFIG
        });
        resolvedQuery = query;
        querySource = "engine_audio_query";
        queryAttempts = attempts;
      }

      const { wavData, attempts: synthesisAttempts } = await synthesizeVoiceFromEngine({
        voicevoxApiUrl: resolvedVoicevoxApiUrl,
        styleId: audioItem.voice.styleId,
        audioKey,
        query: resolvedQuery,
        retryConfig: DEFAULT_VOICEVOX_RETRY_CONFIG
      });
      successfulWavSegments.push(wavData);

      manifestEntries.push({
        audio_key: audioKey,
        text: audioItem.text,
        voice: audioItem.voice,
        query_source: querySource,
        wav_path: mergedWavRelativePath,
        status: "succeeded",
        attempts: {
          audio_query: queryAttempts,
          synthesis: synthesisAttempts
        }
      });
    } catch (error) {
      const failure = toFailure(error, audioKey, resolvedQuery ? "synthesis" : "audio_query");
      failures.push(failure);

      manifestEntries.push({
        audio_key: audioKey,
        text: audioItem.text,
        voice: audioItem.voice,
        query_source: querySource,
        wav_path: mergedWavRelativePath,
        status: "failed",
        attempts: {
          audio_query: queryAttempts,
          ...(failure.stage === "synthesis" ? { synthesis: failure.attempts } : {})
        },
        error: {
          stage: failure.stage,
          message: failure.message,
          ...(typeof failure.statusCode === "number" ? { status_code: failure.statusCode } : {}),
          retriable: failure.retriable
        }
      });
    }
  }

  const successCount = manifestEntries.filter((entry) => entry.status === "succeeded").length;
  const failureCount = failures.length;
  if (successfulWavSegments.length > 0) {
    const mergedWavData = concatWavSegments(successfulWavSegments);
    await writeFile(mergedWavPath, Buffer.from(mergedWavData));
  }

  const manifest: BuildAudioManifest = {
    schema_version: "1.0",
    meta: {
      project_id: projectId,
      run_id: runId,
      episode_id: episodeId,
      source_stage5_vvproj: path.relative(resolvedRunDir, resolvedStage5VvprojPath),
      generated_at: new Date().toISOString()
    },
    voicevox: {
      url: resolvedVoicevoxApiUrl,
      app_version: stage5Data.appVersion
    },
    parameters: {
      retry_max_attempts: DEFAULT_VOICEVOX_RETRY_CONFIG.maxAttempts,
      retry_base_delay_ms: DEFAULT_VOICEVOX_RETRY_CONFIG.baseDelayMs,
      request_timeout_ms: DEFAULT_VOICEVOX_RETRY_CONFIG.timeoutMs
    },
    output: {
      ...(successfulWavSegments.length > 0 ? { merged_wav_path: mergedWavRelativePath } : {})
    },
    utterances: manifestEntries,
    summary: {
      total: stage5Data.talk.audioKeys.length,
      succeeded: successCount,
      failed: failureCount
    }
  };

  const manifestPath = path.join(audioDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  return {
    manifestPath,
    audioDir,
    ...(successfulWavSegments.length > 0 ? { mergedWavPath } : {}),
    episodeId,
    utteranceCount: stage5Data.talk.audioKeys.length,
    successCount,
    failureCount,
    failures
  };
}
