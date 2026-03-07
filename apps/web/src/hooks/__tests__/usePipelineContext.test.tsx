// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { describe, expect, test, vi } from "vitest";
import type { RunStatus } from "@narrative-vox/api-types";
import { usePipelineContext } from "@/hooks/usePipelineContext";

const useQueryMock = vi.fn();

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>(
    "@tanstack/react-query",
  );
  return {
    ...actual,
    useQuery: (options: unknown) => useQueryMock(options),
  };
});

function makeRunStatus(plannedEpisodeIds: string[]): RunStatus {
  return {
    projectId: "demo",
    runId: "run-20260228-1200",
    plannedEpisodeIds,
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
  };
}

describe("usePipelineContext", () => {
  test("prefers planned run episodes as source of truth", async () => {
    useQueryMock.mockImplementation(
      ({ queryKey }: { queryKey: readonly unknown[] }) => {
        const key = queryKey[0];
        if (key === "voicevox-status") {
          return { data: undefined, isSuccess: false, isError: false };
        }
        if (key === "projects") {
          return { data: { items: [] } };
        }
        if (key === "runs") {
          return {
            data: {
              items: [{ projectId: "demo", runId: "run-20260228-1200" }],
            },
          };
        }
        if (
          key === "run-status" &&
          queryKey[1] === "demo" &&
          queryKey[2] === "run-20260228-1200"
        ) {
          return { data: makeRunStatus(["E03", "E04"]) };
        }
        return { data: undefined };
      },
    );

    const { result } = renderHook(() => usePipelineContext(false));

    act(() => {
      result.current.setProjectId("demo");
      result.current.setEpisodeId("");
    });

    act(() => {
      result.current.setRunKey("demo/run-20260228-1200");
    });

    await waitFor(() => {
      expect(result.current.episodeId).toBe("E03");
    });

    expect(result.current.episodeOptions).toEqual(["E03", "E04"]);
  });
});
