import { cn } from "@/lib/utils";

interface TabItem<T extends string = string> {
	id: T;
	label: string;
}

interface TabBarProps<T extends string = string> {
	tabs: TabItem<T>[];
	activeTab: T;
	onTabChange: (id: T) => void;
	/** タブごとの未保存状態。true のタブに amber ドットを表示 */
	dirtyMap?: Partial<Record<T, boolean>>;
}

export function TabBar<T extends string = string>({
	tabs,
	activeTab,
	onTabChange,
	dirtyMap,
}: TabBarProps<T>) {
	return (
		<div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
			{tabs.map((t) => (
				<button
					key={t.id}
					type="button"
					onClick={() => onTabChange(t.id)}
					className={cn(
						"rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
						activeTab === t.id
							? "bg-white text-slate-900 shadow-sm"
							: "text-slate-600 hover:text-slate-900",
					)}
				>
					{t.label}
					{dirtyMap?.[t.id] && (
						<span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
					)}
				</button>
			))}
		</div>
	);
}
