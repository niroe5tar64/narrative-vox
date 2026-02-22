import { useQuery } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { StyleConfig } from "@/api/client";
import { Spinner } from "@/components/ui/spinner";

export function StylesPanel() {
	const { data, isLoading, isError } = useQuery<{ items: StyleConfig[] }>({
		queryKey: ["styles"],
		queryFn: () => api.styles.list(),
	});

	return (
		<div className="space-y-5">
			<h2 className="text-lg font-bold tracking-tight">Styles</h2>
			<p className="text-sm text-slate-500">スタイル一覧（読み取り専用）</p>

			{isLoading && (
				<div className="flex justify-center py-8">
					<Spinner />
				</div>
			)}
			{isError && (
				<p className="text-sm text-red-600">スタイルの取得に失敗しました</p>
			)}

			{data && (
				<div className="grid gap-4 md:grid-cols-2">
					{data.items.map((style) => {
						const { style_id, style_name, format } = style;
						return (
							<div
								key={style_id}
								className="rounded-xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur"
							>
								<div className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
									{style_id}
								</div>
								<h3 className="text-base font-bold text-slate-900">
									{style_name}
								</h3>
								<p className="mt-1 text-sm text-slate-600">
									フォーマット: {format.speaker_mode} / {format.speaker_count}{" "}
									speakers
								</p>
								<details className="mt-3">
									<summary className="cursor-pointer text-xs text-slate-400 hover:text-slate-600">
										詳細を表示
									</summary>
									<pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">
										{JSON.stringify(style, null, 2)}
									</pre>
								</details>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
