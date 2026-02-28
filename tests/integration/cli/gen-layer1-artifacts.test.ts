import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  logJsonSchemaValidation,
  saveJsonArtifact,
  saveTextArtifact,
} from "@narrative-vox/cli/gen-layer1/artifacts.ts";

function withCapturedLogs<T>(
  run: () => Promise<T>,
): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };
  return run()
    .then((result) => ({ result, logs }))
    .finally(() => {
      console.log = original;
    });
}

describe("saveJsonArtifact", () => {
  test("writes pretty json with trailing newline and logs relative path", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nv-json-artifact-"));
    const filePath = path.join(tempRoot, "nested", "artifact.json");

    const { logs } = await withCapturedLogs(() =>
      saveJsonArtifact({
        stepLabel: "gen-material",
        filePath,
        data: { ok: true },
      }),
    );

    const saved = await readFile(filePath, "utf-8");
    assert.equal(saved, '{\n  "ok": true\n}\n');
    assert.ok(logs.some((line) => line.includes("[gen-material] Saved: ")));
  });
});

describe("saveTextArtifact", () => {
  test("writes text content and logs relative path", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "nv-text-artifact-"));
    const filePath = path.join(tempRoot, "nested", "artifact.md");

    const { logs } = await withCapturedLogs(() =>
      saveTextArtifact({
        stepLabel: "gen-script",
        filePath,
        content: "hello\n",
      }),
    );

    const saved = await readFile(filePath, "utf-8");
    assert.equal(saved, "hello\n");
    assert.ok(logs.some((line) => line.includes("[gen-script] Saved: ")));
  });
});

describe("logJsonSchemaValidation", () => {
  test("logs OK for valid data", async () => {
    const blueprint = JSON.parse(
      await Bun.file(
        "tests/fixtures/sample-run/blueprint/project_blueprint.json",
      ).text(),
    );

    const { logs } = await withCapturedLogs(() =>
      logJsonSchemaValidation({
        stepLabel: "gen-blueprint",
        data: blueprint,
        schemaPath: "schemas/blueprint.schema.json",
      }),
    );

    assert.ok(logs.some((line) => line.includes("Schema validation: OK")));
  });

  test("logs WARN for invalid data without throwing", async () => {
    const { logs } = await withCapturedLogs(() =>
      logJsonSchemaValidation({
        stepLabel: "gen-blueprint",
        data: { invalid: true },
        schemaPath: "schemas/blueprint.schema.json",
      }),
    );

    assert.ok(logs.some((line) => line.includes("Schema validation: WARN - ")));
  });
});
