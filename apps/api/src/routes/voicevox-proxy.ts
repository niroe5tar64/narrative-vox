import { Hono } from "hono";
import type { AppVariables } from "../types.ts";
import { config } from "../config.ts";
import { problem, STATUS_500, STATUS_503 } from "../lib/problem.ts";

export const voicevoxProxyRouter = new Hono<{ Variables: AppVariables }>();

const TIMEOUT_MS = 5000;

async function fetchVoicevox(path: string): Promise<Response> {
	const url = `${config.voicevoxUrl}${path}`;
	const signal = AbortSignal.timeout(TIMEOUT_MS);
	return fetch(url, { signal });
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
