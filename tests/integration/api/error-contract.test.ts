/**
 * T12: APIエラー契約テスト
 *
 * - problem+json (RFC7807) 形式で返ること
 * - AJVバリデーション失敗が 422 であること
 */

import assert from "node:assert/strict";
import { test } from "bun:test";
import { app } from "../../../apps/api/src/app.ts";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
	return app.fetch(new Request(`http://localhost${path}`, init));
}

// ---------------------------------------------------------------------------
// problem+json フォーマット検証
// ---------------------------------------------------------------------------

test("400: 不正なキー → problem+json レスポンスが返る", async () => {
	// キーパターン [a-z0-9][a-z0-9_-]* に違反する大文字キー
	const res = await apiFetch("/api/configs/characters/INVALID_KEY");
	assert.equal(res.status, 400);
	assert.equal(res.headers.get("content-type"), "application/problem+json");

	const body = (await res.json()) as Record<string, unknown>;
	assert.equal(body.type, "about:blank");
	assert.equal(body.status, 400);
	assert.ok(
		typeof body.title === "string" && body.title.length > 0,
		"title は空でない文字列",
	);
	assert.ok(typeof body.instance === "string", "instance フィールドが存在する");
	assert.ok(
		typeof body.requestId === "string",
		"requestId フィールドが存在する",
	);
});

test("404: 存在しないリソース → problem+json レスポンスが返る", async () => {
	const res = await apiFetch("/api/configs/characters/nonexistent-char-xyz");
	assert.equal(res.status, 404);
	assert.equal(res.headers.get("content-type"), "application/problem+json");

	const body = (await res.json()) as Record<string, unknown>;
	assert.equal(body.status, 404);
	assert.ok(typeof body.title === "string");
	assert.ok(typeof body.requestId === "string");
});

test("400: 不正な JSON ボディ → problem+json レスポンスが返る", async () => {
	const res = await apiFetch("/api/configs/characters", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "{ invalid json",
	});
	assert.equal(res.status, 400);
	assert.equal(res.headers.get("content-type"), "application/problem+json");

	const body = (await res.json()) as Record<string, unknown>;
	assert.equal(body.status, 400);
	assert.ok(typeof body.requestId === "string");
});

// ---------------------------------------------------------------------------
// AJVバリデーション失敗 → 422 + details[]
// ---------------------------------------------------------------------------

test("422: AJVバリデーション失敗 → 422 と details[] が返る", async () => {
	// キャラクタースキーマの必須フィールド (key, name, description, voice, emotionStyles, profile) が全て欠落
	const res = await apiFetch("/api/configs/characters", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ garbage: "data" }),
	});

	assert.equal(res.status, 422);
	assert.equal(res.headers.get("content-type"), "application/problem+json");

	const body = (await res.json()) as Record<string, unknown>;
	assert.equal(body.status, 422);
	assert.equal(body.title, "Validation failed");
	assert.ok(Array.isArray(body.details), "details は配列であること");
	assert.ok((body.details as unknown[]).length > 0, "details は空でないこと");
	// 各エラーメッセージは文字列
	for (const d of body.details as unknown[]) {
		assert.ok(typeof d === "string", `details の要素は文字列: ${String(d)}`);
	}
	assert.ok(typeof body.requestId === "string");
});

test("422: プロジェクト設定の AJV バリデーション失敗 → 422 + details[]", async () => {
	const res = await apiFetch("/api/configs/projects", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ id: 123, episodes: "not-an-array" }), // id は文字列であるべき
	});

	assert.equal(res.status, 422);
	const body = (await res.json()) as Record<string, unknown>;
	assert.equal(body.status, 422);
	assert.ok(Array.isArray(body.details));
	assert.ok((body.details as unknown[]).length > 0);
});

// ---------------------------------------------------------------------------
// requestId ヘッダー伝搬
// ---------------------------------------------------------------------------

test("requestId: X-Request-Id ヘッダーを渡すと同じ値が problem+json に含まれる", async () => {
	const customId = "test-req-abc123";
	const res = await apiFetch("/api/configs/characters/INVALID_KEY", {
		headers: { "X-Request-Id": customId },
	});

	assert.equal(res.status, 400);
	const body = (await res.json()) as Record<string, unknown>;
	assert.equal(body.requestId, customId);
	assert.equal(res.headers.get("x-request-id"), customId);
});
