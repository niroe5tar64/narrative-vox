import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  cloneRunDirectories,
  findLatestRunDir,
  makeRunIdNow,
  validateRunId
} from "../../src/cli/prepare_run.ts";

test("makeRunIdNow creates run-YYYYMMDD-HHMM format", () => {
  const runId = makeRunIdNow(new Date("2026-02-11T12:34:56.000Z"));
  assert.match(runId, /^run-\d{8}-\d{4}$/);
});

test("validateRunId accepts valid format and rejects invalid format", () => {
  assert.equal(validateRunId("run-20260211-1234"), "run-20260211-1234");
  assert.throws(
    () => validateRunId("run-2026-02-11-1234"),
    /Expected format: run-YYYYMMDD-HHMM/
  );
});

test("findLatestRunDir chooses newest run id", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-new-run-"));
  const projectDir = path.join(tempRoot, "projects", "book-a");
  await mkdir(path.join(projectDir, "run-20260210-2200"), { recursive: true });
  await mkdir(path.join(projectDir, "run-20260211-0000"), { recursive: true });
  await mkdir(path.join(projectDir, "run-20260211-0905"), { recursive: true });
  await mkdir(path.join(projectDir, "tmp"), { recursive: true });

  const latest = await findLatestRunDir(projectDir);
  assert.equal(latest, path.join(projectDir, "run-20260211-0905"));
});

test("cloneRunDirectories copies stage1-3 into target run", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "narrative-vox-new-run-"));
  const sourceRunDir = path.join(tempRoot, "projects", "book-a", "run-20260211-0000");
  const runDir = path.join(tempRoot, "projects", "book-a", "run-20260211-0100");

  await mkdir(path.join(sourceRunDir, "stage1"), { recursive: true });
  await mkdir(path.join(sourceRunDir, "stage2"), { recursive: true });
  await mkdir(path.join(sourceRunDir, "stage3"), { recursive: true });

  await writeFile(path.join(sourceRunDir, "stage1", "book_blueprint.json"), '{"ok":true}\n', "utf-8");
  await writeFile(path.join(sourceRunDir, "stage2", "E01_variables.json"), '{"ok":true}\n', "utf-8");
  await writeFile(path.join(sourceRunDir, "stage3", "E01_script.md"), "1. 見出し\n本文\n", "utf-8");

  await cloneRunDirectories({ sourceRunDir, runDir });

  const stage1 = await readFile(path.join(runDir, "stage1", "book_blueprint.json"), "utf-8");
  const stage2 = await readFile(path.join(runDir, "stage2", "E01_variables.json"), "utf-8");
  const stage3 = await readFile(path.join(runDir, "stage3", "E01_script.md"), "utf-8");
  assert.equal(stage1, '{"ok":true}\n');
  assert.equal(stage2, '{"ok":true}\n');
  assert.equal(stage3, "1. 見出し\n本文\n");

  await assert.rejects(
    () => cloneRunDirectories({ sourceRunDir, runDir }),
    /Target run directory already exists/
  );
});
