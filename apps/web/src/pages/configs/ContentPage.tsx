import { useCallback, useState } from "react";

import { TabBar } from "@/components/ui/tab-bar";
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

	const handleCharactersDirtyChange = useCallback(
		(d: boolean) => handleDirtyChange("characters", d),
		[handleDirtyChange],
	);

	function switchTab(next: Tab) {
		if (
			dirtyTabs[tab] &&
			!window.confirm("未保存の変更があります。タブを切り替えますか？")
		)
			return;
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
		</div>
	);
}
