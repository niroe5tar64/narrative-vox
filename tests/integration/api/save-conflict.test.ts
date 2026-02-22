/**
 * T12: 保存競合テスト (ETag / If-Match)
 *
 * - stale な If-Match で 409
 * - 原子的保存で不完全 JSON が残らないこと
 */

import assert from "node:assert/strict";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, test } from "bun:test";
import { app } from "../../../apps/api/src/app.ts";

// ---------------------------------------------------------------------------
// テスト用ディレクトリのセットアップ
// config.repoRoot は process.cwd() = /workspaces/narrative-vox を指すため、
// data/projects/ 配下にテスト専用ディレクトリを作成して後処理で削除する
// ---------------------------------------------------------------------------

const PROJECT_ID = `test-api-${crypto.randomUUID().slice(0, 8)}`;
const RUN_ID = "run-20260101-0000";
const VOICEVOX_TEXT_DIR = path.join(
	process.cwd(),
	"data/projects",
	PROJECT_ID,
	RUN_ID,
	"voicevox_text",
);
const FILE_PATH = path.join(VOICEVOX_TEXT_DIR, "E01_voicevox_text.json");
const FILE_REL_PATH = `voicevox_text/E01_voicevox_text.json`;

const INITIAL_CONTENT = {
	utterances: [
		{ utterance_id: "u001", text: "元のテキスト", pause_length_ms: 0 },
		{ utterance_id: "u002", text: "二番目のセリフ", pause_length_ms: 500 },
	],
};

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
	return app.fetch(new Request(`http://localhost${path}`, init));
}

function fileApiPath(filePath: string): string {
	return `/api/runs/${PROJECT_ID}/${RUN_ID}/file?path=${encodeURIComponent(filePath)}`;
}

beforeAll(async () => {
	await mkdir(VOICEVOX_TEXT_DIR, { recursive: true });
	await Bun.write(FILE_PATH, `${JSON.stringify(INITIAL_CONTENT, null, 2)}\n`);
});

afterAll(async () => {
	await rm(path.join(process.cwd(), "data/projects", PROJECT_ID), {
		recursive: true,
		force: true,
	});
});

// ---------------------------------------------------------------------------
// ETag の取得
// ---------------------------------------------------------------------------

test("GET voicevox_text.json → ETag ヘッダーが返る", async () => {
	const res = await apiFetch(fileApiPath(FILE_REL_PATH));
	assert.equal(res.status, 200);
	const etag = res.headers.get("etag");
	assert.ok(etag !== null, "ETag ヘッダーが存在する");
	// ETag は "sha256hex" 形式
	assert.match(
		etag,
		/^"[0-9a-f]{64}"$/,
		"ETag は SHA-256 16進数のクォート形式",
	);
});

// ---------------------------------------------------------------------------
// If-Match なしで PUT → 400
// ---------------------------------------------------------------------------

test("PUT: If-Match ヘッダーなし → 400", async () => {
	const res = await apiFetch(fileApiPath(FILE_REL_PATH), {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ utterances: [] }),
	});
	assert.equal(res.status, 400);
	assert.equal(res.headers.get("content-type"), "application/problem+json");

	const body = (await res.json()) as Record<string, unknown>;
	assert.equal(body.status, 400);
	assert.equal(body.errorCode, "IF_MATCH_REQUIRED");
});

// ---------------------------------------------------------------------------
// stale な If-Match → 409
// ---------------------------------------------------------------------------

test("PUT: stale な If-Match → 409 (ETag mismatch)", async () => {
	const staleETag =
		'"0000000000000000000000000000000000000000000000000000000000000000"';
	const res = await apiFetch(fileApiPath(FILE_REL_PATH), {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			"If-Match": staleETag,
		},
		body: JSON.stringify({ utterances: [] }),
	});
	assert.equal(res.status, 409);
	assert.equal(res.headers.get("content-type"), "application/problem+json");

	const body = (await res.json()) as Record<string, unknown>;
	assert.equal(body.status, 409);
	assert.equal(body.errorCode, "ETAG_MISMATCH");
});

// ---------------------------------------------------------------------------
// voicevox_text.json 以外のファイルを PUT → 403
// ---------------------------------------------------------------------------

test("PUT: voicevox_text.json 以外のファイルを編集しようとすると 403", async () => {
	const res = await apiFetch(
		`/api/runs/${PROJECT_ID}/${RUN_ID}/file?path=${encodeURIComponent("voicevox_text/E01_script.md")}`,
		{
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
				"If-Match": '"abc"',
			},
			body: JSON.stringify({ utterances: [] }),
		},
	);
	assert.equal(res.status, 403);
	assert.equal(res.headers.get("content-type"), "application/problem+json");
	const body = (await res.json()) as Record<string, unknown>;
	assert.equal(body.errorCode, "EDIT_NOT_ALLOWED");
});

// ---------------------------------------------------------------------------
// 正しい If-Match → 200 + 新しい ETag
// ---------------------------------------------------------------------------

test("PUT: 正しい If-Match → 200 + 新 ETag + ファイル更新", async () => {
	// まず現在の ETag を取得
	const getRes = await apiFetch(fileApiPath(FILE_REL_PATH));
	assert.equal(getRes.status, 200);
	const currentETag = getRes.headers.get("etag");
	assert.ok(currentETag !== null);

	// 正しい ETag で PUT
	const putRes = await apiFetch(fileApiPath(FILE_REL_PATH), {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			"If-Match": currentETag,
		},
		body: JSON.stringify({
			utterances: [
				{ utterance_id: "u001", text: "更新後テキスト" },
				{ utterance_id: "u002", pause_length_ms: 1000 },
			],
		}),
	});

	assert.equal(putRes.status, 200);
	const newETag = putRes.headers.get("etag");
	assert.ok(newETag !== null, "新しい ETag ヘッダーが返る");
	assert.notEqual(newETag, currentETag, "ETag がコンテンツ変更で更新される");

	// レスポンスボディのサニティチェック
	const updated = (await putRes.json()) as {
		utterances: Array<{
			utterance_id: string;
			text: string;
			pause_length_ms: number;
		}>;
	};
	const u001 = updated.utterances.find((u) => u.utterance_id === "u001");
	const u002 = updated.utterances.find((u) => u.utterance_id === "u002");
	assert.equal(u001?.text, "更新後テキスト", "text が更新されている");
	assert.equal(u002?.pause_length_ms, 1000, "pause_length_ms が更新されている");
});

// ---------------------------------------------------------------------------
// 原子的保存: .tmp ファイルが残らない
// ---------------------------------------------------------------------------

test("PUT: 保存後に .tmp ファイルが残らない（原子的書き込み）", async () => {
	// 現在の ETag を取得してから PUT
	const getRes = await apiFetch(fileApiPath(FILE_REL_PATH));
	const etag = getRes.headers.get("etag");
	assert.ok(etag !== null);

	await apiFetch(fileApiPath(FILE_REL_PATH), {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			"If-Match": etag,
		},
		body: JSON.stringify({
			utterances: [{ utterance_id: "u001", text: "別のテキスト" }],
		}),
	});

	// .tmp ファイルが残っていないことを確認
	const tmpPath = `${FILE_PATH}.tmp`;
	const tmpStat = await stat(tmpPath).catch(() => null);
	assert.equal(tmpStat, null, ".tmp ファイルは残っていないこと");
});

// ---------------------------------------------------------------------------
// 連続 PUT で stale ETag になる
// ---------------------------------------------------------------------------

test("PUT: 一度更新した後に古い ETag で再 PUT → 409", async () => {
	// Step 1: 現在の ETag 取得
	const getRes = await apiFetch(fileApiPath(FILE_REL_PATH));
	const oldETag = getRes.headers.get("etag");
	assert.ok(oldETag !== null);

	// Step 2: 正しい ETag で更新 → 成功
	const put1Res = await apiFetch(fileApiPath(FILE_REL_PATH), {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			"If-Match": oldETag,
		},
		body: JSON.stringify({
			utterances: [{ utterance_id: "u001", text: "一回目の更新" }],
		}),
	});
	assert.equal(put1Res.status, 200);

	// Step 3: 古い ETag で再 PUT → 409
	const put2Res = await apiFetch(fileApiPath(FILE_REL_PATH), {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			"If-Match": oldETag, // 古い ETag
		},
		body: JSON.stringify({
			utterances: [
				{ utterance_id: "u001", text: "二回目の更新（失敗するはず）" },
			],
		}),
	});
	assert.equal(put2Res.status, 409, "古い ETag で再 PUT → 409 Conflict");
});
