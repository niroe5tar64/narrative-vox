// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { act } from "react";
import { describe, expect, test, vi } from "vitest";
import { PipelinePage } from "@/pages/pipeline/PipelinePage";

const invalidateQueries = vi.fn(() => Promise.resolve());
const requestAutoSelectRun = vi.fn();
const setProjectId = vi.fn();
const setRunKey = vi.fn();
const setEpisodeId = vi.fn();
const resetStatuses = vi.fn();
const cancel = vi.fn();
const startJob = vi.fn();
const startStepJob = vi.fn();
const usePipelineJobMock = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

vi.mock("@/hooks/useFlashMessage", () => ({
  useFlashMessage: () => ({ visible: false, flash: vi.fn() }),
}));

vi.mock("@/hooks/usePipelineContext", () => ({
  usePipelineContext: () => ({
    projectId: "demo",
    runKey: "demo/run-20260227-1200",
    episodeId: "E01",
    episodeOptions: ["E01"],
    setProjectId,
    setRunKey,
    setEpisodeId,
    paths: {
      script: "script",
      voicevoxTextRaw: "voicevox_text.json",
      voicevoxTextPatched: "voicevox_text.patched.json",
      vvproj: "episode.vvproj",
      runDir: "data/projects/demo/run-20260227-1200",
    },
    voicevoxQuery: {
      isSuccess: true,
      isError: false,
      data: { version: "0.25.1" },
    },
    runStatusQuery: { data: { plannedEpisodeIds: ["E01"], stages: {} } },
    projectsQuery: { data: { items: [] } },
    runsQuery: { data: { items: [] } },
    requestAutoSelectRun,
  }),
}));

vi.mock("@/hooks/usePipelineJob", () => ({
  usePipelineJob: (options: unknown) => usePipelineJobMock(options),
}));

vi.mock("@/hooks/usePipelineAvailability", () => ({
  usePipelineAvailability: () => ({
    getLayer1StepDisplayStatus: vi.fn(() => "idle"),
    getLayer2StepDisplayStatus: vi.fn(() => "idle"),
    canRunLayer1Step: vi.fn(() => true),
    canRunLayer2Step: vi.fn(() => true),
    getLayer1DisabledReason: vi.fn(() => null),
    getLayer2DisabledReason: vi.fn(() => null),
    isNextLayer1Step: vi.fn(() => false),
    isNextLayer2Step: vi.fn(() => false),
    canRunBuildAll: true,
    buildAllDisabledReason: null,
  }),
}));

vi.mock("@/components/pipeline/PipelineHeader", () => ({
  PipelineHeader: ({ rightContent }: { rightContent: React.ReactNode }) => (
    <div>
      <div>PipelineHeader</div>
      <div>{rightContent}</div>
    </div>
  ),
}));

vi.mock("@/components/ui/tab-bar", () => ({
  TabBar: ({
    tabs,
    activeTab,
    onTabChange,
  }: {
    tabs: Array<{ id: string; label: string }>;
    activeTab: string;
    onTabChange: (tab: string) => void;
  }) => (
    <div>
      <div data-testid="active-tab">{activeTab}</div>
      {tabs.map((tab) => (
        <button key={tab.id} type="button" onClick={() => onTabChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("@/components/pipeline/PipelineContextSelector", () => ({
  PipelineContextSelector: ({
    onProjectIdChange,
    onRunKeyChange,
    onEpisodeIdChange,
  }: {
    onProjectIdChange: (id: string) => void;
    onRunKeyChange: (key: string) => void;
    onEpisodeIdChange: (id: string) => void;
  }) => (
    <div>
      <div>PipelineContextSelector</div>
      <button type="button" onClick={() => onProjectIdChange("other")}>
        change-project
      </button>
      <button
        type="button"
        onClick={() => onRunKeyChange("demo/run-20260228-0900")}
      >
        change-run
      </button>
      <button type="button" onClick={() => onEpisodeIdChange("E02")}>
        change-episode
      </button>
    </div>
  ),
}));

vi.mock("@/components/pipeline/PipelineLayer1Panel", () => ({
  PipelineLayer1Panel: () => <div>PipelineLayer1Panel</div>,
}));

vi.mock("@/components/pipeline/PipelineLayer2Panel", () => ({
  PipelineLayer2Panel: () => <div>PipelineLayer2Panel</div>,
}));

vi.mock("@/components/pipeline/PipelineUtilityPanel", () => ({
  PipelineUtilityPanel: () => <div>PipelineUtilityPanel</div>,
}));

vi.mock("@/components/feedback/ApiErrorBanner", () => ({
  ApiErrorBanner: () => <div>ApiErrorBanner</div>,
}));

vi.mock("@/components/pipeline/LogTerminal", () => ({
  LogTerminal: () => <div>LogTerminal</div>,
}));

describe("PipelinePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePipelineJobMock.mockImplementation(() => ({
      logs: [],
      logStatus: "idle",
      runningCommand: null,
      apiError: null,
      isJobActive: false,
      getStepStatus: vi.fn(() => "idle"),
      startJob,
      startStepJob,
      cancel,
      resetStatuses,
    }));
  });

  test("route composition と tab 切り替えを維持する", () => {
    render(<PipelinePage />);

    expect(screen.getByText("PipelineHeader")).toBeTruthy();
    expect(screen.getByText("PipelineContextSelector")).toBeTruthy();
    expect(screen.getByText("PipelineLayer1Panel")).toBeTruthy();
    expect(screen.getByText("ApiErrorBanner")).toBeTruthy();
    expect(screen.getByText("LogTerminal")).toBeTruthy();
    expect(screen.getByText("VOICEVOX v0.25.1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Layer 2 — 音声合成" }));
    expect(screen.getByText("PipelineLayer2Panel")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "ユーティリティ" }));
    expect(screen.getByText("PipelineUtilityPanel")).toBeTruthy();
  });

  test("context selector の変更操作が setter と status reset に伝播する", () => {
    render(<PipelinePage />);

    fireEvent.click(screen.getByRole("button", { name: "change-project" }));
    expect(setProjectId).toHaveBeenCalledWith("other");
    expect(setRunKey).toHaveBeenCalledWith("");
    expect(setEpisodeId).toHaveBeenCalledWith("");
    expect(resetStatuses).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "change-run" }));
    expect(setRunKey).toHaveBeenCalledWith("demo/run-20260228-0900");
    expect(resetStatuses).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "change-episode" }));
    expect(setEpisodeId).toHaveBeenCalledWith("E02");
    expect(resetStatuses).toHaveBeenCalledTimes(3);
  });

  test("gen-blueprint 完了時に run query を refresh して auto-select を要求する", async () => {
    render(<PipelinePage />);

    const options = usePipelineJobMock.mock.calls[0]?.[0] as {
      onGenBlueprintDone: () => Promise<void>;
      onRunStatusRefresh: () => Promise<void>;
    };

    await act(async () => {
      await options.onGenBlueprintDone();
    });

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["runs"] });
    expect(requestAutoSelectRun).toHaveBeenCalledTimes(1);

    await act(async () => {
      await options.onRunStatusRefresh();
    });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["run-status"],
    });
  });
});
