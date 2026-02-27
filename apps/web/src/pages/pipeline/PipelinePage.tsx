import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { RunStatus } from "@/api/client";
import { ApiErrorBanner } from "@/components/feedback/ApiErrorBanner";
import { LogTerminal } from "@/components/pipeline/LogTerminal";
import { PipelineContextSelector } from "@/components/pipeline/PipelineContextSelector";
import { PipelineHeader } from "@/components/pipeline/PipelineHeader";
import { PipelineShortcutPanel } from "@/components/pipeline/PipelineShortcutPanel";
import { PipelineStepList } from "@/components/pipeline/PipelineStepList";
import { PipelineUtilityPanel } from "@/components/pipeline/PipelineUtilityPanel";
import { TabBar } from "@/components/ui/tab-bar";
import { useFlashMessage } from "@/hooks/useFlashMessage";
import { usePipelineContext } from "@/hooks/usePipelineContext";
import { usePipelineJob } from "@/hooks/usePipelineJob";
import {
  getLayer1StepArgs,
  getLayer2StepArgs,
  LAYER1_STEPS,
  LAYER2_STEPS,
  type Layer1StepKey,
  type Layer2StepKey,
  PIPELINE_TABS,
  type PipelineTab,
  type StepKey,
  type StepStatus,
} from "@/lib/pipeline-steps";
import { queryKeys } from "@/lib/query-keys";

export function PipelinePage() {
  const queryClient = useQueryClient();
  const [isJobActiveForQuery, setIsJobActiveForQuery] = useState(false);
  const context = usePipelineContext(isJobActiveForQuery);
  const {
    projectId,
    runKey,
    episodeId,
    setProjectId,
    setRunKey,
    setEpisodeId,
    paths,
    voicevoxQuery,
    runStatusQuery,
    projectsQuery,
    runsQuery,
    requestAutoSelectRun,
  } = context;

  const job = usePipelineJob({
    onGenBlueprintDone: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.runs.all });
      requestAutoSelectRun();
    },
    onRunStatusRefresh: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.runs.statusAll }),
  });

  useEffect(() => {
    setIsJobActiveForQuery(job.isJobActive);
  }, [job.isJobActive]);

  const [pipelineTab, setPipelineTab] = useState<PipelineTab>("layer1");
  const [copiedStep, setCopiedStep] = useState<string | null>(null);
  const [hoveredCommand, setHoveredCommand] = useState<string | null>(null);
  const copiedFlash = useFlashMessage(2000);

  const handleRunLayer1Step = (stepKey: Layer1StepKey) => {
    if (!projectId) return;
    const runDir = paths?.runDir ?? "";
    const args = getLayer1StepArgs(stepKey, projectId, episodeId, runDir);
    job.startStepJob(stepKey, stepKey, args);
  };

  const handleRunLayer2Step = (stepKey: Layer2StepKey) => {
    if (!paths) return;
    const args = getLayer2StepArgs(stepKey, paths);
    job.startStepJob(stepKey, stepKey, args);
  };

  const handleRunBuildAll = () => {
    if (!paths) return;
    job.startJob("build-all", ["--script", paths.script]);
  };

  const handleRunUtil = (command: string, args: string[]) => {
    job.startJob(command, args);
  };

  const handleCancel = () => {
    job.cancel();
  };

  const handleProjectIdChange = (id: string) => {
    setProjectId(id);
    setRunKey("");
    job.resetStatuses();
  };

  const handleRunKeyChange = (key: string) => {
    setRunKey(key);
    job.resetStatuses();
  };

  const handleEpisodeIdChange = (id: string) => {
    setEpisodeId(id);
    job.resetStatuses();
  };

  const runStatus: RunStatus | undefined = runStatusQuery.data;

  const episodeInStage = (
    stage: RunStatus["stages"][keyof RunStatus["stages"]],
    id: string,
  ): boolean => {
    if (stage.status === "completed") return true;
    if (stage.status === "idle") return false;
    return "episodeIds" in stage && stage.episodeIds.includes(id);
  };

  const getStepStatus = (stepKey: StepKey): StepStatus =>
    job.getStepStatus(stepKey);

  const getLayer1StepDisplayStatus = (stepKey: Layer1StepKey): StepStatus => {
    const session = getStepStatus(stepKey);
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
    const session = getStepStatus(stepKey);
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

  const isAnyStepRunning = job.isJobActive;

  const canRunLayer1Step = (stepKey: Layer1StepKey): boolean => {
    if (!projectId || isAnyStepRunning) return false;
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

  const copyCommand = (stepKey: string, command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedStep(stepKey);
    copiedFlash.flash();
  };

  return (
    <div className="flex h-full min-w-0 flex-col gap-4">
      <PipelineHeader
        rightContent={
          voicevoxQuery.isSuccess ? (
            <>
              <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
              <span className="text-slate-600">
                VOICEVOX v{voicevoxQuery.data.version}
              </span>
            </>
          ) : voicevoxQuery.isError ? (
            <>
              <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
              <span className="text-slate-500">VOICEVOX offline</span>
            </>
          ) : (
            <span className="animate-pulse text-slate-400">
              VOICEVOX 確認中...
            </span>
          )
        }
      />

      <TabBar
        tabs={PIPELINE_TABS}
        activeTab={pipelineTab}
        onTabChange={setPipelineTab}
      />

      <PipelineContextSelector
        projectId={projectId}
        runKey={runKey}
        episodeId={episodeId}
        plannedEpisodeIds={runStatus?.plannedEpisodeIds}
        isDisabled={isAnyStepRunning}
        projects={projectsQuery.data?.items}
        runs={runsQuery.data?.items}
        onProjectIdChange={handleProjectIdChange}
        onRunKeyChange={handleRunKeyChange}
        onEpisodeIdChange={handleEpisodeIdChange}
      />

      {pipelineTab === "layer1" && (
        <PipelineStepList
          title="Layer 1 — LLM 生成（claude --print 経由）"
          steps={LAYER1_STEPS}
          getStepStatus={(stepKey) =>
            getLayer1StepDisplayStatus(stepKey as Layer1StepKey)
          }
          canRunStep={(stepKey) => canRunLayer1Step(stepKey as Layer1StepKey)}
          isNextStep={(index, stepKey) => {
            const key = stepKey as Layer1StepKey;
            const isThisCompleted = getLayer1StepDisplayStatus(key) === "done";
            const isPrevCompleted =
              index === 0 ||
              getLayer1StepDisplayStatus(LAYER1_STEPS[index - 1].key) ===
                "done";
            return !isThisCompleted && isPrevCompleted && canRunLayer1Step(key);
          }}
          onRunStep={(stepKey) => handleRunLayer1Step(stepKey as Layer1StepKey)}
          onCancel={handleCancel}
          commandForStep={(stepKey) => {
            if (!projectId) return null;
            const args = getLayer1StepArgs(
              stepKey as Layer1StepKey,
              projectId,
              episodeId,
              paths?.runDir ?? "",
            );
            return `bun run ${stepKey} -- ${args.join(" ")}`;
          }}
          copiedStep={copiedFlash.visible ? copiedStep : null}
          onCopyStep={copyCommand}
          onPreviewCommand={setHoveredCommand}
        />
      )}

      {pipelineTab === "layer2" && (
        <div className="space-y-0">
          <PipelineStepList
            title="Layer 2 — 音声合成パイプライン"
            steps={LAYER2_STEPS}
            numberingOffset={LAYER1_STEPS.length}
            getStepStatus={(stepKey) =>
              getLayer2StepDisplayStatus(stepKey as Layer2StepKey)
            }
            canRunStep={(stepKey) => canRunLayer2Step(stepKey as Layer2StepKey)}
            isNextStep={(index, stepKey) => {
              const key = stepKey as Layer2StepKey;
              const isThisCompleted =
                getLayer2StepDisplayStatus(key) === "done";
              const isPrevCompleted =
                index === 0 ||
                getLayer2StepDisplayStatus(LAYER2_STEPS[index - 1].key) ===
                  "done";
              return (
                !isThisCompleted &&
                !!paths &&
                isPrevCompleted &&
                canRunLayer2Step(key)
              );
            }}
            onRunStep={(stepKey) =>
              handleRunLayer2Step(stepKey as Layer2StepKey)
            }
            onCancel={handleCancel}
            commandForStep={(stepKey) => {
              if (!paths) return null;
              const args = getLayer2StepArgs(stepKey as Layer2StepKey, paths);
              return `bun run ${stepKey} -- ${args.join(" ")}`;
            }}
            copiedStep={copiedFlash.visible ? copiedStep : null}
            onCopyStep={copyCommand}
            onPreviewCommand={setHoveredCommand}
          />
          <div className="rounded-b-xl border-x border-b border-slate-200 bg-white/80 px-4 pb-4 backdrop-blur">
            <PipelineShortcutPanel
              isRunningBuildAll={
                isAnyStepRunning && job.runningCommand === "build-all"
              }
              canRunBuildAll={
                canRunLayer2Step("build-text") && !isAnyStepRunning
              }
              onRunBuildAll={handleRunBuildAll}
              onCancel={handleCancel}
            />
          </div>
        </div>
      )}

      {pipelineTab === "utility" && (
        <PipelineUtilityPanel
          paths={paths}
          isAnyStepRunning={isAnyStepRunning}
          onRunUtil={handleRunUtil}
        />
      )}

      <ApiErrorBanner error={job.apiError} />

      <LogTerminal
        logs={job.logs}
        status={job.logStatus}
        command={job.runningCommand ?? undefined}
        previewCommand={hoveredCommand ?? undefined}
      />
    </div>
  );
}
