import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Pipeline flow suggestions
// ---------------------------------------------------------------------------

const NEXT_COMMAND: Record<
	string,
	{ command: string; description: string } | null
> = {
	"build-text": {
		command: "build-project",
		description: "テキスト → VOICEVOX プロジェクト生成",
	},
	"build-project": {
		command: "build-audio",
		description: "プロジェクト → 音声合成",
	},
	"build-audio": null,
	"build-all": null,
	"check-run": null,
	"prepare-run": {
		command: "build-text",
		description: "台本 → VOICEVOX テキスト変換",
	},
	"dict-sync": null,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
	prevCommand: string;
	onSelect: (command: string) => void;
};

export function NextCommandSuggest({ prevCommand, onSelect }: Props) {
	const next = NEXT_COMMAND[prevCommand];
	if (!next) return null;

	return (
		<div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 flex items-center gap-3">
			<span className="text-xs text-emerald-700 font-medium flex-1">
				次のステップ: <span className="font-mono">{next.command}</span>
				<span className="text-emerald-600 ml-1">— {next.description}</span>
			</span>
			<Button
				size="sm"
				variant="secondary"
				onClick={() => onSelect(next.command)}
				className="gap-1.5 text-emerald-700 border border-emerald-300 hover:bg-emerald-100"
			>
				{next.command}
				<ArrowRight className="size-3.5" />
			</Button>
		</div>
	);
}
