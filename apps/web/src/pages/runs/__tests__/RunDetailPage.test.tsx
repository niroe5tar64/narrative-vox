// @vitest-environment jsdom

import type { LogEntry, RunTreeResult } from "@narrative-vox/api-types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  Link,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { RunDetailPage } from "@/pages/runs/RunDetailPage";

const invalidateQueries = vi.fn(() => Promise.resolve());
const useQueryMock = vi.fn();
const usePipelineLogMock = vi.fn();
const NativeRequest = globalThis.Request;
const apiPipelineRunMock = vi.fn();
const resetMock = vi.fn();

let pipelineState: {
  logs: LogEntry[];
  status: "idle" | "connecting" | "running" | "done" | "cancelled" | "error";
};

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => useQueryMock(options),
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("@/hooks/usePipelineLog", () => ({
  usePipelineLog: (jobId: string | null) => usePipelineLogMock(jobId),
}));

vi.mock("@/api/client", async () => {
  const actual =
    await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      pipeline: {
        ...actual.api.pipeline,
        run: (...args: unknown[]) => apiPipelineRunMock(...args),
      },
    },
  };
});

vi.mock("@/components/runs/RunFileTree", () => ({
  RunFileTree: ({ onSelect }: { onSelect: (path: string) => void }) => (
    <button type="button" onClick={() => onSelect("script/E01_script.md")}>
      select-script
    </button>
  ),
}));

vi.mock("@/components/runs/FileViewer", () => ({
  FileViewer: ({
    onDirtyChange,
  }: {
    onDirtyChange?: (dirty: boolean) => void;
  }) => (
    <div>
      <div>FileViewer</div>
      <button type="button" onClick={() => onDirtyChange?.(true)}>
        mark-dirty
      </button>
      <button type="button" onClick={() => onDirtyChange?.(false)}>
        clear-dirty
      </button>
    </div>
  ),
}));

vi.mock("@/components/pipeline/LogTerminal", () => ({
  LogTerminal: () => <div>LogTerminal</div>,
}));

vi.mock("@/components/feedback/ApiErrorBanner", () => ({
  ApiErrorBanner: () => <div>ApiErrorBanner</div>,
}));

function renderPage() {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <div>
            <Link to="/other">go-other</Link>
            <Outlet />
          </div>
        ),
        children: [
          {
            path: "runs/:projectId/:runId",
            element: <RunDetailPage />,
          },
          {
            path: "other",
            element: <div>Other Page</div>,
          },
        ],
      },
    ],
    {
      initialEntries: ["/runs/demo/run-20260228-1200"],
    },
  );

  return {
    ...render(<RouterProvider router={router} />),
    router,
  };
}

describe("RunDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.AbortController = window.AbortController;
    globalThis.AbortSignal = window.AbortSignal;
    globalThis.Request = class RequestWithoutSignal extends NativeRequest {
      constructor(
        input: ConstructorParameters<typeof NativeRequest>[0],
        init?: ConstructorParameters<typeof NativeRequest>[1],
      ) {
        super(input, init ? { ...init, signal: undefined } : init);
      }
    } as typeof Request;

    pipelineState = {
      logs: [],
      status: "idle",
    };

    usePipelineLogMock.mockImplementation(() => ({
      logs: pipelineState.logs,
      status: pipelineState.status,
      reset: resetMock,
    }));

    const treeData: RunTreeResult = {
      tree: {
        name: "run-20260228-1200",
        type: "dir",
        children: [
          { name: "E01_script.md", type: "file", path: "script/E01_script.md" },
        ],
      },
    };

    useQueryMock.mockReturnValue({
      data: treeData,
      isLoading: false,
      error: null,
    });

    apiPipelineRunMock.mockImplementation((command: string, args: string[]) =>
      Promise.resolve({
        jobId: command === "check-run" ? "job-check" : "job-prepare",
        command,
        args,
        startedAt: "2026-02-28T00:00:00.000Z",
      }),
    );
  });

  afterEach(() => {
    globalThis.Request = NativeRequest;
  });

  test("check-run click で pipeline.run を正しい引数で呼ぶ", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "check-run" }));

    await waitFor(() => {
      expect(apiPipelineRunMock).toHaveBeenCalledWith("check-run", [
        "--run-dir",
        "data/projects/demo/run-20260228-1200",
      ]);
    });

    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  test("prepare-run click で pipeline.run を正しい引数で呼ぶ", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "このRunから継続" }));

    await waitFor(() => {
      expect(apiPipelineRunMock).toHaveBeenCalledWith("prepare-run", [
        "--source-run-dir",
        "data/projects/demo/run-20260228-1200",
      ]);
    });

    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  test("prepare-run 完了時に tree/status/file/byProject query を invalidate する", async () => {
    usePipelineLogMock.mockImplementation((jobId: string | null) => ({
      logs: [],
      status: jobId ? "done" : "idle",
      reset: resetMock,
    }));

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "select-script" }));
    expect(screen.getByText("FileViewer")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "このRunから継続" }));

    await waitFor(() => {
      expect(apiPipelineRunMock).toHaveBeenCalledWith("prepare-run", [
        "--source-run-dir",
        "data/projects/demo/run-20260228-1200",
      ]);
    });

    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: ["run-tree", "demo", "run-20260228-1200"],
      });
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["run-status", "demo", "run-20260228-1200"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [
        "run-file",
        "demo",
        "run-20260228-1200",
        "script/E01_script.md",
      ],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["runs", "demo"],
    });
  });

  test("file viewer が dirty のとき route 遷移で dirty guard dialog が開き、confirm で遷移する", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "select-script" }));
    fireEvent.click(screen.getByRole("button", { name: "mark-dirty" }));
    fireEvent.click(screen.getByRole("link", { name: "go-other" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(
      screen.getByText("変更を破棄してページを移動しますか？"),
    ).toBeTruthy();
    expect(
      screen.queryByText("変更を破棄して別のキャラクターを開きますか？"),
    ).toBeNull();
    expect(
      screen.queryByText("変更を破棄して別のプロジェクトを開きますか？"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "破棄して移動" }));

    await waitFor(() => {
      expect(screen.getByText("Other Page")).toBeTruthy();
    });

    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
