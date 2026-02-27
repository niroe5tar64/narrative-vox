// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PipelineLayer2Panel } from "@/components/pipeline/PipelineLayer2Panel";
import { usePipelineAvailability } from "@/hooks/usePipelineAvailability";
import type { Paths } from "@/lib/pipeline-steps";

const paths: Paths = {
  script: "data/projects/demo/run-20260227-1200/script/E01_script.md",
  voicevoxTextRaw:
    "data/projects/demo/run-20260227-1200/voicevox_text/E01_voicevox_text.json",
  voicevoxTextPatched:
    "data/projects/demo/run-20260227-1200/voicevox_text/E01_voicevox_text.patched.json",
  vvproj: "data/projects/demo/run-20260227-1200/voicevox_project/E01.vvproj",
  runDir: "data/projects/demo/run-20260227-1200",
};

const availability: ReturnType<typeof usePipelineAvailability> = {
  getLayer1StepDisplayStatus: vi.fn(),
  getLayer2StepDisplayStatus: vi.fn(() => "idle"),
  canRunLayer1Step: vi.fn(),
  canRunLayer2Step: vi.fn((stepKey: string) => !["build-project", "build-all"].includes(stepKey)),
  getLayer1DisabledReason: vi.fn(),
  getLayer2DisabledReason: vi.fn((stepKey: string) =>
    stepKey === "build-project"
      ? "VOICEVOX が offline のため実行できません"
      : null,
  ),
  isNextLayer1Step: vi.fn(),
  isNextLayer2Step: vi.fn((index: number) => index === 0),
  canRunBuildAll: false,
  buildAllDisabledReason: "VOICEVOX が offline のため実行できません",
};

describe("PipelineLayer2Panel", () => {
  test("disabled reason を step button wrapper と shortcut に表示する", () => {
    render(
      <PipelineLayer2Panel
        paths={paths}
        availability={availability}
        isAnyStepRunning={false}
        runningCommand={null}
        copiedStep={null}
        copiedVisible={false}
        onRunStep={vi.fn()}
        onRunBuildAll={vi.fn()}
        onCancel={vi.fn()}
        onCopyStep={vi.fn()}
        onPreviewCommand={vi.fn()}
      />,
    );

    expect(screen.getAllByTitle("VOICEVOX が offline のため実行できません")).toHaveLength(2);
    expect(
      (
        screen.getByRole("button", { name: "ステップ ⑤⑥⑦ をまとめて実行" }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("shortcut の実行操作を forwarding する", () => {
    const onRunBuildAll = vi.fn();
    const enabledAvailability = {
      ...availability,
      canRunBuildAll: true,
      buildAllDisabledReason: null,
    };

    render(
      <PipelineLayer2Panel
        paths={paths}
        availability={enabledAvailability}
        isAnyStepRunning={false}
        runningCommand={null}
        copiedStep={null}
        copiedVisible={false}
        onRunStep={vi.fn()}
        onRunBuildAll={onRunBuildAll}
        onCancel={vi.fn()}
        onCopyStep={vi.fn()}
        onPreviewCommand={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "ステップ ⑤⑥⑦ をまとめて実行" }));
    expect(onRunBuildAll).toHaveBeenCalledTimes(1);
  });
});
