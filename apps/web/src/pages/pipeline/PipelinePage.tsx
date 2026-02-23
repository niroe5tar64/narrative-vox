import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError, api } from "@/api/client";
import { buildArgs, CommandForm } from "@/components/pipeline/CommandForm";
import { LogTerminal } from "@/components/pipeline/LogTerminal";
import { NextCommandSuggest } from "@/components/pipeline/NextCommandSuggest";
import { RunEpisodePicker } from "@/components/pipeline/RunEpisodePicker";
import { usePipelineLog } from "@/hooks/usePipelineLog";

// ---------------------------------------------------------------------------
// Path inference for next command
// ---------------------------------------------------------------------------

function inferNextOptions(
  from: string,
  to: string,
  cur: Record<string, string>,
): Record<string, string> {
  const script = cur["--script"] ?? "";
  const vtJson = cur["--voicevox-text-json"] ?? "";

  // build-text → patch: script path → voicevox_text JSON path
  if (from === "build-text" && to === "patch-voicevox-text") {
    const v = script.replace(
      /\/script\/(.+)_script\.md$/,
      "/voicevox_text/$1_voicevox_text.json",
    );
    return v !== script ? { "--voicevox-text-json": v } : {};
  }
  // patch → build-project: .json → .patched.json
  if (from === "patch-voicevox-text" && to === "build-project") {
    const v = vtJson.replace(
      /_voicevox_text\.json$/,
      "_voicevox_text.patched.json",
    );
    return { "--voicevox-text-json": v !== vtJson ? v : vtJson };
  }
  // build-project → build-audio: voicevox_text → voicevox_project .vvproj
  if (from === "build-project" && to === "build-audio") {
    const v = vtJson.replace(
      /\/voicevox_text\/(.+?)_voicevox_text(\.patched)?\.json$/,
      "/voicevox_project/$1.vvproj",
    );
    return v !== vtJson ? { "--vvproj": v } : {};
  }
  // build-all → build-audio: script → .vvproj
  if (from === "build-all" && to === "build-audio") {
    const v = script.replace(
      /\/script\/(.+)_script\.md$/,
      "/voicevox_project/$1.vvproj",
    );
    return v !== script ? { "--vvproj": v } : {};
  }
  return {};
}

// ---------------------------------------------------------------------------
// PipelinePage
// ---------------------------------------------------------------------------

export function PipelinePage() {
  const [command, setCommand] = useState("build-text");
  const [optionValues, setOptionValues] = useState<Record<string, string>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const { logs, status, reset } = usePipelineLog(jobId);

  // VOICEVOX ステータスポーリング
  const voicevoxQuery = useQuery({
    queryKey: ["voicevox-status"],
    queryFn: api.voicevox.status,
    refetchInterval: 30_000,
    retry: false,
  });

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  const runMutation = useMutation({
    mutationFn: () => {
      const args = buildArgs(command, optionValues);
      return api.pipeline.run(command, args);
    },
    onSuccess: (result) => {
      setJobId(result.jobId);
      setRunningCommand(result.command);
      setApiError(null);
    },
    onError: (e) => {
      setApiError(
        e instanceof ApiError
          ? `${e.title}${e.detail ? `: ${e.detail}` : ""}`
          : String(e),
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!jobId) return Promise.resolve(null);
      return api.pipeline.cancel(jobId);
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleRun = () => {
    reset();
    setJobId(null);
    setRunningCommand(null);
    setApiError(null);
    runMutation.mutate();
  };

  const handleCancel = () => {
    cancelMutation.mutate();
  };

  const handleOptionChange = (flag: string, value: string) => {
    setOptionValues((prev) => ({ ...prev, [flag]: value }));
  };

  const handleNextCommand = (nextCmd: string) => {
    const inferred = inferNextOptions(runningCommand ?? "", nextCmd, optionValues);
    setCommand(nextCmd);
    setOptionValues(inferred);
  };

  const handlePickerApply = (opts: Record<string, string>) => {
    setOptionValues((prev) => ({ ...prev, ...opts }));
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isActive = status === "connecting" || status === "running";
  const isFinished =
    status === "done" || status === "error" || status === "cancelled";

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            CLI コマンドを実行してリアルタイムログを確認できます。
          </p>
        </div>

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
            <span className="text-slate-400 animate-pulse">VOICEVOX 確認中...</span>
          )}
        </div>
      </div>

      {/* Run + Episode picker */}
      <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-4 space-y-1.5">
        <p className="text-xs text-slate-500 font-medium">
          Run からパスを補完
        </p>
        <RunEpisodePicker
          command={command}
          onApply={handlePickerApply}
          disabled={isActive}
        />
      </div>

      {/* Form */}
      <CommandForm
        command={command}
        onCommandChange={setCommand}
        optionValues={optionValues}
        onOptionChange={handleOptionChange}
        status={status}
        onRun={handleRun}
        onCancel={handleCancel}
      />

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

      {/* Next command suggestion */}
      {isFinished && status === "done" && runningCommand && (
        <NextCommandSuggest
          prevCommand={runningCommand}
          onSelect={handleNextCommand}
        />
      )}
    </div>
  );
}
