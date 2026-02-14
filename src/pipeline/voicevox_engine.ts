interface VoicevoxQueryMoraLike {
  text?: unknown;
  vowel?: unknown;
  vowelLength?: unknown;
  vowel_length?: unknown;
  pitch?: unknown;
  consonant?: unknown;
  consonantLength?: unknown;
  consonant_length?: unknown;
}

interface VoicevoxQueryAccentPhraseLike {
  moras?: unknown;
  accent?: unknown;
  pauseMora?: unknown;
  pause_mora?: unknown;
  isInterrogative?: unknown;
  is_interrogative?: unknown;
}

interface VoicevoxQueryLike {
  accentPhrases?: unknown;
  accent_phrases?: unknown;
  speedScale?: unknown;
  pitchScale?: unknown;
  intonationScale?: unknown;
  volumeScale?: unknown;
  pauseLengthScale?: unknown;
  prePhonemeLength?: unknown;
  postPhonemeLength?: unknown;
  outputSamplingRate?: unknown;
  outputStereo?: unknown;
  kana?: unknown;
}

export interface VoicevoxQueryMora {
  text: string;
  vowel: string;
  vowelLength: number;
  pitch: number;
  consonant?: string;
  consonantLength?: number;
}

export interface VoicevoxQueryAccentPhrase {
  moras: VoicevoxQueryMora[];
  accent: number;
  pauseMora?: VoicevoxQueryMora;
  isInterrogative?: boolean;
}

export interface VoicevoxAudioQuery {
  accentPhrases: VoicevoxQueryAccentPhrase[];
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
}

interface EngineSynthesisMora {
  text: string;
  consonant?: string;
  consonant_length?: number;
  vowel: string;
  vowel_length: number;
  pitch: number;
}

interface EngineSynthesisAccentPhrase {
  moras: EngineSynthesisMora[];
  accent: number;
  pause_mora?: EngineSynthesisMora;
  is_interrogative?: boolean;
}

interface EngineSynthesisAudioQuery {
  accent_phrases: EngineSynthesisAccentPhrase[];
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  pauseLengthScale: number;
  prePhonemeLength: number;
  postPhonemeLength: number;
  outputSamplingRate: number;
  outputStereo: boolean;
  kana?: string;
}

export interface VoicevoxRequestRetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  timeoutMs: number;
}

export interface VoicevoxRequestErrorOptions {
  operation: "audio_query" | "synthesis";
  audioKey: string;
  endpoint: string;
  attempts: number;
  statusCode?: number;
  retriable: boolean;
}

export class VoicevoxRequestError extends Error {
  readonly operation: "audio_query" | "synthesis";
  readonly audioKey: string;
  readonly endpoint: string;
  readonly attempts: number;
  readonly statusCode?: number;
  readonly retriable: boolean;

  constructor(message: string, options: VoicevoxRequestErrorOptions) {
    super(message);
    this.name = "VoicevoxRequestError";
    this.operation = options.operation;
    this.audioKey = options.audioKey;
    this.endpoint = options.endpoint;
    this.attempts = options.attempts;
    this.statusCode = options.statusCode;
    this.retriable = options.retriable;
  }
}

export const DEFAULT_VOICEVOX_API_URL = "http://127.0.0.1:50021";
const AUTO_DETECT_VOICEVOX_API_URLS = [
  "http://127.0.0.1:50021",
  "http://voicevox-engine:50021",
  "http://host.docker.internal:50021",
  "http://narrative-vox-voicevox-engine:50021"
] as const;
const DEFAULT_ENGINE_OUTPUT_SAMPLING_RATE = 24000;
export const DEFAULT_VOICEVOX_RETRY_CONFIG: VoicevoxRequestRetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 400,
  timeoutMs: 15000
};

export function normalizeVoicevoxApiUrl(value?: string): string {
  const url = (value || DEFAULT_VOICEVOX_API_URL).trim();
  if (!url) {
    return DEFAULT_VOICEVOX_API_URL;
  }
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function isVoicevoxApiReachable(url: string, timeoutMs = 2000): Promise<boolean> {
  const normalized = normalizeVoicevoxApiUrl(url);
  const versionEndpoint = new URL("/version", normalized);
  try {
    const response = await fetchWithTimeout(versionEndpoint, { method: "GET" }, timeoutMs);
    if (response.ok) {
      return true;
    }
  } catch {
    // ignore and fallback
  }

  const speakersEndpoint = new URL("/speakers", normalized);
  try {
    const response = await fetchWithTimeout(speakersEndpoint, { method: "GET" }, timeoutMs);
    if (response.ok) {
      return true;
    }
  } catch {
    // ignore and return false
  }
  return false;
}

export async function resolveVoicevoxApiUrl(value?: string): Promise<string> {
  if (value) {
    return normalizeVoicevoxApiUrl(value);
  }

  const envUrl = process.env.VOICEVOX_URL;
  const candidates = [
    ...(envUrl ? [envUrl] : []),
    ...AUTO_DETECT_VOICEVOX_API_URLS
  ].map((entry) => normalizeVoicevoxApiUrl(entry));

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (await isVoicevoxApiReachable(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `VOICEVOX Engine is not reachable. Tried: ${uniqueCandidates.join(", ")}. Use --voicevox-url explicitly if needed.`
  );
}

function isRetriableStatus(statusCode: number): boolean {
  return statusCode >= 500 && statusCode <= 599;
}

function backoffMs(attempt: number, baseDelayMs: number): number {
  const exponent = Math.max(0, attempt - 1);
  return baseDelayMs * 2 ** exponent;
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeMora(raw: VoicevoxQueryMoraLike): VoicevoxQueryMora {
  const vowelLength = raw.vowelLength ?? raw.vowel_length;
  const consonantLength = raw.consonantLength ?? raw.consonant_length;
  return {
    text: String(raw.text ?? ""),
    vowel: String(raw.vowel ?? ""),
    vowelLength: typeof vowelLength === "number" ? vowelLength : 0,
    pitch: typeof raw.pitch === "number" ? raw.pitch : 0,
    ...(typeof raw.consonant === "string" ? { consonant: raw.consonant } : {}),
    ...(typeof consonantLength === "number" ? { consonantLength } : {})
  };
}

function normalizeAccentPhrase(raw: VoicevoxQueryAccentPhraseLike): VoicevoxQueryAccentPhrase {
  const pauseMora = raw.pauseMora ?? raw.pause_mora;
  const mapped: VoicevoxQueryAccentPhrase = {
    moras: Array.isArray(raw.moras)
      ? raw.moras.map((mora) => normalizeMora((mora ?? {}) as VoicevoxQueryMoraLike))
      : [],
    accent: typeof raw.accent === "number" ? raw.accent : 1,
    ...(typeof raw.isInterrogative === "boolean"
      ? { isInterrogative: raw.isInterrogative }
      : typeof raw.is_interrogative === "boolean"
        ? { isInterrogative: raw.is_interrogative }
        : {})
  };
  if (pauseMora && typeof pauseMora === "object") {
    mapped.pauseMora = normalizeMora(pauseMora as VoicevoxQueryMoraLike);
  }
  return mapped;
}

function normalizeAudioQueryResponse(raw: VoicevoxQueryLike): VoicevoxAudioQuery {
  const accentSource = raw.accentPhrases ?? raw.accent_phrases;
  const accentPhrases = Array.isArray(accentSource)
    ? accentSource.map((phrase) => normalizeAccentPhrase((phrase ?? {}) as VoicevoxQueryAccentPhraseLike))
    : [];

  return {
    accentPhrases,
    speedScale: typeof raw.speedScale === "number" ? raw.speedScale : 1,
    pitchScale: typeof raw.pitchScale === "number" ? raw.pitchScale : 0,
    intonationScale: typeof raw.intonationScale === "number" ? raw.intonationScale : 1,
    volumeScale: typeof raw.volumeScale === "number" ? raw.volumeScale : 1,
    pauseLengthScale: typeof raw.pauseLengthScale === "number" ? raw.pauseLengthScale : 1,
    prePhonemeLength: typeof raw.prePhonemeLength === "number" ? raw.prePhonemeLength : 0.1,
    postPhonemeLength: typeof raw.postPhonemeLength === "number" ? raw.postPhonemeLength : 0.1,
    outputSamplingRate:
      typeof raw.outputSamplingRate === "number" || raw.outputSamplingRate === "engineDefault"
        ? raw.outputSamplingRate
        : "engineDefault",
    outputStereo: typeof raw.outputStereo === "boolean" ? raw.outputStereo : false,
    ...(typeof raw.kana === "string" ? { kana: raw.kana } : {})
  };
}

function toEngineMora(mora: VoicevoxQueryMora): EngineSynthesisMora {
  return {
    text: mora.text,
    vowel: mora.vowel,
    vowel_length: mora.vowelLength,
    pitch: mora.pitch,
    ...(typeof mora.consonant === "string" ? { consonant: mora.consonant } : {}),
    ...(typeof mora.consonantLength === "number" ? { consonant_length: mora.consonantLength } : {})
  };
}

function toEngineAudioQueryPayload(query: VoicevoxAudioQuery): EngineSynthesisAudioQuery {
  return {
    accent_phrases: query.accentPhrases.map((phrase) => ({
      moras: phrase.moras.map((mora) => toEngineMora(mora)),
      accent: phrase.accent,
      ...(phrase.pauseMora ? { pause_mora: toEngineMora(phrase.pauseMora) } : {}),
      ...(typeof phrase.isInterrogative === "boolean"
        ? { is_interrogative: phrase.isInterrogative }
        : {})
    })),
    speedScale: query.speedScale,
    pitchScale: query.pitchScale,
    intonationScale: query.intonationScale,
    volumeScale: query.volumeScale,
    pauseLengthScale: query.pauseLengthScale,
    prePhonemeLength: query.prePhonemeLength,
    postPhonemeLength: query.postPhonemeLength,
    outputSamplingRate:
      query.outputSamplingRate === "engineDefault"
        ? DEFAULT_ENGINE_OUTPUT_SAMPLING_RATE
        : query.outputSamplingRate,
    outputStereo: query.outputStereo,
    ...(typeof query.kana === "string" ? { kana: query.kana } : {})
  };
}

interface RetryRequestOptions {
  endpoint: URL;
  method: "POST";
  operation: "audio_query" | "synthesis";
  audioKey: string;
  body?: string;
  contentType?: string;
  retryConfig?: Partial<VoicevoxRequestRetryConfig>;
}

interface RetryRequestResult {
  response: Response;
  attempts: number;
}

async function requestWithRetry({
  endpoint,
  method,
  operation,
  audioKey,
  body,
  contentType,
  retryConfig
}: RetryRequestOptions): Promise<RetryRequestResult> {
  const mergedConfig: VoicevoxRequestRetryConfig = {
    maxAttempts: retryConfig?.maxAttempts ?? DEFAULT_VOICEVOX_RETRY_CONFIG.maxAttempts,
    baseDelayMs: retryConfig?.baseDelayMs ?? DEFAULT_VOICEVOX_RETRY_CONFIG.baseDelayMs,
    timeoutMs: retryConfig?.timeoutMs ?? DEFAULT_VOICEVOX_RETRY_CONFIG.timeoutMs
  };

  let attempts = 0;
  while (attempts < mergedConfig.maxAttempts) {
    attempts += 1;

    let response: Response;
    try {
      response = await fetchWithTimeout(
        endpoint,
        {
          method,
          ...(body === undefined ? {} : { body }),
          ...(contentType ? { headers: { "content-type": contentType } } : {})
        },
        mergedConfig.timeoutMs
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const retriable = attempts < mergedConfig.maxAttempts;
      if (retriable) {
        await wait(backoffMs(attempts, mergedConfig.baseDelayMs));
        continue;
      }
      throw new VoicevoxRequestError(
        `Failed to call VOICEVOX ${operation} for ${audioKey} at ${endpoint.toString()}: ${reason}`,
        {
          operation,
          audioKey,
          endpoint: endpoint.toString(),
          attempts,
          retriable: false
        }
      );
    }

    if (!response.ok) {
      const statusCode = response.status;
      const retriable = isRetriableStatus(statusCode) && attempts < mergedConfig.maxAttempts;
      if (retriable) {
        await wait(backoffMs(attempts, mergedConfig.baseDelayMs));
        continue;
      }

      throw new VoicevoxRequestError(
        `VOICEVOX ${operation} returned ${response.status} ${response.statusText} for ${audioKey} at ${endpoint.toString()}`,
        {
          operation,
          audioKey,
          endpoint: endpoint.toString(),
          attempts,
          statusCode,
          retriable: false
        }
      );
    }

    return { response, attempts };
  }

  throw new VoicevoxRequestError(
    `Failed to call VOICEVOX ${operation} for ${audioKey} at ${endpoint.toString()}`,
    {
      operation,
      audioKey,
      endpoint: endpoint.toString(),
      attempts: mergedConfig.maxAttempts,
      retriable: false
    }
  );
}

interface FetchAudioQueryOptions {
  voicevoxApiUrl: string;
  text: string;
  styleId: number;
  audioKey: string;
  retryConfig?: Partial<VoicevoxRequestRetryConfig>;
}

interface FetchAudioQueryResult {
  query: VoicevoxAudioQuery;
  attempts: number;
}

export async function fetchAudioQueryFromEngine({
  voicevoxApiUrl,
  text,
  styleId,
  audioKey,
  retryConfig
}: FetchAudioQueryOptions): Promise<FetchAudioQueryResult> {
  const endpoint = new URL("/audio_query", normalizeVoicevoxApiUrl(voicevoxApiUrl));
  endpoint.searchParams.set("text", text);
  endpoint.searchParams.set("speaker", String(styleId));

  const { response, attempts } = await requestWithRetry({
    endpoint,
    method: "POST",
    operation: "audio_query",
    audioKey,
    retryConfig
  });

  const raw = (await response.json()) as VoicevoxQueryLike;
  const query = normalizeAudioQueryResponse(raw);
  if (!Array.isArray(query.accentPhrases) || query.accentPhrases.length === 0) {
    throw new VoicevoxRequestError(
      `VOICEVOX audio_query produced empty accentPhrases for ${audioKey}`,
      {
        operation: "audio_query",
        audioKey,
        endpoint: endpoint.toString(),
        attempts,
        statusCode: response.status,
        retriable: false
      }
    );
  }

  return { query, attempts };
}

interface SynthesizeVoiceOptions {
  voicevoxApiUrl: string;
  styleId: number;
  audioKey: string;
  query: VoicevoxAudioQuery;
  retryConfig?: Partial<VoicevoxRequestRetryConfig>;
}

interface SynthesizeVoiceResult {
  wavData: Uint8Array;
  attempts: number;
}

export async function synthesizeVoiceFromEngine({
  voicevoxApiUrl,
  styleId,
  audioKey,
  query,
  retryConfig
}: SynthesizeVoiceOptions): Promise<SynthesizeVoiceResult> {
  const endpoint = new URL("/synthesis", normalizeVoicevoxApiUrl(voicevoxApiUrl));
  endpoint.searchParams.set("speaker", String(styleId));

  const { response, attempts } = await requestWithRetry({
    endpoint,
    method: "POST",
    operation: "synthesis",
    audioKey,
    body: JSON.stringify(toEngineAudioQueryPayload(query)),
    contentType: "application/json",
    retryConfig
  });

  const wavBuffer = await response.arrayBuffer();
  return {
    wavData: new Uint8Array(wavBuffer),
    attempts
  };
}
