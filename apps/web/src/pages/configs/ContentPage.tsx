import { useCallback, useState } from "react";
import { CharactersPanel } from "@/components/configs/CharactersPanel";
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog";
import { GenrePanel } from "@/components/configs/GenrePanel";
import { StylesPanel } from "@/components/configs/StylesPanel";
import { TabBar } from "@/components/ui/tab-bar";

type Tab = "characters" | "styles" | "genre";

const TABS: { id: Tab; label: string }[] = [
  { id: "characters", label: "Characters" },
  { id: "styles", label: "Styles" },
  { id: "genre", label: "Genre" },
];

export function ContentPage() {
  const [tab, setTab] = useState<Tab>("characters");
  const [dirtyTabs, setDirtyTabs] = useState<Partial<Record<Tab, boolean>>>({});
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);

  const handleDirtyChange = useCallback((t: Tab, dirty: boolean) => {
    setDirtyTabs((prev) => ({ ...prev, [t]: dirty }));
  }, []);

  const handleCharactersDirtyChange = useCallback(
    (d: boolean) => handleDirtyChange("characters", d),
    [handleDirtyChange],
  );

  function switchTab(next: Tab) {
    if (dirtyTabs[tab]) {
      setPendingTab(next);
      return;
    }
    setDirtyTabs((prev) => ({ ...prev, [tab]: false }));
    setTab(next);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold tracking-tight">Content</h2>

      {/* Tabs */}
      <TabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={switchTab}
        dirtyMap={dirtyTabs}
      />

      {/* Tab content */}
      <div className="rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
        {tab === "characters" && (
          <CharactersPanel onDirtyChange={handleCharactersDirtyChange} />
        )}
        {tab === "styles" && <StylesPanel />}
        {tab === "genre" && <GenrePanel />}
      </div>

      <ConfirmDialog
        open={pendingTab !== null}
        title="未保存の変更があります"
        body="変更を破棄してタブを切り替えますか？"
        confirmLabel="破棄して切り替え"
        onCancel={() => setPendingTab(null)}
        onConfirm={() => {
          if (!pendingTab) return;
          setDirtyTabs((prev) => ({ ...prev, [tab]: false }));
          setTab(pendingTab);
          setPendingTab(null);
        }}
      />
    </div>
  );
}
