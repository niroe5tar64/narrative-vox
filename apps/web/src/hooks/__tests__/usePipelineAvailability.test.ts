// @vitest-environment jsdom
import type { RunStatus } from "@narrative-vox/api-types";
import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { usePipelineAvailability } from "@/hooks/usePipelineAvailability";
import type { Paths, StepKey } from "@/lib/pipeline-steps";

function createRunStatus(): RunStatus {
  return {
    projectId: "demo",
    runId: "run-20260227-1200",
    plannedEpisodeIds: ["E01"],
    stages: {
      source_index: { status: "completed" },
      blueprint: { status: "completed" },
      episode_pack: { status: "partial", episodeIds: ["E01"] },
      script: { status: "partial", episodeIds: ["E01"] },
      series_context: { status: "idle", episodeIds: [] },
      voicevox_text: { status: "idle", episodeIds: [] },
      voicevox_project: { status: "idle", episodeIds: [] },
      audio: { status: "idle", episodeIds: [] },
    },
  };
}

const paths: Paths = {
  script: "data/projects/demo/run-20260227-1200/script/E01_script.md",
  voicevoxTextRaw:
    "data/projects/demo/run-20260227-1200/voicevox_text/E01_voicevox_text.json",
  voicevoxTextPatched:
    "data/projects/demo/run-20260227-1200/voicevox_text/E01_voicevox_text.patched.json",
  vvproj: "data/projects/demo/run-20260227-1200/voicevox_project/E01.vvproj",
  runDir: "data/projects/demo/run-20260227-1200",
};

function createAvailability(
  overrides?: Partial<Parameters<typeof usePipelineAvailability>[0]>,
) {
  const { result } = renderHook(() =>
    usePipelineAvailability({
      runStatus: createRunStatus(),
      episodeId: "E01",
      paths,
      isAnyStepRunning: false,
      voicevoxOffline: false,
      getSessionStatus: vi.fn((_stepKey: StepKey) => "idle"),
      ...overrides,
    }),
  );
  return result.current;
}

describe("usePipelineAvailability", () => {
  test("authoring prerequisite と next step 判定を維持する", () => {
    const availability = createAvailability();

    expect(
      availability.getAuthoringStepDisplayStatus("gen-source-index"),
    ).toBe("done");
    expect(availability.getAuthoringStepDisplayStatus("gen-blueprint")).toBe(
      "done",
    );
    expect(
      availability.getAuthoringStepDisplayStatus("gen-episode-pack"),
    ).toBe("done");
    expect(availability.getAuthoringStepDisplayStatus("gen-script")).toBe(
      "done",
    );
    expect(
      availability.getAuthoringStepDisplayStatus("update-series-context"),
    ).toBe("idle");
    expect(availability.canRunAuthoringStep("update-series-context")).toBe(true);
    expect(
      availability.isNextAuthoringStep(4, "update-series-context"),
    ).toBe(true);
  });

  test("gen-source-index は常に実行可能", () => {
    const availability = createAvailability({
      runStatus: undefined,
    });
    expect(availability.canRunAuthoringStep("gen-source-index")).toBe(true);
  });

  test("gen-blueprint は source_index completed が必要", () => {
    const runStatus = createRunStatus();
    runStatus.stages.source_index = { status: "idle" };
    const availability = createAvailability({ runStatus });
    expect(availability.canRunAuthoringStep("gen-blueprint")).toBe(false);
  });

  test("gen-episode-pack は blueprint completed + episodeId が必要", () => {
    const runStatus = createRunStatus();
    runStatus.stages.blueprint = { status: "idle" };
    const availability = createAvailability({ runStatus });
    expect(availability.canRunAuthoringStep("gen-episode-pack")).toBe(false);
  });

  test("VOICEVOX offline 時は audio 系 step と build-all を止める", () => {
    const runStatus = createRunStatus();
    runStatus.stages.voicevox_text = {
      status: "partial",
      episodeIds: ["E01"],
    };
    runStatus.stages.voicevox_project = {
      status: "partial",
      episodeIds: ["E01"],
    };

    const availability = createAvailability({
      runStatus,
      voicevoxOffline: true,
    });

    expect(availability.canRunLayer2Step("build-text")).toBe(true);
    expect(availability.canRunLayer2Step("patch-voicevox-text")).toBe(true);
    expect(availability.canRunLayer2Step("build-project")).toBe(false);
    expect(availability.canRunLayer2Step("build-audio")).toBe(false);
    expect(availability.getLayer2DisabledReason("build-project")).toBe(
      "VOICEVOX が offline のため実行できません",
    );
    expect(availability.canRunBuildAll).toBe(false);
    expect(availability.buildAllDisabledReason).toBe(
      "VOICEVOX が offline のため実行できません",
    );
  });

  test("build-all は build-text が実行可能なときだけ有効になる", () => {
    const runStatus = createRunStatus();
    runStatus.stages.script = { status: "idle", episodeIds: [] };

    const availability = createAvailability({ runStatus });

    expect(availability.canRunLayer2Step("build-text")).toBe(false);
    expect(availability.canRunBuildAll).toBe(false);
    expect(availability.buildAllDisabledReason).toBe("script が未生成です");
  });
});
