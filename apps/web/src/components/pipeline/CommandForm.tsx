import { Play, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PipelineLogStatus } from "@/hooks/usePipelineLog";

// ---------------------------------------------------------------------------
// コマンド定義
// ---------------------------------------------------------------------------

type OptionDef = {
	flag: string;
	label: string;
	placeholder: string;
};

type CommandDef = {
	value: string;
	label: string;
	description: string;
	options: OptionDef[];
};

export const PIPELINE_COMMANDS: CommandDef[] = [
	{
		value: "build-text",
		label: "build-text",
		description: "台本 → VOICEVOX テキスト変換",
		options: [
			{
				flag: "--script",
				label: "Script path",
				placeholder: "data/projects/.../script/E01_script.md",
			},
		],
	},
	{
		value: "build-project",
		label: "build-project",
		description: "テキスト → VOICEVOX プロジェクト生成",
		options: [
			{
				flag: "--voicevox-text-json",
				label: "VOICEVOX text JSON path",
				placeholder: "data/projects/.../voicevox_text/E01_voicevox_text.json",
			},
		],
	},
	{
		value: "build-audio",
		label: "build-audio",
		description: "プロジェクト → 音声合成",
		options: [
			{
				flag: "--vvproj",
				label: "VOICEVOX project path",
				placeholder: "data/projects/.../voicevox_project/E01.vvproj",
			},
		],
	},
	{
		value: "build-all",
		label: "build-all",
		description: "台本 → 音声まで全工程",
		options: [
			{
				flag: "--script",
				label: "Script path",
				placeholder: "data/projects/.../script/E01_script.md",
			},
		],
	},
	{
		value: "check-run",
		label: "check-run",
		description: "run 出力の検証",
		options: [
			{
				flag: "--run-dir",
				label: "Run directory",
				placeholder: "data/projects/.../run-YYYYMMDD-HHMM",
			},
		],
	},
	{
		value: "prepare-run",
		label: "prepare-run",
		description: "run 引き継ぎ準備",
		options: [
			{
				flag: "--source-run-dir",
				label: "Source run directory",
				placeholder: "data/projects/.../run-YYYYMMDD-HHMM",
			},
		],
	},
	{
		value: "dict-sync",
		label: "dict-sync",
		description: "辞書同期",
		options: [],
	},
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
	command: string;
	onCommandChange: (cmd: string) => void;
	optionValues: Record<string, string>;
	onOptionChange: (flag: string, value: string) => void;
	status: PipelineLogStatus;
	onRun: () => void;
	onCancel: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandForm({
	command,
	onCommandChange,
	optionValues,
	onOptionChange,
	status,
	onRun,
	onCancel,
}: Props) {
	const isActive = status === "connecting" || status === "running";
	const currentDef = PIPELINE_COMMANDS.find((c) => c.value === command);

	const handleCommandChange = (next: string) => {
		onCommandChange(next);
	};

	return (
		<div className="rounded-xl border border-slate-200 bg-white/80 backdrop-blur p-4 space-y-4">
			{/* Command selector */}
			<div className="space-y-1.5">
				<Label htmlFor="cmd-select">コマンド</Label>
				<div className="flex gap-2 flex-wrap">
					{PIPELINE_COMMANDS.map((c) => (
						<button
							key={c.value}
							type="button"
							disabled={isActive}
							onClick={() => handleCommandChange(c.value)}
							className={[
								"px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
								command === c.value
									? "bg-emerald-600 text-white"
									: "bg-slate-100 text-slate-700 hover:bg-slate-200",
							].join(" ")}
							title={c.description}
						>
							{c.label}
						</button>
					))}
				</div>
				{currentDef && (
					<p className="text-xs text-slate-500">{currentDef.description}</p>
				)}
			</div>

			{/* Options */}
			{currentDef && currentDef.options.length > 0 && (
				<div className="space-y-3">
					{currentDef.options.map((opt) => (
						<div key={opt.flag} className="space-y-1.5">
							<Label htmlFor={`opt-${opt.flag}`}>
								<span className="font-mono text-xs text-slate-500 mr-1">
									{opt.flag}
								</span>
								{opt.label}
							</Label>
							<Input
								id={`opt-${opt.flag}`}
								value={optionValues[opt.flag] ?? ""}
								onChange={(e) => onOptionChange(opt.flag, e.target.value)}
								placeholder={opt.placeholder}
								disabled={isActive}
								className="font-mono text-sm"
							/>
						</div>
					))}
				</div>
			)}

			{/* Run / Cancel */}
			<div className="flex gap-2 pt-1">
				{isActive ? (
					<Button
						variant="secondary"
						onClick={onCancel}
						className="gap-1.5 text-red-600 hover:text-red-700"
					>
						<Square className="size-3.5" />
						Cancel
					</Button>
				) : (
					<Button onClick={onRun} className="gap-1.5">
						<Play className="size-3.5" />
						Run
					</Button>
				)}

				{status === "connecting" && (
					<span className="text-xs text-slate-500 self-center animate-pulse">
						接続中...
					</span>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Util: build CLI args from form values
// ---------------------------------------------------------------------------

export function buildArgs(
	command: string,
	optionValues: Record<string, string>,
): string[] {
	const def = PIPELINE_COMMANDS.find((c) => c.value === command);
	if (!def) return [];
	const args: string[] = [];
	for (const opt of def.options) {
		const value = optionValues[opt.flag]?.trim();
		if (value) {
			args.push(opt.flag, value);
		}
	}
	return args;
}
