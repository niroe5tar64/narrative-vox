import { useEffect, useRef } from "react";

import type { LogEntry } from "@/api/client";
import type { PipelineLogStatus } from "@/hooks/usePipelineLog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lineClass(type: LogEntry["type"]): string {
  switch (type) {
    case "stdout":
      return "text-zinc-100";
    case "stderr":
      return "text-red-400";
    case "system":
      return "text-cyan-400 font-semibold";
  }
}

function statusBadge(status: PipelineLogStatus) {
  switch (status) {
    case "idle":
      return null;
    case "connecting":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-slate-400 animate-pulse">
          <span className="size-1.5 rounded-full bg-slate-400 inline-block" />
          接続中
        </span>
      );
    case "running":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-400 animate-pulse">
          <span className="size-1.5 rounded-full bg-emerald-400 inline-block" />
          実行中
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
          <span className="size-1.5 rounded-full bg-emerald-300 inline-block" />
          完了 (code: 0)
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-red-400">
          <span className="size-1.5 rounded-full bg-red-400 inline-block" />
          エラー
        </span>
      );
    case "cancelled":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-amber-400">
          <span className="size-1.5 rounded-full bg-amber-400 inline-block" />
          キャンセル済み
        </span>
      );
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  logs: LogEntry[];
  status: PipelineLogStatus;
  command?: string;
};

export function LogTerminal({ logs, status, command }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (logs.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="flex flex-col rounded-xl border border-zinc-700 bg-zinc-950 overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900">
        <div className="flex gap-1.5">
          <span className="size-3 rounded-full bg-zinc-600" />
          <span className="size-3 rounded-full bg-zinc-600" />
          <span className="size-3 rounded-full bg-zinc-600" />
        </div>
        <span className="text-xs font-mono text-zinc-400 flex-1">
          {command ? `narrative-vox — ${command}` : "narrative-vox — terminal"}
        </span>
        {statusBadge(status)}
      </div>

      {/* Log output */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-sm min-h-[320px] max-h-[560px]">
        {logs.length === 0 ? (
          <p className="text-zinc-600 text-xs">出力待機中...</p>
        ) : (
          logs.map((entry) => (
            <div
              key={entry.seq}
              className={`leading-relaxed whitespace-pre-wrap break-all ${lineClass(entry.type)}`}
            >
              {entry.data}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
