import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle, ChevronLeft, GitBranch } from "lucide-react";

import { api, ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { LogTerminal } from "@/components/pipeline/LogTerminal";
import { RunFileTree } from "@/components/runs/RunFileTree";
import { FileViewer } from "@/components/runs/FileViewer";
import { usePipelineLog } from "@/hooks/usePipelineLog";
import { useDirtyGuard } from "@/hooks/useDirtyGuard";

export function RunDetailPage() {
  const { projectId, runId } = useParams<{ projectId: string; runId: string }>();

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobCommand, setJobCommand] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [fileViewerDirty, setFileViewerDirty] = useState(false);

  useDirtyGuard(fileViewerDirty);

  const { logs, status: pipelineStatus, reset } = usePipelineLog(jobId);

  const {
    data: treeData,
    isLoading: treeLoading,
    error: treeError,
  } = useQuery({
    queryKey: ["run-tree", projectId, runId],
    queryFn: () => api.runs.tree(projectId!, runId!),
    enabled: !!projectId && !!runId,
  });

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
      if (e instanceof ApiError) {
        setPipelineError(`${e.title}${e.detail ? `: ${e.detail}` : ""}`);
      } else {
        setPipelineError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const handleCheckRun = () =>
    startPipeline("check-run", ["--run-dir", runDir]);

  const handlePrepareRun = () =>
    startPipeline("prepare-run", ["--source-run-dir", runDir]);

  const showPipelineLog =
    logs.length > 0 ||
    pipelineStatus === "connecting" ||
    pipelineStatus === "running";

  return (
    <div className="flex flex-col gap-4">
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
          <h1 className="text-xl font-semibold text-slate-900 font-mono">{runId}</h1>
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
          <Button
            variant="secondary"
            size="sm"
            onClick={handlePrepareRun}
            disabled={isPipelineActive}
            className="gap-1.5"
          >
            <GitBranch className="size-3.5" />
            このRunから継続
          </Button>
        </div>
      </div>

      {/* Pipeline error */}
      {pipelineError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {pipelineError}
        </div>
      )}

      {/* Pipeline log */}
      {showPipelineLog && (
        <LogTerminal
          logs={logs}
          status={pipelineStatus}
          command={jobCommand ?? undefined}
        />
      )}

      {/* 2-pane: tree + viewer */}
      <div className="grid grid-cols-[260px_1fr] gap-4" style={{ minHeight: "520px" }}>
        {/* Left: File Tree */}
        <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur overflow-y-auto">
          {treeLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : treeError ? (
            <div className="p-4 text-sm text-red-600">ツリーの読み込みに失敗</div>
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
        <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur overflow-hidden flex flex-col">
          {selectedFile ? (
            <FileViewer
              projectId={projectId!}
              runId={runId!}
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
    </div>
  );
}
