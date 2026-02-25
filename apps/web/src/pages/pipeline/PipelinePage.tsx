import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Loader2,
  Play,
  RotateCcw,
  Square,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ApiError, api, type RunStatus } from "@/api/client";
import { LogTerminal } from "@/components/pipeline/LogTerminal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TabBar } from "@/components/ui/tab-bar";
import { usePipelineLog } from "@/hooks/usePipelineLog";

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const LAYER1_STEPS = [
  {
    key: "gen-blueprint",
    label: "ブループリント生成",
    note: "全体設計 JSON の生成",
    requiresRun: false,
  },
  {
    key: "gen-material",
    label: "素材生成",
    note: "エピソード素材 JSON の生成",
    requiresRun: true,
  },
  {
    key: "gen-script",
    label: "台本生成",
    note: "素材 → ナレーション台本 (.md)",
    requiresRun: true,
  },
  {
    key: "gen-digest",
    label: "ダイジェスト生成",
    note: "エピソード間一貫性用 JSON",
    requiresRun: true,
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

// ---------------------------------------------------------------------------
// Path derivation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Step status types
// ---------------------------------------------------------------------------

type StepStatus = "idle" | "running" | "done" | "error";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type PipelineTab = "layer1" | "layer2" | "utility";

const PIPELINE_TABS: { id: PipelineTab; label: string }[] = [
  { id: "layer1", label: "Layer 1 — LLM 生成" },
  { id: "layer2", label: "Layer 2 — 音声合成" },
  { id: "utility", label: "ユーティリティ" },
];

// ---------------------------------------------------------------------------
// PipelinePage
// ---------------------------------------------------------------------------

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
  // Flag to auto-select run after gen-blueprint completes
  const [pendingAutoSelectRun, setPendingAutoSelectRun] = useState(false);
  // Which step's command was just copied to clipboard
  const [copiedStep, setCopiedStep] = useState<string | null>(null);
  // Command currently being previewed in LogTerminal
  const [hoveredCommand, setHoveredCommand] = useState<string | null>(null);

  const { logs, status, reset } = usePipelineLog(jobId);

  // 現在の runKey から runDir を抽出
  const paths = derivePaths(runKey, episodeId);

  // runKey から projectId / runId を分離
  const runIdFromKey = runKey ? runKey.slice(runKey.indexOf("/") + 1) : "";

  // VOICEVOX ステータスポーリング
  const voicevoxQuery = useQuery({
    queryKey: ["voicevox-status"],
    queryFn: api.voicevox.status,
    refetchInterval: 30_000,
    retry: false,
  });

  // Run ステータス（ファイルシステムから推論）
  // isAnyStepRunning は後で定義されるが、循環を避けるため status で直接判定
  const isJobActiveForQuery = status === "connecting" || status === "running";
  const runStatusQuery = useQuery({
    queryKey: ["run-status", projectId, runIdFromKey],
    queryFn: () => api.runs.status(projectId, runIdFromKey),
    enabled: !!projectId && !!runIdFromKey,
    staleTime: 10_000,
    refetchInterval: isJobActiveForQuery ? 5_000 : false,
  });

  // プロジェクト一覧
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
    staleTime: 60_000,
  });

  // runs 一覧（projectId でフィルタ）
  const runsQuery = useQuery({
    queryKey: ["runs", projectId],
    queryFn: () =>
      api.runs.list({ projectId: projectId || undefined, pageSize: 50 }),
    staleTime: 30_000,
  });

  // ---------------------------------------------------------------------------
  // gen-blueprint 完了後の run 自動選択
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!pendingAutoSelectRun || !runsQuery.data) return;
    const items = runsQuery.data.items.filter(
      (r) => !projectId || r.projectId === projectId,
    );
    if (items.length === 0) return;
    // 最新の run を選択（items はすでに新しい順と仮定）
    const newest = items[0];
    const newKey = `${newest.projectId}/${newest.runId}`;
    if (newKey !== runKey) {
      setRunKey(newKey);
    }
    setPendingAutoSelectRun(false);
  }, [pendingAutoSelectRun, runsQuery.data, projectId, runKey]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

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

  // Log status → step status 反映
  const isJobActive = status === "connecting" || status === "running";

  // status が done/error/cancelled になったときにステップ状態を更新
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
        // gen-blueprint 完了後: runs を再フェッチして自動選択
        if (step === "gen-blueprint") {
          queryClient
            .invalidateQueries({ queryKey: ["runs"] })
            .then(() => {
              setPendingAutoSelectRun(true);
            })
            .catch(() => {});
        }
        // ステップ完了後: run status を更新
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

  // ---------------------------------------------------------------------------
  // Step run handlers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Context change handlers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const getStepStatus = (stepKey: StepKey): StepStatus =>
    stepStatuses[stepKey] ?? "idle";

  /** RunStatus から Layer1 ステップの完了を判定（セッション状態と合成） */
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

  /** RunStatus から Layer2 ステップの完了を判定（セッション状態と合成） */
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
        // patched ファイルの存在は voicevox_text ステージで区別不可なので "idle" のまま
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

  const runStatus: RunStatus | undefined = runStatusQuery.data;

  /** エピソードIDがステージに含まれているか */
  const episodeInStage = (
    stage: RunStatus["stages"][keyof RunStatus["stages"]],
    id: string,
  ): boolean => {
    if (stage.status === "completed") return true;
    if (stage.status === "idle") return false;
    return stage.episodeIds.includes(id);
  };

  /** Layer 1 の各ステップで実行可能かどうか（RunStatus ベース） */
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

  /** Layer 2 の各ステップで実行可能かどうか（RunStatus ベース） */
  const canRunLayer2Step = (stepKey: Layer2StepKey): boolean => {
    if (!paths || isAnyStepRunning) return false;
    if (!runStatus) return true; // status 未取得時はフォールバックで許可
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full min-w-0 flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">Pipeline</h1>

        {/* VOICEVOX ステータスバッジ */}
        <div className="flex items-center gap-1.5 text-xs shrink-0 mt-1">
          {voicevoxQuery.isSuccess ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              <span className="text-slate-600">
                VOICEVOX v{voicevoxQuery.data.version}
              </span>
            </>
          ) : voicevoxQuery.isError ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-red-500" />
              <span className="text-slate-500">VOICEVOX offline</span>
            </>
          ) : (
            <span className="text-slate-400 animate-pulse">
              VOICEVOX 確認中...
            </span>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <TabBar
        tabs={PIPELINE_TABS}
        activeTab={pipelineTab}
        onTabChange={setPipelineTab}
      />

      {/* Context: Project + Run + Episode */}
      <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-4 space-y-3">
        <p className="text-xs font-medium text-slate-500">対象</p>
        <div className="flex flex-wrap gap-2 items-end">
          {/* Project select */}
          <div className="flex-1 min-w-48 space-y-1.5">
            <Label>Project</Label>
            <select
              value={projectId}
              onChange={(e) => handleProjectIdChange(e.target.value)}
              disabled={isAnyStepRunning}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">選択してください</option>
              {projectsQuery.data?.items.map((p) => (
                <option key={p.PROJECT_ID} value={p.PROJECT_ID}>
                  {p.PROJECT_ID}
                </option>
              ))}
            </select>
          </div>

          {/* Run select */}
          <div className="flex-1 min-w-48 space-y-1.5">
            <Label>Run</Label>
            <select
              value={runKey}
              onChange={(e) => handleRunKeyChange(e.target.value)}
              disabled={isAnyStepRunning}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">選択または空（新規）</option>
              {runsQuery.data?.items.map((r) => (
                <option
                  key={`${r.projectId}/${r.runId}`}
                  value={`${r.projectId}/${r.runId}`}
                >
                  {r.projectId} / {r.runId}
                </option>
              ))}
            </select>
          </div>

          {/* Episode ID select/input */}
          <div className="w-28 space-y-1.5">
            <Label>Episode</Label>
            {/* blueprint 生成済みなら plannedEpisodeIds、未生成なら ["E01"] */}
            <select
              value={episodeId}
              onChange={(e) => handleEpisodeIdChange(e.target.value)}
              disabled={isAnyStepRunning}
              className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(runStatus?.plannedEpisodeIds.length
                ? runStatus.plannedEpisodeIds
                : ["E01"]
              ).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tab content */}
      {pipelineTab === "layer1" && (
        <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500 mb-3">
            Layer 1 — LLM 生成（claude --print 経由）
          </p>

          <ul className="space-y-1 list-none p-0 m-0">
            {LAYER1_STEPS.map((step, index) => {
              const stepStatus = getLayer1StepDisplayStatus(step.key);
              const isRunningThis = stepStatus === "running";
              const canRun = canRunLayer1Step(step.key);
              // isNext: 前ステップが完了 && 自分は未完了 && 前提が整っている
              const isThisCompleted =
                getLayer1StepDisplayStatus(step.key) === "done";
              const isPrevCompleted =
                index === 0 ||
                getLayer1StepDisplayStatus(LAYER1_STEPS[index - 1].key) ===
                  "done";
              const isNext = !isThisCompleted && isPrevCompleted && canRun;

              const cmdArgs = projectId
                ? getLayer1StepArgs(
                    step.key,
                    projectId,
                    episodeId,
                    paths?.runDir ?? "",
                  )
                : null;
              const commandString = cmdArgs
                ? `bun run ${step.key} -- ${cmdArgs.join(" ")}`
                : null;

              return (
                <li
                  key={step.key}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50 group"
                  onMouseEnter={() =>
                    commandString ? setHoveredCommand(commandString) : undefined
                  }
                  onMouseLeave={() => setHoveredCommand(null)}
                >
                  {/* Status icon */}
                  <div className="shrink-0">
                    {stepStatus === "done" ? (
                      <CheckCircle2 className="size-4.5 text-emerald-500" />
                    ) : stepStatus === "error" ? (
                      <XCircle className="size-4.5 text-red-500" />
                    ) : stepStatus === "running" ? (
                      <Loader2 className="size-4.5 animate-spin text-blue-500" />
                    ) : (
                      <Circle className="size-4.5 text-slate-300" />
                    )}
                  </div>

                  {/* Label + note */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-400 font-mono">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-medium text-slate-800">
                        {step.label}
                      </span>
                      {isNext && (
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          次のステップ
                        </span>
                      )}
                      {stepStatus === "error" && (
                        <span className="text-xs font-medium text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                          エラー
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{step.note}</p>
                  </div>

                  {/* Copy icon */}
                  {commandString && (
                    <button
                      type="button"
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(commandString);
                        setCopiedStep(step.key);
                        setTimeout(() => setCopiedStep(null), 2000);
                      }}
                    >
                      {copiedStep === step.key ? (
                        <Check className="size-4 text-emerald-500" />
                      ) : (
                        <Copy className="size-4 text-slate-400 hover:text-slate-600" />
                      )}
                    </button>
                  )}

                  {/* Action button */}
                  <div className="shrink-0 w-[4.5rem]">
                    {isRunningThis ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleCancel}
                        className="w-full gap-1 text-xs text-red-600 hover:text-red-700 cursor-pointer"
                      >
                        <Square className="size-3" />
                        停止
                      </Button>
                    ) : stepStatus === "done" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRunLayer1Step(step.key)}
                        disabled={!canRun}
                        className="w-full gap-1 text-xs text-slate-500 cursor-pointer"
                      >
                        <RotateCcw className="size-3" />
                        再実行
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleRunLayer1Step(step.key)}
                        disabled={!canRun}
                        className="w-full gap-1 text-xs cursor-pointer"
                      >
                        <Play className="size-3" />
                        実行
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {pipelineTab === "layer2" && (
        <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-4 space-y-1">
          <p className="text-xs font-medium text-slate-500 mb-3">
            Layer 2 — 音声合成パイプライン
          </p>

          <ul className="space-y-1 list-none p-0 m-0">
            {LAYER2_STEPS.map((step, index) => {
              const stepStatus = getLayer2StepDisplayStatus(step.key);
              const isRunningThis = stepStatus === "running";
              const canRun = canRunLayer2Step(step.key);
              // isNext: 前ステップが完了 && 自分は未完了 && runが選択済み
              const isThisCompleted =
                getLayer2StepDisplayStatus(step.key) === "done";
              const isPrevCompleted =
                index === 0 ||
                getLayer2StepDisplayStatus(LAYER2_STEPS[index - 1].key) ===
                  "done";
              const isNext = !isThisCompleted && !!paths && isPrevCompleted;

              const cmdArgs = paths ? getLayer2StepArgs(step.key, paths) : null;
              const commandString = cmdArgs
                ? `bun run ${step.key} -- ${cmdArgs.join(" ")}`
                : null;

              return (
                <li
                  key={step.key}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50 group"
                  onMouseEnter={() =>
                    commandString ? setHoveredCommand(commandString) : undefined
                  }
                  onMouseLeave={() => setHoveredCommand(null)}
                >
                  {/* Status icon */}
                  <div className="shrink-0">
                    {stepStatus === "done" ? (
                      <CheckCircle2 className="size-4.5 text-emerald-500" />
                    ) : stepStatus === "error" ? (
                      <XCircle className="size-4.5 text-red-500" />
                    ) : stepStatus === "running" ? (
                      <Loader2 className="size-4.5 animate-spin text-blue-500" />
                    ) : (
                      <Circle className="size-4.5 text-slate-300" />
                    )}
                  </div>

                  {/* Label + note + path */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-400 font-mono">
                        {String(index + LAYER1_STEPS.length + 1).padStart(
                          2,
                          "0",
                        )}
                      </span>
                      <span className="text-sm font-medium text-slate-800">
                        {step.label}
                      </span>
                      {isNext && canRun && (
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          次のステップ
                        </span>
                      )}
                      {stepStatus === "error" && (
                        <span className="text-xs font-medium text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                          エラー
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{step.note}</p>
                  </div>

                  {/* Copy icon */}
                  {commandString && (
                    <button
                      type="button"
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(commandString);
                        setCopiedStep(step.key);
                        setTimeout(() => setCopiedStep(null), 2000);
                      }}
                    >
                      {copiedStep === step.key ? (
                        <Check className="size-4 text-emerald-500" />
                      ) : (
                        <Copy className="size-4 text-slate-400 hover:text-slate-600" />
                      )}
                    </button>
                  )}

                  {/* Action button */}
                  <div className="shrink-0 w-[4.5rem]">
                    {isRunningThis ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleCancel}
                        className="w-full gap-1 text-xs text-red-600 hover:text-red-700 cursor-pointer"
                      >
                        <Square className="size-3" />
                        停止
                      </Button>
                    ) : stepStatus === "done" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleRunLayer2Step(step.key)}
                        disabled={!canRun}
                        className="w-full gap-1 text-xs text-slate-500 cursor-pointer"
                      >
                        <RotateCcw className="size-3" />
                        再実行
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleRunLayer2Step(step.key)}
                        disabled={!canRun}
                        className="w-full gap-1 text-xs"
                      >
                        <Play className="size-3" />
                        実行
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Shortcut: build-all */}
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
            <p className="text-xs text-slate-400">ショートカット</p>
            <div className="flex items-center gap-2 flex-wrap">
              {isAnyStepRunning && runningCommand === "build-all" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCancel}
                  className="gap-1.5 text-red-600 hover:text-red-700 cursor-pointer"
                >
                  <Square className="size-3.5" />
                  停止
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleRunBuildAll}
                  disabled={!canRunLayer2Step("build-text") || isAnyStepRunning}
                  className="gap-1.5 cursor-pointer"
                >
                  <Play className="size-3.5" />
                  ステップ ⑤⑥⑦ をまとめて実行
                </Button>
              )}
              <span className="text-xs text-slate-400">
                ※ ステップ⑧（音声合成）は別途実行が必要
              </span>
            </div>
          </div>
        </div>
      )}

      {pipelineTab === "utility" && (
        <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-4">
          <p className="text-xs font-medium text-slate-500 mb-3">
            ユーティリティ
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="secondary"
              className="cursor-pointer"
              onClick={() =>
                paths && handleRunUtil("check-run", ["--run-dir", paths.runDir])
              }
              disabled={!paths || isAnyStepRunning}
            >
              run を検証
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="cursor-pointer"
              onClick={() =>
                paths &&
                handleRunUtil("prepare-run", ["--source-run-dir", paths.runDir])
              }
              disabled={!paths || isAnyStepRunning}
            >
              run を引き継ぎ
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="cursor-pointer"
              onClick={() => handleRunUtil("dict-sync", [])}
              disabled={isAnyStepRunning}
            >
              辞書同期
            </Button>
          </div>
        </div>
      )}

      {/* API error */}
      {apiError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {apiError}
        </div>
      )}

      {/* Terminal (常時表示) */}
      <LogTerminal
        logs={logs}
        status={status}
        command={runningCommand ?? undefined}
        previewCommand={hoveredCommand ?? undefined}
      />
    </div>
  );
}
