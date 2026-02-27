import { test } from "bun:test";
import assert from "node:assert/strict";
import { app } from "../../../apps/api/src/app.ts";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

test("通常 API: 1MB を超える JSON は 413 を返す", async () => {
  const payload = { data: "a".repeat(1_200_000) };
  const bodyText = JSON.stringify(payload);
  const res = await apiFetch("/api/configs/characters", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(bodyText)),
    },
    body: bodyText,
  });

  assert.equal(res.status, 413);
  assert.equal(res.headers.get("content-type"), "application/problem+json");
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.errorCode, "PAYLOAD_TOO_LARGE");
});

test("synthesis: 1MB 超 10MB 未満は 413 にならない", async () => {
  const payload = { data: "b".repeat(2_000_000) };
  const bodyText = JSON.stringify(payload);
  const res = await apiFetch("/api/voicevox/synthesis?speaker=1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(bodyText)),
    },
    body: bodyText,
  });

  assert.notEqual(res.status, 413);
});

test("synthesis: 10MB を超える JSON は 413 を返す", async () => {
  const payload = { data: "c".repeat(11_000_000) };
  const bodyText = JSON.stringify(payload);
  const res = await apiFetch("/api/voicevox/synthesis?speaker=1", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(bodyText)),
    },
    body: bodyText,
  });

  assert.equal(res.status, 413);
  assert.equal(res.headers.get("content-type"), "application/problem+json");
  const body = (await res.json()) as Record<string, unknown>;
  assert.equal(body.errorCode, "PAYLOAD_TOO_LARGE");
});
