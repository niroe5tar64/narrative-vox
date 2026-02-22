import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { ApiError, api } from "@/api/client";
import { buildArgs, CommandForm } from "@/components/pipeline/CommandForm";
import { LogTerminal } from "@/components/pipeline/LogTerminal";
import { NextCommandSuggest } from "@/components/pipeline/NextCommandSuggest";
import { usePipelineLog } from "@/hooks/usePipelineLog";

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
    setCommand(nextCmd);
    // Clear option values for the new command
    setOptionValues({});
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const isFinished =
    status === "done" || status === "error" || status === "cancelled";

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Pipeline</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          CLI コマンドを実行してリアルタイムログを確認できます。
        </p>
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
