import type { RunStatus } from "@narrative-vox/api-types";
import { describe, expect, test } from "vitest";
import {
  buildEpisodeOptions,
  collectRunEpisodeIds,
  resolveEpisodeSelection,
} from "@/lib/pipeline-episode-selection";

function makeRunStatus(overrides?: Partial<RunStatus>): RunStatus {
  return {
    projectId: "demo",
    runId: "run-20260228-1200",
    plannedEpisodeIds: [],
    stages: {
      source_index: { status: "idle" },
      blueprint: { status: "completed" },
      episode_pack: { status: "idle", episodeIds: [] },
      script: { status: "idle", episodeIds: [] },
      series_context: { status: "idle", episodeIds: [] },
      voicevox_text: { status: "idle", episodeIds: [] },
      voicevox_project: { status: "idle", episodeIds: [] },
      audio: { status: "idle", episodeIds: [] },
    },
    ...overrides,
  };
}

describe("pipeline episode selection", () => {
  test("no run key and no status -> returns empty string", () => {
    expect(
      resolveEpisodeSelection({
        runKey: "",
        currentEpisodeId: "",
      }),
    ).toBe("");
    expect(
      buildEpisodeOptions({
        runKey: "",
        currentEpisodeId: "",
      }),
    ).toEqual([]);
  });

  test("planned episodes are the source of truth", () => {
    const runStatus = makeRunStatus({ plannedEpisodeIds: ["E03", "E04"] });
    expect(
      resolveEpisodeSelection({
        runKey: "demo/run-20260228-1200",
        currentEpisodeId: "",
        runStatus,
      }),
    ).toBe("E03");
    expect(collectRunEpisodeIds(runStatus)).toEqual(["E03", "E04"]);
  });

  test("current episode is kept when it exists in planned episodes", () => {
    const runStatus = makeRunStatus({ plannedEpisodeIds: ["E04", "E05"] });
    expect(
      resolveEpisodeSelection({
        runKey: "demo/run-20260228-1200",
        currentEpisodeId: "E05",
        runStatus,
      }),
    ).toBe("E05");
  });

  test("invalid current episode falls back to first planned episode", () => {
    const runStatus = makeRunStatus({ plannedEpisodeIds: ["E03", "E04"] });
    expect(
      resolveEpisodeSelection({
        runKey: "demo/run-20260228-1200",
        currentEpisodeId: "E99",
        runStatus,
      }),
    ).toBe("E03");
  });

  test("buildEpisodeOptions returns planned episodes only", () => {
    const runStatus = makeRunStatus({ plannedEpisodeIds: ["E03", "E04"] });
    expect(
      buildEpisodeOptions({
        runKey: "demo/run-20260228-1200",
        currentEpisodeId: "E05",
        runStatus,
      }),
    ).toEqual(["E03", "E04"]);
  });

  test("falls back to stage episode ids when planned ids are unavailable", () => {
    const runStatus = makeRunStatus({
      stages: {
        source_index: { status: "idle" },
        blueprint: { status: "completed" },
        episode_pack: { status: "partial", episodeIds: ["E07", "E08"] },
        script: { status: "partial", episodeIds: ["E08", "E09"] },
        series_context: { status: "idle", episodeIds: [] },
        voicevox_text: { status: "idle", episodeIds: [] },
        voicevox_project: { status: "idle", episodeIds: [] },
        audio: { status: "idle", episodeIds: [] },
      },
    });
    expect(collectRunEpisodeIds(runStatus)).toEqual(["E07", "E08", "E09"]);
  });

  test("empty options when no run selected", () => {
    expect(
      buildEpisodeOptions({
        runKey: "",
        currentEpisodeId: "E05",
      }),
    ).toEqual([]);
  });
});
