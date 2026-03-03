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
  test("project default only -> uses project episode", () => {
    expect(
      resolveEpisodeSelection({
        runKey: "",
        currentEpisodeId: "",
        projectEpisodeId: "E05",
      }),
    ).toBe("E05");
    expect(
      buildEpisodeOptions({
        runKey: "",
        currentEpisodeId: "",
        projectEpisodeId: "E05",
      }),
    ).toEqual(["E05"]);
  });

  test("planned episodes override fallback when project default is absent", () => {
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

  test("project default is preserved when it exists in planned episodes", () => {
    const runStatus = makeRunStatus({ plannedEpisodeIds: ["E03", "E05"] });
    expect(
      resolveEpisodeSelection({
        runKey: "demo/run-20260228-1200",
        currentEpisodeId: "",
        projectEpisodeId: "E05",
        runStatus,
      }),
    ).toBe("E05");
  });

  test("current episode is kept across run switch when still valid", () => {
    const runStatus = makeRunStatus({ plannedEpisodeIds: ["E04", "E05"] });
    expect(
      resolveEpisodeSelection({
        runKey: "demo/run-20260228-1200",
        currentEpisodeId: "E05",
        projectEpisodeId: "E03",
        runStatus,
      }),
    ).toBe("E05");
  });

  test("invalid current episode is temporarily kept in options until correction", () => {
    const runStatus = makeRunStatus({ plannedEpisodeIds: ["E03", "E04"] });
    expect(
      buildEpisodeOptions({
        runKey: "demo/run-20260228-1200",
        currentEpisodeId: "E05",
        projectEpisodeId: "E07",
        runStatus,
      }),
    ).toEqual(["E05", "E03", "E04"]);
    expect(
      resolveEpisodeSelection({
        runKey: "demo/run-20260228-1200",
        currentEpisodeId: "E05",
        projectEpisodeId: "E07",
        runStatus,
      }),
    ).toBe("E03");
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
    expect(
      resolveEpisodeSelection({
        runKey: "demo/run-20260228-1200",
        currentEpisodeId: "",
        runStatus,
      }),
    ).toBe("E07");
  });

  test("falls back to E01 when no project or run information exists", () => {
    expect(
      resolveEpisodeSelection({
        runKey: "",
        currentEpisodeId: "",
      }),
    ).toBe("E01");
    expect(
      buildEpisodeOptions({
        runKey: "",
        currentEpisodeId: "",
      }),
    ).toEqual(["E01"]);
  });

  test("keeps current episode as temporary option while run status is loading", () => {
    expect(
      buildEpisodeOptions({
        runKey: "demo/run-20260228-1200",
        currentEpisodeId: "E05",
        projectEpisodeId: "E03",
      }),
    ).toEqual(["E05"]);
  });
});
