import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { ApiErrorBanner } from "@/components/feedback/ApiErrorBanner";
import { LogTerminal } from "@/components/pipeline/LogTerminal";
import { PipelineContextSelector } from "@/components/pipeline/PipelineContextSelector";
import { PipelineHeader } from "@/components/pipeline/PipelineHeader";
import { PipelineAuthoringPanel } from "@/components/pipeline/PipelineAuthoringPanel";
import { PipelineLayer2Panel } from "@/components/pipeline/PipelineLayer2Panel";
import { PipelineUtilityPanel } from "@/components/pipeline/PipelineUtilityPanel";
import { TabBar } from "@/components/ui/tab-bar";
import { useFlashMessage } from "@/hooks/useFlashMessage";
import { usePipelineAvailability } from "@/hooks/usePipelineAvailability";
import { usePipelineContext } from "@/hooks/usePipelineContext";
import { usePipelineJob } from "@/hooks/usePipelineJob";
import {
  getAuthoringStepArgs,
  type AuthoringStepKey,
  type Layer2StepKey,
  PIPELINE_TABS,
  type PipelineTab,
} from "@/lib/pipeline-steps";
import { queryKeys } from "@/lib/query-keys";

export function PipelinePage() {
  const queryClient = useQueryClient();
  const [isJobActiveForQuery, setIsJobActiveForQuery] = useState(false);
  const [pipelineTab, setPipelineTab] = useState<PipelineTab>("authoring");
  const [copiedStep, setCopiedStep] = useState<string | null>(null);
  const [hoveredCommand, setHoveredCommand] = useState<string | null>(null);
  const copiedFlash = useFlashMessage(2000);

  const context = usePipelineContext(isJobActiveForQuery);
  const {
    projectId,
    runKey,
    episodeId,
    episodeOptions,
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
    onGenSourceIndexDone: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.runs.all });
      requestAutoSelectRun();
    },
    onRunStatusRefresh: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.runs.statusAll }),
  });

  useEffect(() => {
    setIsJobActiveForQuery(job.isJobActive);
  }, [job.isJobActive]);

  const availability = usePipelineAvailability({
    runStatus: runStatusQuery.data,
    episodeId,
    paths,
    isAnyStepRunning: job.isJobActive,
    voicevoxOffline: voicevoxQuery.isError,
    getSessionStatus: job.getStepStatus,
  });

  const handleRunAuthoringStep = (stepKey: AuthoringStepKey) => {
    if (!projectId) return;
    const args = getAuthoringStepArgs(stepKey, projectId, episodeId);
    job.startStepJob(stepKey, stepKey, args);
  };

  const handleRunLayer2Step = (stepKey: Layer2StepKey) => {
    if (!paths) return;
    job.startStepJob(stepKey, stepKey, [
      ...(stepKey === "build-text"
        ? ["--script", paths.script]
        : stepKey === "patch-voicevox-text"
          ? ["--voicevox-text-json", paths.voicevoxTextRaw]
          : stepKey === "build-project"
            ? ["--voicevox-text-json", paths.voicevoxTextPatched]
            : ["--vvproj", paths.vvproj]),
    ]);
  };

  const handleRunBuildAll = () => {
    if (!paths) return;
    job.startJob("build-all", ["--script", paths.script]);
  };

  const handleProjectIdChange = (id: string) => {
    setProjectId(id);
    setRunKey("");
    setEpisodeId("");
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

  const copyCommand = (stepKey: string, command: string) => {
    navigator.clipboard.writeText(command);
    setCopiedStep(stepKey);
    copiedFlash.flash();
  };

  const isEpisodeDisabled =
    !runKey ||
    !runStatusQuery.data ||
    runStatusQuery.data.stages.blueprint.status !== "completed" ||
    runStatusQuery.data.plannedEpisodeIds.length === 0;

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
        episodeOptions={episodeOptions}
        isDisabled={job.isJobActive}
        isEpisodeDisabled={isEpisodeDisabled}
        projects={projectsQuery.data?.items}
        runs={runsQuery.data?.items}
        onProjectIdChange={handleProjectIdChange}
        onRunKeyChange={handleRunKeyChange}
        onEpisodeIdChange={handleEpisodeIdChange}
      />

      {pipelineTab === "authoring" && (
        <PipelineAuthoringPanel
          projectId={projectId}
          episodeId={episodeId}
          availability={availability}
          copiedStep={copiedStep}
          copiedVisible={copiedFlash.visible}
          onRunStep={handleRunAuthoringStep}
          onCancel={job.cancel}
          onCopyStep={copyCommand}
          onPreviewCommand={setHoveredCommand}
        />
      )}

      {pipelineTab === "layer2" && (
        <PipelineLayer2Panel
          paths={paths}
          availability={availability}
          isAnyStepRunning={job.isJobActive}
          runningCommand={job.runningCommand}
          copiedStep={copiedStep}
          copiedVisible={copiedFlash.visible}
          onRunStep={handleRunLayer2Step}
          onRunBuildAll={handleRunBuildAll}
          onCancel={job.cancel}
          onCopyStep={copyCommand}
          onPreviewCommand={setHoveredCommand}
        />
      )}

      {pipelineTab === "utility" && (
        <PipelineUtilityPanel
          paths={paths}
          isAnyStepRunning={job.isJobActive}
          onRunUtil={(command, args) => job.startJob(command, args)}
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
