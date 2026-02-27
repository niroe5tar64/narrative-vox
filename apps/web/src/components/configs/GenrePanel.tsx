import { useQuery } from "@tanstack/react-query";
import type { GenreConfig } from "@/api/client";
import { api } from "@/api/client";
import { Spinner } from "@/components/ui/spinner";
import { queryKeys } from "@/lib/query-keys";

export function GenrePanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.genres.list(),
    queryFn: () => api.genres.list(),
  });

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold tracking-tight">Genres</h2>
      <p className="text-sm text-slate-500">ジャンル一覧（読み取り専用）</p>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      )}
      {isError && (
        <p className="text-sm text-red-600">ジャンルの取得に失敗しました</p>
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.items.map((genre: GenreConfig) => (
            <div
              key={genre.genre_id}
              className="rounded-xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur"
            >
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                {genre.genre_id}
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {genre.genre_name}
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                extra_fields:{" "}
                {genre.extra_fields.length > 0
                  ? genre.extra_fields.join(", ")
                  : "なし"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
