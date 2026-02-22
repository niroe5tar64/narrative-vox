import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";
import { CharactersPanel } from "@/components/configs/CharactersPanel";
import { StylesPanel } from "@/components/configs/StylesPanel";
import { GenrePanel } from "@/components/configs/GenrePanel";

type Tab = "characters" | "styles" | "genre";

const TABS: { id: Tab; label: string }[] = [
  { id: "characters", label: "Characters" },
  { id: "styles", label: "Styles" },
  { id: "genre", label: "Genre" },
];

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
          <CharactersPanel onDirtyChange={(d) => handleDirtyChange("characters", d)} />
        )}
        {tab === "styles" && <StylesPanel />}
        {tab === "genre" && <GenrePanel />}
      </div>
    </div>
  );
}
