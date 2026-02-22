import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import { syncUserDict } from "@narrative-vox/application/dict-sync.ts";

function createMockVoicevoxServer(options?: {
	existingDict?: Record<string, unknown>;
	addFailSurface?: string;
}) {
	const existingDict = options?.existingDict ?? {};
	const calls: { method: string; url: string; body?: string }[] = [];

	const server = createServer(
		async (req: IncomingMessage, res: ServerResponse) => {
			const url = req.url ?? "";
			const method = req.method ?? "GET";

			let body = "";
			for await (const chunk of req) {
				body += chunk;
			}
			calls.push({ method, url, body: body || undefined });

			if (method === "GET" && url === "/user_dict") {
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify(existingDict));
				return;
			}

			if (method === "DELETE" && url.startsWith("/user_dict_word/")) {
				res.writeHead(204);
				res.end();
				return;
			}

			if (method === "POST" && url.startsWith("/user_dict_word")) {
				const parsedUrl = new URL(url, "http://localhost");
				const surface = parsedUrl.searchParams.get("surface");
				if (options?.addFailSurface && surface === options.addFailSurface) {
					res.writeHead(422, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ detail: "invalid word" }));
					return;
				}
				const uuid = crypto.randomUUID();
				res.writeHead(200, { "Content-Type": "application/json" });
				res.end(JSON.stringify(uuid));
				return;
			}

			res.writeHead(404);
			res.end("Not Found");
		},
	);

	return { server, calls };
}

function startServer(server: ReturnType<typeof createServer>): Promise<string> {
	return new Promise((resolve) => {
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			if (addr && typeof addr === "object") {
				resolve(`http://127.0.0.1:${addr.port}`);
			}
		});
	});
}

function stopServer(server: ReturnType<typeof createServer>): Promise<void> {
	return new Promise((resolve) => {
		server.close(() => resolve());
	});
}

test("syncUserDict: adds words from dict file to empty engine", async () => {
	const tmpDir = await mkdtemp(path.join(os.tmpdir(), "dict-sync-"));
	const dictPath = path.join(tmpDir, "user_dict.json");
	await writeFile(
		dictPath,
		JSON.stringify({
			version: 1,
			words: [
				{
					surface: "TypeScript",
					pronunciation: "タイプスクリプト",
					accent_type: 5,
				},
				{ surface: "Bun", pronunciation: "バン" },
			],
		}),
	);

	const { server, calls } = createMockVoicevoxServer();
	const apiUrl = await startServer(server);

	try {
		const result = await syncUserDict({ apiUrl, dictPath });

		assert.equal(result.deleted, 0);
		assert.equal(result.added, 2);
		assert.equal(result.errors.length, 0);

		const postCalls = calls.filter((c) => c.method === "POST");
		assert.equal(postCalls.length, 2);

		const firstPostUrl = new URL(postCalls[0].url, apiUrl);
		assert.equal(firstPostUrl.searchParams.get("surface"), "TypeScript");
		assert.equal(
			firstPostUrl.searchParams.get("pronunciation"),
			"タイプスクリプト",
		);
		assert.equal(firstPostUrl.searchParams.get("accent_type"), "5");
	} finally {
		await stopServer(server);
	}
});

test("syncUserDict: deletes existing entries before adding", async () => {
	const tmpDir = await mkdtemp(path.join(os.tmpdir(), "dict-sync-"));
	const dictPath = path.join(tmpDir, "user_dict.json");
	await writeFile(
		dictPath,
		JSON.stringify({
			version: 1,
			words: [{ surface: "Rust", pronunciation: "ラスト" }],
		}),
	);

	const existingDict = {
		"uuid-1": {
			surface: "OldWord",
			pronunciation: "オールドワード",
			accent_type: 0,
			word_type: "PROPER_NOUN",
			priority: 5,
			mora_count: 6,
		},
		"uuid-2": {
			surface: "Another",
			pronunciation: "アナザー",
			accent_type: 0,
			word_type: "PROPER_NOUN",
			priority: 5,
			mora_count: 3,
		},
	};
	const { server, calls } = createMockVoicevoxServer({ existingDict });
	const apiUrl = await startServer(server);

	try {
		const result = await syncUserDict({ apiUrl, dictPath });

		assert.equal(result.deleted, 2);
		assert.equal(result.added, 1);
		assert.equal(result.errors.length, 0);

		const deleteCalls = calls.filter((c) => c.method === "DELETE");
		assert.equal(deleteCalls.length, 2);
		assert.ok(deleteCalls.some((c) => c.url.includes("uuid-1")));
		assert.ok(deleteCalls.some((c) => c.url.includes("uuid-2")));
	} finally {
		await stopServer(server);
	}
});

test("syncUserDict: reports errors for failed additions without throwing", async () => {
	const tmpDir = await mkdtemp(path.join(os.tmpdir(), "dict-sync-"));
	const dictPath = path.join(tmpDir, "user_dict.json");
	await writeFile(
		dictPath,
		JSON.stringify({
			version: 1,
			words: [
				{ surface: "Good", pronunciation: "グッド" },
				{ surface: "Bad", pronunciation: "バッド" },
			],
		}),
	);

	const { server } = createMockVoicevoxServer({ addFailSurface: "Bad" });
	const apiUrl = await startServer(server);

	try {
		const result = await syncUserDict({ apiUrl, dictPath });

		assert.equal(result.added, 1);
		assert.equal(result.errors.length, 1);
		assert.ok(result.errors[0].includes('"Bad"'));
	} finally {
		await stopServer(server);
	}
});

test("syncUserDict: validates dict file against schema", async () => {
	const tmpDir = await mkdtemp(path.join(os.tmpdir(), "dict-sync-"));
	const dictPath = path.join(tmpDir, "user_dict.json");
	await writeFile(
		dictPath,
		JSON.stringify({
			version: 999,
			words: [],
		}),
	);

	const { server } = createMockVoicevoxServer();
	const apiUrl = await startServer(server);

	try {
		await assert.rejects(
			() => syncUserDict({ apiUrl, dictPath }),
			(err: Error) => {
				assert.ok(err.message.includes("Schema validation failed"));
				return true;
			},
		);
	} finally {
		await stopServer(server);
	}
});

test("syncUserDict: empty words array syncs correctly", async () => {
	const tmpDir = await mkdtemp(path.join(os.tmpdir(), "dict-sync-"));
	const dictPath = path.join(tmpDir, "user_dict.json");
	await writeFile(dictPath, JSON.stringify({ version: 1, words: [] }));

	const existingDict = {
		"uuid-x": {
			surface: "X",
			pronunciation: "エックス",
			accent_type: 0,
			word_type: "PROPER_NOUN",
			priority: 5,
			mora_count: 4,
		},
	};
	const { server } = createMockVoicevoxServer({ existingDict });
	const apiUrl = await startServer(server);

	try {
		const result = await syncUserDict({ apiUrl, dictPath });

		assert.equal(result.deleted, 1);
		assert.equal(result.added, 0);
		assert.equal(result.errors.length, 0);
	} finally {
		await stopServer(server);
	}
});
