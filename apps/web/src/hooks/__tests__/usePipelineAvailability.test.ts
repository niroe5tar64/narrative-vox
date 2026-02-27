import { describe, expect, test, vi } from "vitest";
import type { RunStatus } from "@/api/client";
import { usePipelineAvailability } from "@/hooks/usePipelineAvailability";
import type { Paths, StepKey } from "@/lib/pipeline-steps";

function createRunStatus(): RunStatus {
  return {
    projectId: "demo",
    runId: "run-20260227-1200",
    plannedEpisodeIds: ["E01"],
    stages: {
      blueprint: { status: "completed" },
      material: { status: "partial", episodeIds: ["E01"] },
      script: { status: "partial", episodeIds: ["E01"] },
      context: { status: "idle", episodeIds: [] },
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

function createAvailability(overrides?: Partial<Parameters<typeof usePipelineAvailability>[0]>) {
  return usePipelineAvailability({
    runStatus: createRunStatus(),
    episodeId: "E01",
    paths,
    isAnyStepRunning: false,
    voicevoxOffline: false,
    getSessionStatus: vi.fn((_stepKey: StepKey) => "idle"),
    ...overrides,
  });
}

describe("usePipelineAvailability", () => {
  test("layer1 prerequisite と next step 判定を維持する", () => {
    const availability = createAvailability();

    expect(availability.getLayer1StepDisplayStatus("gen-blueprint")).toBe("done");
    expect(availability.getLayer1StepDisplayStatus("gen-material")).toBe("done");
    expect(availability.getLayer1StepDisplayStatus("gen-script")).toBe("done");
    expect(availability.getLayer1StepDisplayStatus("gen-digest")).toBe("idle");
    expect(availability.canRunLayer1Step("gen-digest")).toBe(true);
    expect(availability.isNextLayer1Step(3, "gen-digest")).toBe(true);
  });

  test("VOICEVOX offline 時は audio 系 step と build-all を止める", () => {
    const runStatus = createRunStatus();
    runStatus.stages.voicevox_text = { status: "partial", episodeIds: ["E01"] };
    runStatus.stages.voicevox_project = { status: "partial", episodeIds: ["E01"] };

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
