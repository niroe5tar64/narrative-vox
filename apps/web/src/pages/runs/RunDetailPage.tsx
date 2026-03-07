import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, ChevronLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { api } from "@/api/client";
import { ApiErrorBanner } from "@/components/feedback/ApiErrorBanner";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { LogTerminal } from "@/components/pipeline/LogTerminal";
import { FileViewer } from "@/components/runs/FileViewer";
import { RunFileTree } from "@/components/runs/RunFileTree";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useDirtyGuard } from "@/hooks/useDirtyGuard";
import { usePipelineLog } from "@/hooks/usePipelineLog";
import { formatApiError } from "@/lib/format-api-error";
import { queryKeys } from "@/lib/query-keys";

export function RunDetailPage() {
  const queryClient = useQueryClient();
  const { projectId, runId } = useParams<{
    projectId: string;
    runId: string;
  }>();

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobCommand, setJobCommand] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [fileViewerDirty, setFileViewerDirty] = useState(false);

  const dirtyGuard = useDirtyGuard(fileViewerDirty);

  const { logs, status: pipelineStatus, reset } = usePipelineLog(jobId);
  const prevPipelineStatus = useRef(pipelineStatus);

  const {
    data: treeData,
    isLoading: treeLoading,
    error: treeError,
  } = useQuery({
    queryKey: queryKeys.runs.tree(projectId ?? "", runId ?? ""),
    queryFn: () => {
      const pid = projectId;
      const rid = runId;
      if (!pid || !rid) {
        throw new Error("Missing project or run ID");
      }
      return api.runs.tree(pid, rid);
    },
    enabled: !!projectId && !!runId,
  });

  useEffect(() => {
    const prev = prevPipelineStatus.current;
    prevPipelineStatus.current = pipelineStatus;
    if (!jobId || !projectId || !runId) return;
    if (pipelineStatus === prev) return;
    const isTerminal =
      pipelineStatus === "done" ||
      pipelineStatus === "cancelled" ||
      pipelineStatus === "error";
    if (!isTerminal) return;

    queryClient.invalidateQueries({
      queryKey: queryKeys.runs.tree(projectId, runId),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.runs.status(projectId, runId),
    });
    if (selectedFile) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.runs.file(projectId, runId, selectedFile),
      });
    }
  }, [jobId, pipelineStatus, projectId, queryClient, runId, selectedFile]);

  if (!projectId || !runId) {
    return (
      <div className="p-4 text-sm text-red-600">
        プロジェクトIDまたはRun IDが指定されていません
      </div>
    );
  }

  const runDir = `data/projects/${projectId}/${runId}`;
  const isPipelineActive =
    pipelineStatus === "connecting" || pipelineStatus === "running";

  const startPipeline = async (command: string, args: string[]) => {
    reset();
    setJobId(null);
    setPipelineError(null);
    try {
      const result = await api.pipeline.run(command, args);
      setJobId(result.jobId);
      setJobCommand(result.command);
    } catch (e) {
      setPipelineError(formatApiError(e));
    }
  };

  const handleCheckRun = () =>
    startPipeline("check-run", ["--run-dir", runDir]);

  const showPipelineLog =
    logs.length > 0 ||
    pipelineStatus === "connecting" ||
    pipelineStatus === "running";

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/runs"
            className="inline-flex items-center gap-0.5 text-sm text-slate-500 hover:text-slate-800 mb-1"
          >
            <ChevronLeft className="size-3.5" />
            Runs
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 font-mono">
            {runId}
          </h1>
          <p className="text-sm text-slate-500 font-mono">{projectId}</p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCheckRun}
            disabled={isPipelineActive}
            className="gap-1.5"
          >
            <CheckCircle className="size-3.5" />
            check-run
          </Button>
        </div>
      </div>

      {/* Pipeline error */}
      <ApiErrorBanner error={pipelineError} />

      {/* Pipeline log */}
      {showPipelineLog && (
        <LogTerminal
          logs={logs}
          status={pipelineStatus}
          command={jobCommand ?? undefined}
        />
      )}

      {/* 2-pane: tree + viewer */}
      <div className="grid min-w-0 h-[calc(100dvh-8rem)] grid-cols-[260px_minmax(0,1fr)] gap-4">
        {/* Left: File Tree */}
        <div className="h-full min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white/80 backdrop-blur">
          {treeLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : treeError ? (
            <div className="p-4 text-sm text-red-600">
              ツリーの読み込みに失敗
            </div>
          ) : treeData ? (
            <div className="p-2">
              <RunFileTree
                node={treeData.tree}
                selectedPath={selectedFile}
                onSelect={setSelectedFile}
              />
            </div>
          ) : null}
        </div>

        {/* Right: File Viewer */}
        <div className="flex h-full min-w-0 min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white/80 backdrop-blur">
          {selectedFile ? (
            <FileViewer
              projectId={projectId}
              runId={runId}
              filePath={selectedFile}
              onDirtyChange={setFileViewerDirty}
            />
          ) : (
            <div className="flex items-center justify-center h-48 text-sm text-slate-400">
              ← ファイルを選択してください
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog {...dirtyGuard.confirmDialogProps} />
    </div>
  );
}
