import { Hono } from "hono";
import { config } from "../config.ts";
import {
  problem,
  STATUS_400,
  STATUS_500,
  STATUS_503,
} from "../lib/problem.ts";
import { normalizeVoicevoxBaseUrl } from "../lib/voicevox-url.ts";
import type { AppVariables } from "../types.ts";

export const voicevoxProxyRouter = new Hono<{ Variables: AppVariables }>();

const TIMEOUT_MS = 5000;

type VoicevoxRequestOptions = RequestInit & {
  timeoutMs?: number;
};

function getVoicevoxBaseUrl(): string {
  try {
    return normalizeVoicevoxBaseUrl(config.voicevoxUrl);
  } catch {
    throw new Error("VOICEVOX_URL_INVALID");
  }
}

function voicevoxProblem(
  c: Parameters<typeof problem>[0],
  title: string,
  detail?: string,
): Response {
  return problem(c, {
    title,
    status: STATUS_503,
    ...(detail !== undefined && { detail }),
    errorCode: "VOICEVOX_ENGINE_ERROR",
  });
}

function voicevoxUnavailable(
  c: Parameters<typeof problem>[0],
  detail: string,
): Response {
  return problem(c, {
    title: "VOICEVOX Engine is not reachable",
    status: STATUS_503,
    detail,
    errorCode: "VOICEVOX_ENGINE_UNAVAILABLE",
  });
}

function mapVoicevoxError(
  c: Parameters<typeof problem>[0],
  error: unknown,
  fallbackTitle: string,
): Response {
  if (error instanceof Error && error.message === "VOICEVOX_URL_INVALID") {
    return voicevoxUnavailable(c, "VOICEVOX_URL is not an allowed local address");
  }
  const isTimeout = error instanceof DOMException && error.name === "TimeoutError";
  const isNetworkError = error instanceof TypeError;
  if (isTimeout || isNetworkError) {
    return voicevoxUnavailable(
      c,
      isTimeout ? "Request timed out" : "Connection refused or network error",
    );
  }
  return problem(c, {
    title: fallbackTitle,
    status: STATUS_500,
  });
}

async function fetchVoicevox(
  path: string,
  init: VoicevoxRequestOptions = {},
): Promise<Response> {
  const { timeoutMs = TIMEOUT_MS, ...fetchInit } = init;
  const url = `${getVoicevoxBaseUrl()}${path}`;
  const signal = AbortSignal.timeout(timeoutMs);
  return fetch(url, { signal, ...fetchInit });
}

async function proxyJson<T>(
  c: Parameters<typeof problem>[0],
  fallbackTitle: string,
  path: string,
  init?: VoicevoxRequestOptions,
): Promise<Response> {
  try {
    const res = await fetchVoicevox(path, init);
    if (!res.ok) {
      return voicevoxProblem(
        c,
        "VOICEVOX Engine returned an error",
        `Engine responded with HTTP ${res.status}`,
      );
    }
    return c.json((await res.json()) as T);
  } catch (error) {
    return mapVoicevoxError(c, error, fallbackTitle);
  }
}

async function proxyBinary(
  c: Parameters<typeof problem>[0],
  fallbackTitle: string,
  path: string,
  init: VoicevoxRequestOptions,
  contentType: string,
): Promise<Response> {
  try {
    const res = await fetchVoicevox(path, init);
    if (!res.ok) {
      return voicevoxProblem(
        c,
        "VOICEVOX Engine returned an error",
        `Engine responded with HTTP ${res.status}`,
      );
    }
    return new Response(await res.arrayBuffer(), {
      headers: { "Content-Type": contentType },
    });
  } catch (error) {
    return mapVoicevoxError(c, error, fallbackTitle);
  }
}

voicevoxProxyRouter.get("/status", async (c) => {
  try {
    const res = await fetchVoicevox("/version");
    if (!res.ok) {
      return voicevoxProblem(
        c,
        "VOICEVOX Engine returned an error",
        `Engine responded with HTTP ${res.status}`,
      );
    }
    const version = await res.text();
    return c.json({
      status: "running",
      version: version.trim().replace(/^"|"$/g, ""),
    });
  } catch (error) {
    return mapVoicevoxError(c, error, "Unexpected error checking VOICEVOX status");
  }
});

voicevoxProxyRouter.get("/speaker_info", async (c) => {
  const speakerUuid = c.req.query("speaker_uuid");
  if (!speakerUuid) {
    return problem(c, {
      title: "Missing speaker_uuid query parameter",
      status: STATUS_400,
      errorCode: "MISSING_PARAMETER",
    });
  }
  return proxyJson(
    c,
    "Unexpected error fetching speaker info",
    `/speaker_info?speaker_uuid=${encodeURIComponent(speakerUuid)}`,
  );
});

voicevoxProxyRouter.get("/speakers", async (c) => {
  return proxyJson(c, "Unexpected error fetching speakers", "/speakers");
});

voicevoxProxyRouter.post("/audio_query", async (c) => {
  const text = c.req.query("text");
  const speaker = c.req.query("speaker");
  if (!text || !speaker) {
    return problem(c, {
      title: "Missing text or speaker query parameter",
      status: STATUS_400,
      errorCode: "MISSING_PARAMETER",
    });
  }
  return proxyJson(
    c,
    "Unexpected error calling audio_query",
    `/audio_query?text=${encodeURIComponent(text)}&speaker=${encodeURIComponent(speaker)}`,
    { method: "POST", timeoutMs: 15000 },
  );
});

voicevoxProxyRouter.post("/synthesis", async (c) => {
  const speaker = c.req.query("speaker");
  if (!speaker) {
    return problem(c, {
      title: "Missing speaker query parameter",
      status: STATUS_400,
      errorCode: "MISSING_PARAMETER",
    });
  }
  const body = await c.req.text();
  return proxyBinary(
    c,
    "Unexpected error calling synthesis",
    `/synthesis?speaker=${encodeURIComponent(speaker)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      timeoutMs: 30000,
    },
    "audio/wav",
  );
});

voicevoxProxyRouter.post("/mora_pitch", async (c) => {
  const speaker = c.req.query("speaker");
  if (!speaker) {
    return problem(c, {
      title: "Missing speaker query parameter",
      status: STATUS_400,
      errorCode: "MISSING_PARAMETER",
    });
  }
  const body = await c.req.text();
  return proxyJson(
    c,
    "Unexpected error calling mora_pitch",
    `/mora_pitch?speaker=${encodeURIComponent(speaker)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      timeoutMs: 15000,
    },
  );
});
