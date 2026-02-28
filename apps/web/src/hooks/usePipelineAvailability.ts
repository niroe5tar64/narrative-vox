import type { RunStatus } from "@narrative-vox/api-types";
import type {
  Layer1StepKey,
  Layer2StepKey,
  Paths,
  StepKey,
  StepStatus,
} from "@/lib/pipeline-steps";

type Stage = RunStatus["stages"][keyof RunStatus["stages"]];

type Params = {
  runStatus: RunStatus | undefined;
  episodeId: string;
  paths: Paths | null;
  isAnyStepRunning: boolean;
  voicevoxOffline: boolean;
  getSessionStatus: (stepKey: StepKey) => StepStatus;
};

function episodeInStage(stage: Stage, id: string): boolean {
  if (stage.status === "completed") return true;
  if (stage.status === "idle") return false;
  return "episodeIds" in stage && stage.episodeIds.includes(id);
}

export function usePipelineAvailability({
  runStatus,
  episodeId,
  paths,
  isAnyStepRunning,
  voicevoxOffline,
  getSessionStatus,
}: Params) {
  const getLayer1StepDisplayStatus = (stepKey: Layer1StepKey): StepStatus => {
    const session = getSessionStatus(stepKey);
    if (session === "running" || session === "error") return session;
    if (session === "done") return "done";
    if (!runStatus || !episodeId) return "idle";
    switch (stepKey) {
      case "gen-blueprint":
        return runStatus.stages.blueprint.status === "completed"
          ? "done"
          : "idle";
      case "gen-material":
        return episodeInStage(runStatus.stages.material, episodeId)
          ? "done"
          : "idle";
      case "gen-script":
        return episodeInStage(runStatus.stages.script, episodeId)
          ? "done"
          : "idle";
      case "gen-digest":
        return episodeInStage(runStatus.stages.context, episodeId)
          ? "done"
          : "idle";
    }
  };

  const getLayer2StepDisplayStatus = (stepKey: Layer2StepKey): StepStatus => {
    const session = getSessionStatus(stepKey);
    if (session === "running" || session === "error") return session;
    if (session === "done") return "done";
    if (!runStatus || !episodeId) return "idle";
    switch (stepKey) {
      case "build-text":
        return episodeInStage(runStatus.stages.voicevox_text, episodeId)
          ? "done"
          : "idle";
      case "patch-voicevox-text":
        return "idle";
      case "build-project":
        return episodeInStage(runStatus.stages.voicevox_project, episodeId)
          ? "done"
          : "idle";
      case "build-audio":
        return episodeInStage(runStatus.stages.audio, episodeId)
          ? "done"
          : "idle";
    }
  };

  const canRunLayer1Step = (stepKey: Layer1StepKey): boolean => {
    if (isAnyStepRunning) return false;
    switch (stepKey) {
      case "gen-blueprint":
        return true;
      case "gen-material":
        return !!runStatus && runStatus.stages.blueprint.status === "completed";
      case "gen-script":
        return (
          !!runStatus &&
          !!episodeId &&
          episodeInStage(runStatus.stages.material, episodeId)
        );
      case "gen-digest":
        return (
          !!runStatus &&
          !!episodeId &&
          episodeInStage(runStatus.stages.script, episodeId)
        );
    }
  };

  const canRunLayer2Step = (stepKey: Layer2StepKey): boolean => {
    if (!paths || isAnyStepRunning) return false;
    if (voicevoxOffline && ["build-project", "build-audio"].includes(stepKey)) {
      return false;
    }
    if (!runStatus) return true;
    switch (stepKey) {
      case "build-text":
        return episodeInStage(runStatus.stages.script, episodeId);
      case "patch-voicevox-text":
        return episodeInStage(runStatus.stages.voicevox_text, episodeId);
      case "build-project":
        return episodeInStage(runStatus.stages.voicevox_text, episodeId);
      case "build-audio":
        return episodeInStage(runStatus.stages.voicevox_project, episodeId);
    }
  };

  const getLayer1DisabledReason = (): string | null => {
    if (isAnyStepRunning) return "別のジョブが実行中です";
    return null;
  };

  const getLayer2DisabledReason = (stepKey: Layer2StepKey): string | null => {
    if (!paths) return "run と episode を選択してください";
    if (isAnyStepRunning) return "別のジョブが実行中です";
    if (voicevoxOffline && ["build-project", "build-audio"].includes(stepKey)) {
      return "VOICEVOX が offline のため実行できません";
    }
    if (!runStatus) return null;
    switch (stepKey) {
      case "build-text":
        return episodeInStage(runStatus.stages.script, episodeId)
          ? null
          : "script が未生成です";
      case "patch-voicevox-text":
        return episodeInStage(runStatus.stages.voicevox_text, episodeId)
          ? null
          : "voicevox_text が未生成です";
      case "build-project":
        return episodeInStage(runStatus.stages.voicevox_text, episodeId)
          ? null
          : "voicevox_text が未生成です";
      case "build-audio":
        return episodeInStage(runStatus.stages.voicevox_project, episodeId)
          ? null
          : "voicevox_project が未生成です";
    }
  };

  const isNextLayer1Step = (index: number, stepKey: Layer1StepKey): boolean => {
    const isThisCompleted = getLayer1StepDisplayStatus(stepKey) === "done";
    const isPrevCompleted =
      index === 0 ||
      getLayer1StepDisplayStatus(
        (
          ["gen-blueprint", "gen-material", "gen-script", "gen-digest"] as const
        )[index - 1],
      ) === "done";
    return !isThisCompleted && isPrevCompleted && canRunLayer1Step(stepKey);
  };

  const isNextLayer2Step = (index: number, stepKey: Layer2StepKey): boolean => {
    const ordered = [
      "build-text",
      "patch-voicevox-text",
      "build-project",
      "build-audio",
    ] as const;
    const isThisCompleted = getLayer2StepDisplayStatus(stepKey) === "done";
    const isPrevCompleted =
      index === 0 || getLayer2StepDisplayStatus(ordered[index - 1]) === "done";
    return (
      !isThisCompleted &&
      !!paths &&
      isPrevCompleted &&
      canRunLayer2Step(stepKey)
    );
  };

  const canRunBuildAll =
    canRunLayer2Step("build-text") && !isAnyStepRunning && !voicevoxOffline;
  const buildAllDisabledReason = voicevoxOffline
    ? "VOICEVOX が offline のため実行できません"
    : getLayer2DisabledReason("build-text");

  return {
    getLayer1StepDisplayStatus,
    getLayer2StepDisplayStatus,
    canRunLayer1Step,
    canRunLayer2Step,
    getLayer1DisabledReason,
    getLayer2DisabledReason,
    isNextLayer1Step,
    isNextLayer2Step,
    canRunBuildAll,
    buildAllDisabledReason,
  };
}
