import { test } from "bun:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  validateDigestsIfPresent,
  validateEpisodeParity,
} from "../../../packages/quality/src/check-run/validators/script.ts";

test("validateEpisodeParity rejects extra script episodes", () => {
  assert.throws(
    () => validateEpisodeParity(["E01"], ["E01", "E02"]),
    /script has episodes not in material: E02/,
  );
});

test("validateDigestsIfPresent rejects filename / episode_id mismatch", async () => {
  const runDir = await mkdtemp(path.join(tmpdir(), "nv-check-run-script-"));
  const contextDir = path.join(runDir, "context");
  await mkdir(contextDir, { recursive: true });
  await writeFile(
    path.join(contextDir, "E02_episode_digest.json"),
    JSON.stringify(
      {
        schema_version: "1.0",
        episode_id: "E01",
        episode_title: "Episode 2",
        content_summary: {
          core_topics_covered: ["A", "B", "C"],
          key_conclusions: ["Conclusion"],
          terms_introduced: [],
        },
        character_behavior: [
          {
            character_key: "teacher",
            utterance_count: 1,
          },
        ],
        continuity: {
          narrative_position: "early",
          open_threads: [],
        },
      },
      null,
      2,
    ),
  );

  try {
    await assert.rejects(
      () =>
        validateDigestsIfPresent({
          resolvedRunDir: runDir,
          materialEpisodeIds: ["E02"],
          warnings: [],
        }),
      /episode_id "E01" does not match filename "E02"/,
    );
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});
