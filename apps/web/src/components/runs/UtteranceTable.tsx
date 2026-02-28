import type {
  Utterance,
  UtteranceUpdate,
  VoicevoxText,
} from "@narrative-vox/api-types";
import { useMutation } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useFlashMessage } from "@/hooks/useFlashMessage";
import { formatApiError, isConflictError } from "@/lib/format-api-error";

type EditRow = Utterance & { _modified: boolean };

type Props = {
  data: VoicevoxText;
  etag: string | null;
  projectId: string;
  runId: string;
  filePath: string;
  onDirtyChange?: (dirty: boolean) => void;
  onReloadFromSource?: () => Promise<void>;
};

export function UtteranceTable({
  data,
  etag,
  projectId,
  runId,
  filePath,
  onDirtyChange,
  onReloadFromSource,
}: Props) {
  const [rows, setRows] = useState<EditRow[]>(
    data.utterances.map((u) => ({ ...u, _modified: false })),
  );
  const [currentEtag, setCurrentEtag] = useState(etag);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveSuccessFlash = useFlashMessage(2000);

  const hasChanges = rows.some((r) => r._modified);

  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentEtag) throw new Error("ETag が取得できていません");
      const updates: UtteranceUpdate[] = rows
        .filter((r) => r._modified)
        .map((r) => ({
          utterance_id: r.utterance_id,
          text: r.text,
          pause_length_ms: r.pause_length_ms,
        }));
      return api.runs.saveFile(
        projectId,
        runId,
        filePath,
        updates,
        currentEtag,
      );
    },
    onSuccess: (result) => {
      if (result.etag) setCurrentEtag(result.etag);
      setRows((prev) => prev.map((r) => ({ ...r, _modified: false })));
      setSaveError(null);
      saveSuccessFlash.flash();
    },
    onError: (e) => {
      if (isConflictError(e)) {
        setSaveError(
          "競合エラー: ファイルが外部で変更されました。ページを再読み込みしてください。",
        );
      } else {
        setSaveError(formatApiError(e));
      }
    },
  });

  const handleTextChange = (id: string, text: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.utterance_id === id ? { ...r, text, _modified: true } : r,
      ),
    );
  };

  const handlePauseChange = (id: string, value: string) => {
    const n = Number.parseInt(value, 10);
    if (!Number.isNaN(n) && n >= 0 && n <= 2000) {
      setRows((prev) =>
        prev.map((r) =>
          r.utterance_id === id
            ? { ...r, pause_length_ms: n, _modified: true }
            : r,
        ),
      );
    }
  };

  useEffect(() => {
    setRows(data.utterances.map((u) => ({ ...u, _modified: false })));
    setCurrentEtag(etag);
    setSaveError(null);
  }, [data, etag]);

  // Precompute which rows start a new section (pure derivation, no side effects)
  const sectionBreaks = new Set<number>();
  let lastSectionId: number | undefined;
  for (const [index, row] of rows.entries()) {
    if (row.section_id !== undefined && row.section_id !== lastSectionId) {
      sectionBreaks.add(index);
      lastSectionId = row.section_id;
    }
  }

  const handleReload = async () => {
    if (!onReloadFromSource) return;
    await onReloadFromSource();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50/60 border-b border-slate-200">
        <span className="text-xs text-slate-500">{rows.length} utterances</span>
        <div className="flex items-center gap-3">
          {saveSuccessFlash.visible && (
            <span className="text-xs text-emerald-600">保存しました</span>
          )}
          {saveError && (
            <div className="flex items-center gap-2">
              <span
                className="text-xs text-red-600 max-w-xs truncate"
                title={saveError}
              >
                {saveError}
              </span>
              {saveError.includes("競合エラー") && onReloadFromSource && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleReload}
                  className="h-7 px-2 text-xs"
                >
                  Reload
                </Button>
              )}
            </div>
          )}
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
            className="gap-1.5 text-xs"
          >
            <Save className="size-3" />
            {saveMutation.isPending ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600 w-10">
                #
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 w-20">
                話者
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">
                テキスト
              </th>
              <th className="px-3 py-2 text-left font-medium text-slate-600 w-24">
                ポーズ (ms)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <Fragment key={row.utterance_id}>
                {sectionBreaks.has(i) && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-500 bg-slate-50 border-y border-slate-200"
                    >
                      § {row.section_title ?? `Section ${row.section_id}`}
                    </td>
                  </tr>
                )}
                <tr
                  className={
                    row._modified ? "bg-amber-50" : "hover:bg-slate-50/60"
                  }
                >
                  <td className="px-3 py-1.5 text-slate-400 font-mono">
                    {i + 1}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-slate-500 truncate max-w-[80px]">
                    {String(row.speaker_key ?? row.utterance_id)}
                  </td>
                  <td className="px-3 py-1">
                    <input
                      type="text"
                      value={row.text}
                      onChange={(e) =>
                        handleTextChange(row.utterance_id, e.target.value)
                      }
                      className="w-full bg-transparent focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded px-1 font-sans leading-relaxed"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      value={row.pause_length_ms}
                      min={0}
                      max={2000}
                      step={50}
                      onChange={(e) =>
                        handlePauseChange(row.utterance_id, e.target.value)
                      }
                      className="w-20 bg-transparent focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded px-1 font-mono"
                    />
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
