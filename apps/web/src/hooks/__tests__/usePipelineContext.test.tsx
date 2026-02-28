// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { act } from "react";
import { describe, expect, test, vi } from "vitest";
import type { ProjectConfig, RunStatus } from "@/api/client";
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

function makeProject(projectId: string, episodeId: string): ProjectConfig {
  return {
    GENRE_ID: "tech-explainer",
    PROJECT_ID: projectId,
    PROJECT_TITLE: "Demo",
    SOURCE_MARKDOWN_PATHS: "data/inputs/*.md",
    AUDIENCE_BACKGROUND: "bg",
    AUDIENCE_LEVEL: "beginner",
    AUDIENCE_INTEREST: "interest",
    BASELINE_CONTEXT_OR_EMPTY: "",
    EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: "",
    PROJECT_BLUEPRINT_JSON_PATH: "data/projects/demo/blueprint.json",
    EPISODE_ID: episodeId,
    STYLE_ID: "radio-talk",
    CAST: { narrator: "alice" },
  };
}

function makeRunStatus(plannedEpisodeIds: string[]): RunStatus {
  return {
    projectId: "demo",
    runId: "run-20260228-1200",
    plannedEpisodeIds,
    stages: {
      blueprint: { status: "completed" },
      material: { status: "idle", episodeIds: [] },
      script: { status: "idle", episodeIds: [] },
      context: { status: "idle", episodeIds: [] },
      voicevox_text: { status: "idle", episodeIds: [] },
      voicevox_project: { status: "idle", episodeIds: [] },
      audio: { status: "idle", episodeIds: [] },
    },
  };
}

describe("usePipelineContext", () => {
  test("prefers planned run episodes over incompatible project default", async () => {
    useQueryMock.mockImplementation(
      ({ queryKey }: { queryKey: readonly unknown[] }) => {
        const key = queryKey[0];
        if (key === "voicevox-status") {
          return { data: undefined, isSuccess: false, isError: false };
        }
        if (key === "projects") {
          return { data: { items: [makeProject("demo", "E05")] } };
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

    await waitFor(() => {
      expect(result.current.episodeId).toBe("E05");
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
