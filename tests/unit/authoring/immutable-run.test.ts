import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ArtifactExistsError,
  assertArtifactAbsent,
  assertFreshRun,
  findNextPlannedEpisode,
} from "@narrative-vox/authoring/shared/immutable-run.ts";

test("assertArtifactAbsent passes when file does not exist", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "immutable-"));
  const fakePath = path.join(tmpDir, "nonexistent.json");
  // Should not throw
  await assertArtifactAbsent(fakePath, "TEST");
});

test("assertArtifactAbsent throws when file exists", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "immutable-"));
  const existingPath = path.join(tmpDir, "exists.json");
  await writeFile(existingPath, "{}");

  await assert.rejects(
    () => assertArtifactAbsent(existingPath, "TEST_CODE"),
    (error: unknown) => {
      assert.ok(error instanceof ArtifactExistsError);
      assert.equal(error.code, "TEST_CODE");
      return true;
    },
  );
});

test("assertFreshRun passes on empty directory", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "immutable-"));
  // Should not throw
  await assertFreshRun(tmpDir);
});

test("assertFreshRun throws when blueprint exists", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "immutable-"));
  const blueprintDir = path.join(tmpDir, "blueprint");
  await mkdir(blueprintDir, { recursive: true });
  await writeFile(
    path.join(blueprintDir, "project_blueprint.json"),
    "{}",
  );

  await assert.rejects(
    () => assertFreshRun(tmpDir),
    (error: unknown) => {
      assert.ok(error instanceof ArtifactExistsError);
      assert.equal(error.code, "FRESH_RUN");
      return true;
    },
  );
});

test("assertFreshRun throws when source_index exists", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "immutable-"));
  const siDir = path.join(tmpDir, "source_index");
  await mkdir(siDir, { recursive: true });
  await writeFile(path.join(siDir, "source_index.json"), "{}");

  await assert.rejects(
    () => assertFreshRun(tmpDir),
    (error: unknown) => {
      assert.ok(error instanceof ArtifactExistsError);
      return true;
    },
  );
});

test("findNextPlannedEpisode returns first missing episode", () => {
  const blueprint = {
    episode_plan: [
      { episode_id: "E01" },
      { episode_id: "E02" },
      { episode_id: "E03" },
    ],
  };
  const existing = new Set(["episode_pack/E01"]);
  const next = findNextPlannedEpisode(blueprint, existing, "episode_pack");
  assert.equal(next, "E02");
});

test("findNextPlannedEpisode returns undefined when all done", () => {
  const blueprint = {
    episode_plan: [{ episode_id: "E01" }, { episode_id: "E02" }],
  };
  const existing = new Set(["episode_pack/E01", "episode_pack/E02"]);
  const next = findNextPlannedEpisode(blueprint, existing, "episode_pack");
  assert.equal(next, undefined);
});
