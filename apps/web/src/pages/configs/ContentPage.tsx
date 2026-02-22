import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { GenreConfig } from "@/api/client";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { CharactersPage } from "./CharactersPage";
import { StylesPage } from "./StylesPage";

type Tab = "characters" | "styles" | "genre";

const TABS: { id: Tab; label: string }[] = [
  { id: "characters", label: "Characters" },
  { id: "styles", label: "Styles" },
  { id: "genre", label: "Genre" },
];

function GenreTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["genres"],
    queryFn: () => api.genres.list(),
  });

  if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;
  if (isError) return <p className="text-sm text-red-600">ジャンルの取得に失敗しました</p>;

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">ジャンル一覧（読み取り専用）</p>
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
              <h3 className="text-base font-bold text-slate-900">{genre.genre_name}</h3>
              <p className="mt-1 text-sm text-slate-600">
                extra_fields:{" "}
                {genre.extra_fields.length > 0 ? genre.extra_fields.join(", ") : "なし"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContentPage() {
  const [tab, setTab] = useState<Tab>("characters");
  const [dirtyTabs, setDirtyTabs] = useState<Partial<Record<Tab, boolean>>>({});

  const handleDirtyChange = useCallback((t: Tab, dirty: boolean) => {
    setDirtyTabs((prev) => ({ ...prev, [t]: dirty }));
  }, []);

  function switchTab(next: Tab) {
    if (dirtyTabs[tab] && !window.confirm("未保存の変更があります。タブを切り替えますか？")) return;
    setDirtyTabs((prev) => ({ ...prev, [tab]: false }));
    setTab(next);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold tracking-tight">Content</h2>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              tab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            {t.label}
            {dirtyTabs[t.id] && (
              <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
        {tab === "characters" && (
          <CharactersPage onDirtyChange={(d) => handleDirtyChange("characters", d)} />
        )}
        {tab === "styles" && <StylesPage />}
        {tab === "genre" && <GenreTab />}
      </div>
    </div>
  );
}
