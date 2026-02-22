import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Save, Trash2 } from "lucide-react";

import {
	ApiError,
	api,
	type CharacterConfig,
	type Speaker,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Fieldset } from "@/components/ui/fieldset";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useDirtyGuard } from "@/hooks/useDirtyGuard";
import { cn } from "@/lib/utils";

// ===== Constants =====

const FIXED_ENGINE_ID = "074fc39e-678b-4c13-8916-ffca8d505d1d";

const EMOTION_PRESETS: { key: string; label: string }[] = [
	{ key: "calm", label: "落ち着いた" },
	{ key: "energetic", label: "活発" },
	{ key: "serious", label: "真剣" },
	{ key: "confused", label: "困惑" },
	{ key: "happy", label: "喜び" },
	{ key: "sad", label: "悲しみ" },
	{ key: "angry", label: "怒り" },
];

// ===== Form state types =====

type EmotionRow = { key: string; label: string; styleId: string; enabled: boolean };

type CharForm = {
	key: string;
	name: string;
	description: string;
	voiceSpeakerId: string;
	voiceStyleId: string;
	emotionRows: EmotionRow[];
};

const EMPTY_FORM: CharForm = {
	key: "",
	name: "",
	description: "",
	voiceSpeakerId: "",
	voiceStyleId: "0",
	emotionRows: EMOTION_PRESETS.map((p) => ({ ...p, styleId: "0", enabled: false })),
};

function charToForm(c: CharacterConfig): CharForm {
	return {
		key: c.key,
		name: c.name,
		description: c.description ?? "",
		voiceSpeakerId: c.voice.speakerId,
		voiceStyleId: String(c.voice.styleId),
		emotionRows: EMOTION_PRESETS.map((p) => {
			const existing = c.emotionStyles[p.key];
			return {
				key: p.key,
				label: p.label,
				styleId: existing !== undefined ? String(existing) : "0",
				enabled: existing !== undefined,
			};
		}),
	};
}

function formToChar(
	f: CharForm,
	profile?: Record<string, unknown>,
): CharacterConfig {
	return {
		key: f.key,
		name: f.name,
		...(f.description && { description: f.description }),
		voice: {
			engineId: FIXED_ENGINE_ID,
			speakerId: f.voiceSpeakerId,
			styleId: Number(f.voiceStyleId),
		},
		emotionStyles: Object.fromEntries(
			f.emotionRows
				.filter((r) => r.enabled)
				.map((r) => [r.key, Number(r.styleId)]),
		),
		...(profile && { profile }),
	};
}

// ===== SpeakerPicker: speaker selection only =====

function SpeakerPicker({
	speakers,
	value,
	onSelect,
}: {
	speakers: Speaker[];
	value: string;
	onSelect: (speakerId: string) => void;
}) {
	return (
		<select
			className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
			value={value}
			onChange={(e) => {
				if (e.target.value) onSelect(e.target.value);
			}}
		>
			<option value="">スピーカーを選択...</option>
			{speakers.map((s) => (
				<option key={s.speaker_uuid} value={s.speaker_uuid}>
					{s.name}
				</option>
			))}
		</select>
	);
}

// ===== StyleSelect: style selector for a given speaker =====

function StyleSelect({
	speakers,
	speakerId,
	value,
	onChange,
	disabled,
}: {
	speakers: Speaker[];
	speakerId: string;
	value: string;
	onChange: (styleId: string) => void;
	disabled?: boolean;
}) {
	const speaker = speakers.find((s) => s.speaker_uuid === speakerId);
	if (!speaker) {
		return <span className="text-xs text-slate-400">スピーカー未選択</span>;
	}
	return (
		<select
			className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60 disabled:bg-slate-50 disabled:text-slate-400"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			disabled={disabled}
		>
			{speaker.styles.map((st) => (
				<option key={st.id} value={String(st.id)}>
					{st.name} ({st.id})
				</option>
			))}
		</select>
	);
}

// ===== Main panel =====

export function CharactersPanel({
	onDirtyChange,
}: {
	onDirtyChange?: (dirty: boolean) => void;
} = {}) {
	const qc = useQueryClient();
	const [selected, setSelected] = useState<string | null>(null);
	const [isNew, setIsNew] = useState(false);
	const [form, setForm] = useState<CharForm>(EMPTY_FORM);
	const [savedFormStr, setSavedFormStr] = useState<string | null>(null);
	const [originalProfile, setOriginalProfile] = useState<
		Record<string, unknown> | undefined
	>(undefined);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	const isDirty = isNew
		? JSON.stringify(form) !== JSON.stringify(EMPTY_FORM)
		: savedFormStr !== null && JSON.stringify(form) !== savedFormStr;

	useDirtyGuard(isDirty);

	useEffect(() => {
		onDirtyChange?.(isDirty);
	}, [isDirty, onDirtyChange]);

	const { data: chars, isLoading } = useQuery({
		queryKey: ["characters"],
		queryFn: () => api.characters.list(),
	});

	const voicevoxStatusQuery = useQuery({
		queryKey: ["voicevox-status"],
		queryFn: () => api.voicevox.status(),
		retry: false,
	});
	const isVvRunning = voicevoxStatusQuery.data?.status === "running";

	const { data: speakers } = useQuery({
		queryKey: ["voicevox-speakers"],
		queryFn: () => api.voicevox.speakers(),
		enabled: isVvRunning,
		retry: false,
	});

	const saveMutation = useMutation({
		mutationFn: (f: CharForm) => {
			const data = formToChar(f, originalProfile);
			return isNew
				? api.characters.create(data)
				: api.characters.update(f.key, data);
		},
		onSuccess: (_, f) => {
			qc.invalidateQueries({ queryKey: ["characters"] });
			setError(null);
			setSuccess(true);
			setSavedFormStr(JSON.stringify(f));
			if (isNew) {
				setIsNew(false);
				setSelected(f.key);
			}
			setTimeout(() => setSuccess(false), 2500);
		},
		onError: (e) => {
			setError(
				e instanceof ApiError
					? `${e.title}${e.detail ? `: ${e.detail}` : ""}`
					: String(e),
			);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (key: string) => api.characters.delete(key),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["characters"] });
			setSelected(null);
			setIsNew(false);
			setForm(EMPTY_FORM);
			setSavedFormStr(null);
		},
		onError: (e) => {
			setError(e instanceof ApiError ? e.title : String(e));
		},
	});

	function selectChar(c: CharacterConfig) {
		if (
			isDirty &&
			!window.confirm("未保存の変更があります。変更を破棄しますか？")
		)
			return;
		const f = charToForm(c);
		setSelected(c.key);
		setIsNew(false);
		setForm(f);
		setSavedFormStr(JSON.stringify(f));
		setOriginalProfile(c.profile);
		setError(null);
		setSuccess(false);
	}

	function startNew() {
		if (
			isDirty &&
			!window.confirm("未保存の変更があります。変更を破棄しますか？")
		)
			return;
		setSelected(null);
		setIsNew(true);
		setForm(EMPTY_FORM);
		setSavedFormStr(null);
		setOriginalProfile(undefined);
		setError(null);
		setSuccess(false);
	}

	function patch(p: Partial<CharForm>) {
		setForm((f) => ({ ...f, ...p }));
	}

	function updateEmotionRow(i: number, p: Partial<EmotionRow>) {
		patch({
			emotionRows: form.emotionRows.map((r, idx) =>
				idx === i ? { ...r, ...p } : r,
			),
		});
	}

	const showEditor = isNew || selected !== null;

	return (
		<div className="flex min-h-0 gap-6">
			{/* List */}
			<div className="flex w-60 flex-shrink-0 flex-col gap-3">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-bold tracking-tight">Characters</h2>
					<Button size="sm" onClick={startNew}>
						<Plus className="h-4 w-4" />
						New
					</Button>
				</div>
				{isLoading ? (
					<div className="flex justify-center py-8">
						<Spinner />
					</div>
				) : (
					<div className="flex flex-col gap-1">
						{chars?.items.map((c) => {
							const item = c as CharacterConfig;
							return (
								<button
									key={item.key}
									type="button"
									onClick={() => selectChar(item)}
									className={cn(
										"rounded-md px-3 py-2 text-left text-sm transition-colors",
										selected === item.key && !isNew
											? "bg-emerald-600 text-white"
											: "hover:bg-slate-100",
									)}
								>
									<div className="font-medium">{item.name}</div>
									<div className="text-xs opacity-60">{item.key}</div>
								</button>
							);
						})}
						{chars?.items.length === 0 && (
							<p className="py-4 text-center text-sm text-slate-500">
								No characters
							</p>
						)}
					</div>
				)}
			</div>

			{/* Editor */}
			{showEditor ? (
				<div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
					<h3 className="mb-5 text-base font-semibold">
						{isNew ? "New Character" : `Edit: ${selected}`}
					</h3>
					<div className="max-w-lg space-y-4">
						{/* Key */}
						<div>
							<Label htmlFor="char-key">Key</Label>
							<Input
								id="char-key"
								value={form.key}
								onChange={(e) => patch({ key: e.target.value })}
								readOnly={!isNew}
								className={!isNew ? "bg-slate-50 text-slate-500" : ""}
								placeholder="e.g. narrator"
							/>
						</div>

						{/* Name */}
						<div>
							<Label htmlFor="char-name">Name</Label>
							<Input
								id="char-name"
								value={form.name}
								onChange={(e) => patch({ name: e.target.value })}
								placeholder="表示名"
							/>
						</div>

						{/* Description */}
						<div>
							<Label htmlFor="char-desc">Description</Label>
							<Textarea
								id="char-desc"
								value={form.description}
								onChange={(e) => patch({ description: e.target.value })}
								placeholder="キャラクターの説明（任意）"
								rows={2}
							/>
						</div>

						{/* Voice */}
						<Fieldset legend="Voice">
							{isVvRunning && speakers && speakers.length > 0 ? (
								<div>
									<Label>スピーカー</Label>
									<SpeakerPicker
										speakers={speakers}
										value={form.voiceSpeakerId}
										onSelect={(speakerId) => {
											const spk = speakers.find((s) => s.speaker_uuid === speakerId);
											const firstStyleId = spk?.styles[0]?.id;
											patch({
												voiceSpeakerId: speakerId,
												...(firstStyleId !== undefined && {
													voiceStyleId: String(firstStyleId),
													emotionRows: form.emotionRows.map((r) => ({
														...r,
														styleId: String(firstStyleId),
													})),
												}),
											});
										}}
									/>
									<p className="mt-1 text-xs text-slate-400">
										選択するとスピーカーIDが反映されます
									</p>
								</div>
							) : (
								<p className="text-xs text-amber-600">
									VOICEVOX未起動のためスピーカー変更不可
									{form.voiceSpeakerId && (
										<span className="ml-2 font-mono text-slate-500">
											{form.voiceSpeakerId}
										</span>
									)}
								</p>
							)}
						</Fieldset>

						{/* Emotion Styles */}
						<Fieldset legend="Emotion Styles">
							<div className="space-y-1">
								{/* Default row: always enabled */}
								<div className="flex h-8 items-center gap-3">
									<Checkbox checked disabled className="cursor-not-allowed" />
									<span className="w-24 font-mono text-sm">default</span>
									<span className="w-20 text-xs text-slate-400">デフォルト</span>
									<StyleSelect
										speakers={speakers ?? []}
										speakerId={form.voiceSpeakerId}
										value={form.voiceStyleId}
										onChange={(v) => patch({ voiceStyleId: v })}
										disabled={!isVvRunning}
									/>
								</div>

								{/* 7 preset emotion rows */}
								{form.emotionRows.map((row, i) => (
									// biome-ignore lint/suspicious/noArrayIndexKey: fixed preset order
									<div key={i} className="flex h-8 items-center gap-3">
										<Checkbox
											id={`emotion-${row.key}`}
											checked={row.enabled}
											onCheckedChange={(checked) =>
												updateEmotionRow(i, { enabled: checked === true })
											}
										/>
										<Label htmlFor={`emotion-${row.key}`} className="flex cursor-pointer items-center gap-3">
											<span className="w-24 font-mono">{row.key}</span>
											<span className="w-20 text-xs text-slate-400">{row.label}</span>
										</Label>
										{row.enabled && (
											<StyleSelect
												speakers={speakers ?? []}
												speakerId={form.voiceSpeakerId}
												value={row.styleId}
												onChange={(v) => updateEmotionRow(i, { styleId: v })}
												disabled={!isVvRunning}
											/>
										)}
									</div>
								))}
							</div>
						</Fieldset>

						{/* Feedback */}
						{error && <p className="text-sm text-red-600">{error}</p>}
						{success && (
							<p className="text-sm text-emerald-600">Saved successfully.</p>
						)}

						{/* Actions */}
						<div className="flex gap-3 pt-2">
							<Button
								onClick={() => saveMutation.mutate(form)}
								disabled={saveMutation.isPending}
							>
								{saveMutation.isPending ? (
									<Spinner className="mr-1" />
								) : (
									<Save className="mr-1 h-4 w-4" />
								)}
								Save
							</Button>
							{!isNew && selected && (
								<Button
									variant="secondary"
									className="text-red-600 hover:text-red-700"
									disabled={deleteMutation.isPending}
									onClick={() => {
										if (window.confirm(`"${selected}" を削除しますか？`)) {
											deleteMutation.mutate(selected);
										}
									}}
								>
									<Trash2 className="mr-1 h-4 w-4" />
									Delete
								</Button>
							)}
						</div>
					</div>
				</div>
			) : (
				<div className="flex flex-1 items-center justify-center text-sm text-slate-400">
					キャラクターを選択するか、New で作成してください
				</div>
			)}
		</div>
	);
}
