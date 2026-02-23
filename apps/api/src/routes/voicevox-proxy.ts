import { Hono } from "hono";
import { config } from "../config.ts";
import { problem, STATUS_500, STATUS_503 } from "../lib/problem.ts";
import type { AppVariables } from "../types.ts";

export const voicevoxProxyRouter = new Hono<{ Variables: AppVariables }>();

const TIMEOUT_MS = 5000;

async function fetchVoicevox(path: string): Promise<Response> {
  const url = `${config.voicevoxUrl}${path}`;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  return fetch(url, { signal });
}

async function fetchVoicevoxFull(
  path: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = TIMEOUT_MS, ...fetchInit } = init;
  const url = `${config.voicevoxUrl}${path}`;
  const signal = AbortSignal.timeout(timeoutMs);
  return fetch(url, { signal, ...fetchInit });
}

/**
 * GET /api/voicevox/status
 * VOICEVOX Engineの起動状態を確認する。
 */
voicevoxProxyRouter.get("/status", async (c) => {
  try {
    const res = await fetchVoicevox("/version");
    if (!res.ok) {
      return problem(c, {
        title: "VOICEVOX Engine returned an error",
        status: STATUS_503,
        detail: `Engine responded with HTTP ${res.status}`,
        errorCode: "VOICEVOX_ENGINE_ERROR",
      });
    }
    const version = await res.text();
    return c.json({
      status: "running",
      version: version.trim().replace(/^"|"$/g, ""),
    });
  } catch (e) {
    const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
    const isNetworkError = e instanceof TypeError;
    if (isTimeout || isNetworkError) {
      return problem(c, {
        title: "VOICEVOX Engine is not reachable",
        status: STATUS_503,
        detail: isTimeout
          ? "Request timed out"
          : "Connection refused or network error",
        errorCode: "VOICEVOX_ENGINE_UNAVAILABLE",
      });
    }
    return problem(c, {
      title: "Unexpected error checking VOICEVOX status",
      status: STATUS_500,
    });
  }
});

/**
 * GET /api/voicevox/speaker_info?speaker_uuid=<uuid>
 * VOICEVOX Engineからスピーカー詳細情報（アイコン等）を取得してプロキシする。
 */
voicevoxProxyRouter.get("/speaker_info", async (c) => {
  const speakerUuid = c.req.query("speaker_uuid");
  if (!speakerUuid) {
    return problem(c, {
      title: "Missing speaker_uuid query parameter",
      status: 400 as typeof STATUS_500,
      errorCode: "MISSING_PARAMETER",
    });
  }
  try {
    const res = await fetchVoicevox(
      `/speaker_info?speaker_uuid=${encodeURIComponent(speakerUuid)}`,
    );
    if (!res.ok) {
      return problem(c, {
        title: "VOICEVOX Engine returned an error",
        status: STATUS_503,
        detail: `Engine responded with HTTP ${res.status}`,
        errorCode: "VOICEVOX_ENGINE_ERROR",
      });
    }
    const info = await res.json();
    return c.json(info);
  } catch (e) {
    const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
    const isNetworkError = e instanceof TypeError;
    if (isTimeout || isNetworkError) {
      return problem(c, {
        title: "VOICEVOX Engine is not reachable",
        status: STATUS_503,
        detail: isTimeout
          ? "Request timed out"
          : "Connection refused or network error",
        errorCode: "VOICEVOX_ENGINE_UNAVAILABLE",
      });
    }
    return problem(c, {
      title: "Unexpected error fetching speaker info",
      status: STATUS_500,
    });
  }
});

/**
 * GET /api/voicevox/speakers
 * VOICEVOX Engineからスピーカー一覧を取得してプロキシする。
 */
voicevoxProxyRouter.get("/speakers", async (c) => {
  try {
    const res = await fetchVoicevox("/speakers");
    if (!res.ok) {
      return problem(c, {
        title: "VOICEVOX Engine returned an error",
        status: STATUS_503,
        detail: `Engine responded with HTTP ${res.status}`,
        errorCode: "VOICEVOX_ENGINE_ERROR",
      });
    }
    const speakers = await res.json();
    return c.json(speakers);
  } catch (e) {
    const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
    const isNetworkError = e instanceof TypeError;
    if (isTimeout || isNetworkError) {
      return problem(c, {
        title: "VOICEVOX Engine is not reachable",
        status: STATUS_503,
        detail: isTimeout
          ? "Request timed out"
          : "Connection refused or network error",
        errorCode: "VOICEVOX_ENGINE_UNAVAILABLE",
      });
    }
    return problem(c, {
      title: "Unexpected error fetching speakers",
      status: STATUS_500,
    });
  }
});

/**
 * POST /api/voicevox/audio_query?text=...&speaker=<styleId>
 * VOICEVOX Engine の /audio_query を呼び出し、audio query JSON を返す。
 */
voicevoxProxyRouter.post("/audio_query", async (c) => {
  const text = c.req.query("text");
  const speaker = c.req.query("speaker");
  if (!text || !speaker) {
    return problem(c, {
      title: "Missing text or speaker query parameter",
      status: 400 as typeof STATUS_500,
      errorCode: "MISSING_PARAMETER",
    });
  }
  try {
    const res = await fetchVoicevoxFull(
      `/audio_query?text=${encodeURIComponent(text)}&speaker=${encodeURIComponent(speaker)}`,
      { method: "POST", timeoutMs: 15000 },
    );
    if (!res.ok) {
      return problem(c, {
        title: "VOICEVOX Engine returned an error",
        status: STATUS_503,
        detail: `Engine responded with HTTP ${res.status}`,
        errorCode: "VOICEVOX_ENGINE_ERROR",
      });
    }
    const query = await res.json();
    return c.json(query);
  } catch (e) {
    const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
    const isNetworkError = e instanceof TypeError;
    if (isTimeout || isNetworkError) {
      return problem(c, {
        title: "VOICEVOX Engine is not reachable",
        status: STATUS_503,
        detail: isTimeout
          ? "Request timed out"
          : "Connection refused or network error",
        errorCode: "VOICEVOX_ENGINE_UNAVAILABLE",
      });
    }
    return problem(c, {
      title: "Unexpected error calling audio_query",
      status: STATUS_500,
    });
  }
});

/**
 * POST /api/voicevox/synthesis?speaker=<styleId>
 * audio query JSON を受け取り、VOICEVOX Engine の /synthesis を呼び出して WAV を返す。
 */
voicevoxProxyRouter.post("/synthesis", async (c) => {
  const speaker = c.req.query("speaker");
  if (!speaker) {
    return problem(c, {
      title: "Missing speaker query parameter",
      status: 400 as typeof STATUS_500,
      errorCode: "MISSING_PARAMETER",
    });
  }
  try {
    const body = await c.req.text();
    const res = await fetchVoicevoxFull(
      `/synthesis?speaker=${encodeURIComponent(speaker)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        timeoutMs: 30000,
      },
    );
    if (!res.ok) {
      return problem(c, {
        title: "VOICEVOX Engine returned an error",
        status: STATUS_503,
        detail: `Engine responded with HTTP ${res.status}`,
        errorCode: "VOICEVOX_ENGINE_ERROR",
      });
    }
    return new Response(await res.arrayBuffer(), {
      headers: { "Content-Type": "audio/wav" },
    });
  } catch (e) {
    const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
    const isNetworkError = e instanceof TypeError;
    if (isTimeout || isNetworkError) {
      return problem(c, {
        title: "VOICEVOX Engine is not reachable",
        status: STATUS_503,
        detail: isTimeout
          ? "Request timed out"
          : "Connection refused or network error",
        errorCode: "VOICEVOX_ENGINE_UNAVAILABLE",
      });
    }
    return problem(c, {
      title: "Unexpected error calling synthesis",
      status: STATUS_500,
    });
  }
});

/**
 * POST /api/voicevox/mora_pitch?speaker=<styleId>
 * accent_phrases 配列を受け取り、accent に基づく mora pitch を再計算して返す。
 */
voicevoxProxyRouter.post("/mora_pitch", async (c) => {
  const speaker = c.req.query("speaker");
  if (!speaker) {
    return problem(c, {
      title: "Missing speaker query parameter",
      status: 400 as typeof STATUS_500,
      errorCode: "MISSING_PARAMETER",
    });
  }
  try {
    const body = await c.req.text();
    const res = await fetchVoicevoxFull(
      `/mora_pitch?speaker=${encodeURIComponent(speaker)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        timeoutMs: 15000,
      },
    );
    if (!res.ok) {
      return problem(c, {
        title: "VOICEVOX Engine returned an error",
        status: STATUS_503,
        detail: `Engine responded with HTTP ${res.status}`,
        errorCode: "VOICEVOX_ENGINE_ERROR",
      });
    }
    const data = await res.json();
    return c.json(data);
  } catch (e) {
    const isTimeout = e instanceof DOMException && e.name === "TimeoutError";
    const isNetworkError = e instanceof TypeError;
    if (isTimeout || isNetworkError) {
      return problem(c, {
        title: "VOICEVOX Engine is not reachable",
        status: STATUS_503,
        detail: isTimeout ? "Request timed out" : "Connection refused or network error",
        errorCode: "VOICEVOX_ENGINE_UNAVAILABLE",
      });
    }
    return problem(c, {
      title: "Unexpected error calling mora_pitch",
      status: STATUS_500,
    });
  }
});
