import type { RunStatus } from "@narrative-vox/api-types";
import type {
  AuthoringStepKey,
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
  const getAuthoringStepDisplayStatus = (
    stepKey: AuthoringStepKey,
  ): StepStatus => {
    const session = getSessionStatus(stepKey);
    if (session === "running" || session === "error") return session;
    if (session === "done") return "done";
    if (!runStatus) return "idle";
    switch (stepKey) {
      case "gen-source-index":
        return runStatus.stages.source_index.status === "completed"
          ? "done"
          : "idle";
      case "gen-blueprint":
        return runStatus.stages.blueprint.status === "completed"
          ? "done"
          : "idle";
      case "gen-episode-pack":
        return episodeId &&
          episodeInStage(runStatus.stages.episode_pack, episodeId)
          ? "done"
          : "idle";
      case "gen-script":
        return episodeId && episodeInStage(runStatus.stages.script, episodeId)
          ? "done"
          : "idle";
      case "update-series-context":
        return episodeId &&
          episodeInStage(runStatus.stages.series_context, episodeId)
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

  const canRunAuthoringStep = (stepKey: AuthoringStepKey): boolean => {
    if (isAnyStepRunning) return false;
    switch (stepKey) {
      case "gen-source-index":
        return true;
      case "gen-blueprint":
        return (
          !!runStatus &&
          runStatus.stages.source_index.status === "completed"
        );
      case "gen-episode-pack":
        return (
          !!runStatus &&
          runStatus.stages.blueprint.status === "completed" &&
          !!episodeId
        );
      case "gen-script":
        return (
          !!runStatus &&
          !!episodeId &&
          episodeInStage(runStatus.stages.episode_pack, episodeId)
        );
      case "update-series-context":
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

  const getAuthoringDisabledReason = (): string | null => {
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

  const isNextAuthoringStep = (
    index: number,
    stepKey: AuthoringStepKey,
  ): boolean => {
    const isThisCompleted =
      getAuthoringStepDisplayStatus(stepKey) === "done";
    const isPrevCompleted =
      index === 0 ||
      getAuthoringStepDisplayStatus(
        (
          [
            "gen-source-index",
            "gen-blueprint",
            "gen-episode-pack",
            "gen-script",
            "update-series-context",
          ] as const
        )[index - 1],
      ) === "done";
    return !isThisCompleted && isPrevCompleted && canRunAuthoringStep(stepKey);
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
    getAuthoringStepDisplayStatus,
    getLayer2StepDisplayStatus,
    canRunAuthoringStep,
    canRunLayer2Step,
    getAuthoringDisabledReason,
    getLayer2DisabledReason,
    isNextAuthoringStep,
    isNextLayer2Step,
    canRunBuildAll,
    buildAllDisabledReason,
  };
}
