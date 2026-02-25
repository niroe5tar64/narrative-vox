import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { ApiError, api, type RunStatus } from "@/api/client";
import { LogTerminal } from "@/components/pipeline/LogTerminal";
import { PipelineContextSelector } from "@/components/pipeline/PipelineContextSelector";
import { PipelineHeader } from "@/components/pipeline/PipelineHeader";
import { PipelineShortcutPanel } from "@/components/pipeline/PipelineShortcutPanel";
import { PipelineStepList } from "@/components/pipeline/PipelineStepList";
import { PipelineUtilityPanel } from "@/components/pipeline/PipelineUtilityPanel";
import { TabBar } from "@/components/ui/tab-bar";
import { usePipelineLog } from "@/hooks/usePipelineLog";

const LAYER1_STEPS = [
  {
    key: "gen-blueprint",
    label: "ブループリント生成",
    note: "全体設計 JSON の生成",
  },
  {
    key: "gen-material",
    label: "素材生成",
    note: "エピソード素材 JSON の生成",
  },
  {
    key: "gen-script",
    label: "台本生成",
    note: "素材 → ナレーション台本 (.md)",
  },
  {
    key: "gen-digest",
    label: "ダイジェスト生成",
    note: "エピソード間一貫性用 JSON",
  },
] as const;

const LAYER2_STEPS = [
  {
    key: "build-text",
    label: "テキスト変換",
    note: "台本 (.md) → VOICEVOX テキスト (.json)",
  },
  {
    key: "patch-voicevox-text",
    label: "テキスト正規化",
    note: "辞書パッチ・読み仮名補正",
  },
  {
    key: "build-project",
    label: "プロジェクト生成",
    note: "テキスト → VOICEVOX プロジェクト (.vvproj)",
  },
  {
    key: "build-audio",
    label: "音声合成",
    note: "VOICEVOX が必要",
  },
] as const;

type Layer1StepKey = (typeof LAYER1_STEPS)[number]["key"];
type Layer2StepKey = (typeof LAYER2_STEPS)[number]["key"];
type StepKey = Layer1StepKey | Layer2StepKey;

type Paths = {
  script: string;
  voicevoxTextRaw: string;
  voicevoxTextPatched: string;
  vvproj: string;
  runDir: string;
};

function derivePaths(runKey: string, episodeId: string): Paths | null {
  if (!runKey || !episodeId) return null;
  const idx = runKey.indexOf("/");
  if (idx < 0) return null;
  const projectId = runKey.slice(0, idx);
  const runId = runKey.slice(idx + 1);
  const base = `data/projects/${projectId}/${runId}`;
  return {
    script: `${base}/script/${episodeId}_script.md`,
    voicevoxTextRaw: `${base}/voicevox_text/${episodeId}_voicevox_text.json`,
    voicevoxTextPatched: `${base}/voicevox_text/${episodeId}_voicevox_text.patched.json`,
    vvproj: `${base}/voicevox_project/${episodeId}.vvproj`,
    runDir: base,
  };
}

function getLayer1StepArgs(
  stepKey: Layer1StepKey,
  projectId: string,
  episodeId: string,
  runDir: string,
): string[] {
  switch (stepKey) {
    case "gen-blueprint":
      return ["--project-id", projectId];
    default:
      return [
        "--project-id",
        projectId,
        "--episode-id",
        episodeId,
        "--run-dir",
        runDir,
      ];
  }
}

function getLayer2StepArgs(stepKey: Layer2StepKey, paths: Paths): string[] {
  switch (stepKey) {
    case "build-text":
      return ["--script", paths.script];
    case "patch-voicevox-text":
      return ["--voicevox-text-json", paths.voicevoxTextRaw];
    case "build-project":
      return ["--voicevox-text-json", paths.voicevoxTextPatched];
    case "build-audio":
      return ["--vvproj", paths.vvproj];
  }
}

type StepStatus = "idle" | "running" | "done" | "error";
type PipelineTab = "layer1" | "layer2" | "utility";

const PIPELINE_TABS: { id: PipelineTab; label: string }[] = [
  { id: "layer1", label: "Layer 1 — LLM 生成" },
  { id: "layer2", label: "Layer 2 — 音声合成" },
  { id: "utility", label: "ユーティリティ" },
];

export function PipelinePage() {
  const queryClient = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [runKey, setRunKey] = useState("");
  const [episodeId, setEpisodeId] = useState("E01");
  const [pipelineTab, setPipelineTab] = useState<PipelineTab>("layer1");
  const [stepStatuses, setStepStatuses] = useState<
    Partial<Record<StepKey, StepStatus>>
  >({});
  const [activeStep, setActiveStep] = useState<StepKey | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [pendingAutoSelectRun, setPendingAutoSelectRun] = useState(false);
  const [copiedStep, setCopiedStep] = useState<string | null>(null);
  const [hoveredCommand, setHoveredCommand] = useState<string | null>(null);

  const { logs, status, reset } = usePipelineLog(jobId);
  const paths = derivePaths(runKey, episodeId);
  const runIdFromKey = runKey ? runKey.slice(runKey.indexOf("/") + 1) : "";

  const voicevoxQuery = useQuery({
    queryKey: ["voicevox-status"],
    queryFn: api.voicevox.status,
    refetchInterval: 30_000,
    retry: false,
  });

  const isJobActiveForQuery = status === "connecting" || status === "running";
  const runStatusQuery = useQuery({
    queryKey: ["run-status", projectId, runIdFromKey],
    queryFn: () => api.runs.status(projectId, runIdFromKey),
    enabled: !!projectId && !!runIdFromKey,
    staleTime: 10_000,
    refetchInterval: isJobActiveForQuery ? 5_000 : false,
  });

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
    staleTime: 60_000,
  });

  const runsQuery = useQuery({
    queryKey: ["runs", projectId],
    queryFn: () =>
      api.runs.list({ projectId: projectId || undefined, pageSize: 50 }),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!pendingAutoSelectRun || !runsQuery.data) return;
    const items = runsQuery.data.items.filter(
      (r) => !projectId || r.projectId === projectId,
    );
    if (items.length === 0) return;
    const newest = items[0];
    const newKey = `${newest.projectId}/${newest.runId}`;
    if (newKey !== runKey) {
      setRunKey(newKey);
    }
    setPendingAutoSelectRun(false);
  }, [pendingAutoSelectRun, runsQuery.data, projectId, runKey]);

  const resetStatuses = () => {
    setStepStatuses({});
    setActiveStep(null);
    setJobId(null);
    setRunningCommand(null);
    reset();
    setApiError(null);
  };

  const startJob = (command: string, args: string[]) => {
    reset();
    setJobId(null);
    setRunningCommand(null);
    setApiError(null);
    runMutation.mutate({ command, args });
  };

  const runMutation = useMutation({
    mutationFn: ({ command, args }: { command: string; args: string[] }) =>
      api.pipeline.run(command, args),
    onSuccess: (result) => {
      setJobId(result.jobId);
      setRunningCommand(result.command);
      setApiError(null);
    },
    onError: (e) => {
      const msg =
        e instanceof ApiError
          ? `${e.title}${e.detail ? `: ${e.detail}` : ""}`
          : String(e);
      setApiError(msg);
      if (activeStep) {
        setStepStatuses((prev) => ({ ...prev, [activeStep]: "error" }));
        setActiveStep(null);
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!jobId) return Promise.resolve(null);
      return api.pipeline.cancel(jobId);
    },
  });

  const isJobActive = status === "connecting" || status === "running";
  const activeStepRef = useRef(activeStep);
  activeStepRef.current = activeStep;
  const runningCommandRef = useRef(runningCommand);
  runningCommandRef.current = runningCommand;

  useEffect(() => {
    const step = activeStepRef.current;
    const cmd = runningCommandRef.current;
    if (status === "done") {
      if (step) {
        setStepStatuses((prev) => ({ ...prev, [step]: "done" }));
        setActiveStep(null);
        if (step === "gen-blueprint") {
          queryClient
            .invalidateQueries({ queryKey: ["runs"] })
            .then(() => {
              setPendingAutoSelectRun(true);
            })
            .catch(() => {});
        }
        queryClient
          .invalidateQueries({ queryKey: ["run-status"] })
          .catch(() => {});
      } else if (cmd === "build-all") {
        setStepStatuses((prev) => ({
          ...prev,
          "build-text": "done",
          "patch-voicevox-text": "done",
          "build-project": "done",
        }));
      }
    } else if (status === "error" || status === "cancelled") {
      if (step) {
        setStepStatuses((prev) => ({ ...prev, [step]: "error" }));
        setActiveStep(null);
      }
    }
  }, [status, queryClient]);

  const handleRunLayer1Step = (stepKey: Layer1StepKey) => {
    if (!projectId) return;
    const runDir = paths?.runDir ?? "";
    const args = getLayer1StepArgs(stepKey, projectId, episodeId, runDir);
    setActiveStep(stepKey);
    setStepStatuses((prev) => ({ ...prev, [stepKey]: "running" }));
    startJob(stepKey, args);
  };

  const handleRunLayer2Step = (stepKey: Layer2StepKey) => {
    if (!paths) return;
    const args = getLayer2StepArgs(stepKey, paths);
    setActiveStep(stepKey);
    setStepStatuses((prev) => ({ ...prev, [stepKey]: "running" }));
    startJob(stepKey, args);
  };

  const handleRunBuildAll = () => {
    if (!paths) return;
    startJob("build-all", ["--script", paths.script]);
  };

  const handleRunUtil = (command: string, args: string[]) => {
    startJob(command, args);
  };

  const handleCancel = () => {
    cancelMutation.mutate();
  };

  const handleProjectIdChange = (id: string) => {
    setProjectId(id);
    setRunKey("");
    resetStatuses();
  };

  const handleRunKeyChange = (key: string) => {
    setRunKey(key);
    resetStatuses();
  };

  const handleEpisodeIdChange = (id: string) => {
    setEpisodeId(id);
    resetStatuses();
  };

  const runStatus: RunStatus | undefined = runStatusQuery.data;

  const episodeInStage = (
    stage: RunStatus["stages"][keyof RunStatus["stages"]],
    id: string,
  ): boolean => {
    if (stage.status === "completed") return true;
    if (stage.status === "idle") return false;
    return stage.episodeIds.includes(id);
  };

  const getStepStatus = (stepKey: StepKey): StepStatus =>
    stepStatuses[stepKey] ?? "idle";

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

  const isAnyStepRunning = isJobActive;

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
    setTimeout(() => setCopiedStep(null), 2000);
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
          copiedStep={copiedStep}
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
            copiedStep={copiedStep}
            onCopyStep={copyCommand}
            onPreviewCommand={setHoveredCommand}
          />
          <div className="rounded-b-xl border-x border-b border-slate-200 bg-white/80 px-4 pb-4 backdrop-blur">
            <PipelineShortcutPanel
              isRunningBuildAll={
                isAnyStepRunning && runningCommand === "build-all"
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

      {apiError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {apiError}
        </div>
      )}

      <LogTerminal
        logs={logs}
        status={status}
        command={runningCommand ?? undefined}
        previewCommand={hoveredCommand ?? undefined}
      />
    </div>
  );
}
