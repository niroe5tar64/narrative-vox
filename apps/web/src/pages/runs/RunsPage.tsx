import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const PAGE_SIZE = 20;

export function RunsPage() {
  const [projectIdFilter, setProjectIdFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["runs", projectIdFilter, page],
    queryFn: () =>
      api.runs.list({
        projectId: projectIdFilter || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const handleFilterChange = (value: string) => {
    setProjectIdFilter(value);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Runs</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Run 一覧と成果物の閲覧・検証。
        </p>
      </div>

      {/* Filter */}
      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Project ID でフィルタ..."
          value={projectIdFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="h-9 rounded-md border border-slate-200 bg-white/80 px-3 text-sm font-mono w-64 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
        />
        {projectIdFilter && (
          <button
            type="button"
            onClick={() => handleFilterChange("")}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            クリア
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-600">エラーが発生しました</div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Run が見つかりません
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">
                  Project
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">
                  Run ID
                </th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">
                  作成日時
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((run) => (
                <tr
                  key={`${run.projectId}/${run.runId}`}
                  className="hover:bg-slate-50/60 transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                    {run.projectId}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link
                      to={`/runs/${run.projectId}/${run.runId}`}
                      className="font-mono text-xs text-emerald-700 hover:text-emerald-600 hover:underline"
                    >
                      {run.runId}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {new Date(run.createdAt).toLocaleString("ja-JP")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center gap-2 justify-end text-sm">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="text-slate-600">
            {page} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
