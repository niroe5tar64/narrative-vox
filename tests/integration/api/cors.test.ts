import { test } from "bun:test";
import assert from "node:assert/strict";
import { app } from "../../../apps/api/src/app.ts";

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return app.fetch(new Request(`http://localhost${path}`, init));
}

test("CORS: allowed origin receives access-control header", async () => {
  const res = await apiFetch("/api/health", {
    headers: { Origin: "http://localhost:5173" },
  });

  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get("access-control-allow-origin"),
    "http://localhost:5173",
  );
});

test("CORS: disallowed origin does not receive access-control header", async () => {
  const res = await apiFetch("/api/health", {
    headers: { Origin: "http://evil.example.com" },
  });

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("CORS: preflight advertises configured headers", async () => {
  const res = await apiFetch("/api/configs/projects", {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Content-Type,X-Request-Id",
    },
  });

  assert.equal(res.status, 204);
  assert.equal(
    res.headers.get("access-control-allow-origin"),
    "http://localhost:5173",
  );
  assert.match(
    res.headers.get("access-control-allow-headers") ?? "",
    /X-Request-Id/i,
  );
});
