import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  RotateCcw,
  Square,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ApiError, api } from "@/api/client";
import { LogTerminal } from "@/components/pipeline/LogTerminal";
import { RunEpisodePicker } from "@/components/pipeline/RunEpisodePicker";
import { Button } from "@/components/ui/button";
import { usePipelineLog } from "@/hooks/usePipelineLog";

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const MAIN_STEPS = [
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

type StepKey = (typeof MAIN_STEPS)[number]["key"];

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

function getStepArgs(stepKey: StepKey, paths: Paths): string[] {
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
// PipelinePage
// ---------------------------------------------------------------------------

export function PipelinePage() {
  const [runKey, setRunKey] = useState("");
  const [episodeId, setEpisodeId] = useState("E01");
  const [stepStatuses, setStepStatuses] = useState<
    Partial<Record<StepKey, StepStatus>>
  >({});
  const [activeStep, setActiveStep] = useState<StepKey | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const { logs, status, reset } = usePipelineLog(jobId);

  const paths = derivePaths(runKey, episodeId);

  // VOICEVOX ステータスポーリング
  const voicevoxQuery = useQuery({
    queryKey: ["voicevox-status"],
    queryFn: api.voicevox.status,
    refetchInterval: 30_000,
    retry: false,
  });

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
  }, [status]);

  // ---------------------------------------------------------------------------
  // Step run handler
  // ---------------------------------------------------------------------------

  const handleRunStep = (stepKey: StepKey) => {
    if (!paths) return;
    const args = getStepArgs(stepKey, paths);
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
  // Context change handler
  // ---------------------------------------------------------------------------

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

  const isNextStep = (index: number): boolean => {
    if (index === 0) return getStepStatus(MAIN_STEPS[0].key) === "idle";
    const prevStep = MAIN_STEPS[index - 1];
    return (
      getStepStatus(prevStep.key) === "done" &&
      getStepStatus(MAIN_STEPS[index].key) === "idle"
    );
  };

  const isAnyStepRunning = isJobActive;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4 h-full">
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

      {/* Context: Run + Episode */}
      <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-4 space-y-2">
        <p className="text-xs font-medium text-slate-500">対象</p>
        <RunEpisodePicker
          runKey={runKey}
          episodeId={episodeId}
          onRunKeyChange={handleRunKeyChange}
          onEpisodeIdChange={handleEpisodeIdChange}
          disabled={isAnyStepRunning}
        />
      </div>

      {/* Steps */}
      <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-4 space-y-1">
        <p className="text-xs font-medium text-slate-500 mb-3">ステップ実行</p>

        <div className="space-y-1">
          {MAIN_STEPS.map((step, index) => {
            const stepStatus = getStepStatus(step.key);
            const isNext = isNextStep(index);
            const isRunningThis = stepStatus === "running";
            const canRun = !!paths && !isAnyStepRunning;

            return (
              <div
                key={step.key}
                className={[
                  "flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors",
                  isNext
                    ? "bg-emerald-50 border border-emerald-200"
                    : "hover:bg-slate-50",
                ].join(" ")}
              >
                {/* Status icon */}
                <div className="mt-0.5 shrink-0">
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
                  {paths && (
                    <p className="text-xs text-slate-400 font-mono truncate mt-0.5">
                      {step.key === "build-text" && paths.script}
                      {step.key === "patch-voicevox-text" &&
                        paths.voicevoxTextRaw}
                      {step.key === "build-project" &&
                        paths.voicevoxTextPatched}
                      {step.key === "build-audio" && paths.vvproj}
                    </p>
                  )}
                </div>

                {/* Action button */}
                <div className="shrink-0">
                  {isRunningThis ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={handleCancel}
                      className="gap-1 text-xs text-red-600 hover:text-red-700"
                    >
                      <Square className="size-3" />
                      停止
                    </Button>
                  ) : stepStatus === "done" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRunStep(step.key)}
                      disabled={!canRun}
                      className="gap-1 text-xs text-slate-500"
                    >
                      <RotateCcw className="size-3" />
                      再実行
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleRunStep(step.key)}
                      disabled={!canRun}
                      className={[
                        "gap-1 text-xs",
                        isNext
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "",
                      ].join(" ")}
                    >
                      <Play className="size-3" />
                      実行
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Shortcut: build-all */}
        <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
          <p className="text-xs text-slate-400">ショートカット</p>
          <div className="flex items-center gap-2 flex-wrap">
            {isAnyStepRunning && runningCommand === "build-all" ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCancel}
                className="gap-1.5 text-red-600 hover:text-red-700"
              >
                <Square className="size-3.5" />
                停止
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleRunBuildAll}
                disabled={!paths || isAnyStepRunning}
                className="gap-1.5"
              >
                <Play className="size-3.5" />
                ステップ ①②③ をまとめて実行
              </Button>
            )}
            <span className="text-xs text-slate-400">
              ※ ステップ④（音声合成）は別途実行が必要
            </span>
          </div>
        </div>
      </div>

      {/* Utilities */}
      <details className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur overflow-hidden">
        <summary className="px-4 py-3 text-xs font-medium text-slate-500 cursor-pointer hover:bg-slate-50 select-none">
          ユーティリティ
        </summary>
        <div className="px-4 pb-3 pt-2 flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant="secondary"
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
            onClick={() =>
              paths &&
              handleRunUtil("prepare-run", [
                "--source-run-dir",
                paths.runDir,
              ])
            }
            disabled={!paths || isAnyStepRunning}
          >
            run を引き継ぎ
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleRunUtil("dict-sync", [])}
            disabled={isAnyStepRunning}
          >
            辞書同期
          </Button>
        </div>
      </details>

      {/* API error */}
      {apiError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {apiError}
        </div>
      )}

      {/* Terminal */}
      {(logs.length > 0 || status !== "idle") && (
        <LogTerminal
          logs={logs}
          status={status}
          command={runningCommand ?? undefined}
        />
      )}
    </div>
  );
}
