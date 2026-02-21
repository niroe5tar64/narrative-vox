import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";

import { api, ApiError } from "@/api/client";
import type { ManifestData, VoicevoxText } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { UtteranceTable } from "@/components/runs/UtteranceTable";

// ---------------------------------------------------------------------------
// File type detection
// ---------------------------------------------------------------------------

type FileType = "markdown" | "voicevox_text" | "manifest" | "json" | "text";

function detectFileType(filePath: string): FileType {
  const name = filePath.split("/").pop() ?? "";
  if (name.endsWith(".md")) return "markdown";
  if (/^E\d{2}_voicevox_text\.json$/.test(name)) return "voicevox_text";
  if (name === "manifest.json") return "manifest";
  if (name.endsWith(".json")) return "json";
  return "text";
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  projectId: string;
  runId: string;
  filePath: string;
};

// ---------------------------------------------------------------------------
// FileViewer
// ---------------------------------------------------------------------------

export function FileViewer({ projectId, runId, filePath }: Props) {
  const fileType = detectFileType(filePath);
  const [openError, setOpenError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["run-file", projectId, runId, filePath],
    queryFn: () => api.runs.getFile(projectId, runId, filePath),
  });

  const handleOpenVSCode = async () => {
    setOpenError(null);
    const fullPath = `data/projects/${projectId}/${runId}/${filePath}`;
    try {
      await api.editor.open(fullPath);
    } catch (e) {
      if (e instanceof ApiError) {
        setOpenError(`${e.title}${e.detail ? `: ${e.detail}` : ""}`);
      } else {
        setOpenError(String(e));
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-slate-50/60 min-h-[41px]">
        <span className="text-xs font-mono text-slate-600 truncate" title={filePath}>
          {filePath}
        </span>
        {fileType === "markdown" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleOpenVSCode}
            className="gap-1.5 text-xs flex-shrink-0 ml-2"
          >
            <ExternalLink className="size-3" />
            VS Code で開く
          </Button>
        )}
      </div>

      {openError && (
        <div className="px-4 py-1 text-xs text-red-600 bg-red-50 border-b border-red-100">
          {openError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-600">
            {error instanceof ApiError
              ? error.title
              : "ファイルの読み込みに失敗しました"}
          </div>
        ) : data ? (
          <FileContent
            fileType={fileType}
            content={data.content}
            etag={data.etag}
            projectId={projectId}
            runId={runId}
            filePath={filePath}
          />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FileContent — dispatches to the appropriate viewer
// ---------------------------------------------------------------------------

type FileContentProps = {
  fileType: FileType;
  content: string;
  etag: string | null;
  projectId: string;
  runId: string;
  filePath: string;
};

function FileContent({
  fileType,
  content,
  etag,
  projectId,
  runId,
  filePath,
}: FileContentProps) {
  if (fileType === "voicevox_text") {
    try {
      const parsed = JSON.parse(content) as VoicevoxText;
      return (
        <UtteranceTable
          data={parsed}
          etag={etag}
          projectId={projectId}
          runId={runId}
          filePath={filePath}
        />
      );
    } catch {
      // fall through
    }
  }

  if (fileType === "manifest") {
    try {
      const parsed = JSON.parse(content) as ManifestData;
      return <ManifestViewer data={parsed} />;
    } catch {
      // fall through
    }
  }

  if (fileType === "json") {
    try {
      const parsed: unknown = JSON.parse(content);
      return (
        <pre className="p-4 text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      // fall through
    }
  }

  // markdown or plain text
  return (
    <pre className="p-4 text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
      {content}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// ManifestViewer
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  succeeded: "text-emerald-700 bg-emerald-50",
  failed: "text-red-700 bg-red-50",
  skipped: "text-slate-500 bg-slate-100",
};

function statusBadge(status: string) {
  const cls = STATUS_COLORS[status] ?? "text-slate-600 bg-slate-100";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function ManifestViewer({ data }: { data: ManifestData }) {
  const utterances = data.utterances ?? [];
  const counts = utterances.reduce<Record<string, number>>((acc, u) => {
    acc[u.status] = (acc[u.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Summary */}
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-1">
        {data.meta && (
          <div className="flex flex-wrap gap-4 text-xs text-slate-600">
            {Object.entries(data.meta).map(([k, v]) => (
              <span key={k}>
                <span className="font-medium text-slate-500">{k}:</span>{" "}
                <span className="font-mono">{String(v)}</span>
              </span>
            ))}
          </div>
        )}
        {utterances.length > 0 && (
          <div className="flex gap-3 pt-1">
            {Object.entries(counts).map(([status, count]) => (
              <span key={status} className="flex items-center gap-1 text-xs">
                {statusBadge(status)}
                <span className="text-slate-600">{count}</span>
              </span>
            ))}
          </div>
        )}
        {data.output && (
          <div className="text-xs text-slate-500 font-mono pt-1">
            {Object.entries(data.output).map(([k, v]) => (
              <div key={k}>
                {k}: {String(v)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Utterance status table */}
      {utterances.length > 0 && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-slate-600 w-24">
                  Audio Key
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-600">
                  テキスト
                </th>
                <th className="px-3 py-2 text-left font-medium text-slate-600 w-24">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {utterances.map((u) => (
                <tr key={u.audio_key} className="hover:bg-slate-50/60">
                  <td className="px-3 py-1.5 font-mono text-slate-500">{u.audio_key}</td>
                  <td className="px-3 py-1.5 text-slate-700 truncate max-w-xs">
                    {u.text}
                  </td>
                  <td className="px-3 py-1.5">{statusBadge(u.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
