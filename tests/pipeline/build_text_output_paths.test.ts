import { test } from "bun:test";
import assert from "node:assert/strict";
import path from "node:path";

import { resolveBuildTextOutputPaths } from "../../src/pipeline/build_text/output_paths.ts";

const runDir = path.join("/tmp", "introducing-rescript", "run-20260212-0000");
const runId = "run-20260212-0000";
const projectId = "introducing-rescript";

test("resolveBuildTextOutputPaths infers episode_id from strict E##_script.md basename", () => {
  const result = resolveBuildTextOutputPaths({
    scriptPath: path.join(runDir, "stage3", "E01_script.md"),
    runDir,
    projectId,
    runId
  });

  assert.equal(result.episodeId, "E01");
});

test("resolveBuildTextOutputPaths rejects ambiguous script basename when --episode-id is omitted", () => {
  assert.throws(
    () =>
      resolveBuildTextOutputPaths({
        scriptPath: path.join(runDir, "stage3", "prefix_E01_script.md"),
        runDir,
        projectId,
        runId
      }),
    /Expected file name: E##_script\.md/
  );
});

test("resolveBuildTextOutputPaths prefers explicit --episode-id over basename inference", () => {
  const result = resolveBuildTextOutputPaths({
    scriptPath: path.join(runDir, "stage3", "prefix_E01_script.md"),
    runDir,
    projectId,
    runId,
    episodeId: "E77"
  });

  assert.equal(result.episodeId, "E77");
});
