import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Save, Trash2 } from "lucide-react";

import {
	ApiError,
	api,
	type CharacterConfig,
	type Speaker,
	type SpeakerInfo,
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
	profileJson: string;
};

const PROFILE_TEMPLATE = {
	gender: "neutral",
	age_range: "adult",
	knowledge_level: "expert",
	personality_traits: ["特性1"],
	speech_register: "polite_desu_masu",
	sentence_patterns: {
		typical_endings: ["です", "ます"],
		filler_words: [],
		catchphrases: [],
		forbidden_patterns: [],
	},
	interaction_behavior: {
		explains_by: "logical_steps",
		responds_to_questions_by: "direct_answer",
		emotion_range: "moderate",
	},
	topic_affinity: {
		enthusiastic_about: [],
		cautious_about: [],
	},
};

const EMPTY_FORM: CharForm = {
	key: "",
	name: "",
	description: "",
	voiceSpeakerId: "",
	voiceStyleId: "0",
	emotionRows: EMOTION_PRESETS.map((p) => ({ ...p, styleId: "0", enabled: false })),
	profileJson: JSON.stringify(PROFILE_TEMPLATE, null, 2),
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
		profileJson: c.profile
			? JSON.stringify(c.profile, null, 2)
			: JSON.stringify(PROFILE_TEMPLATE, null, 2),
	};
}

function formToChar(f: CharForm): CharacterConfig {
	let profile: Record<string, unknown> | undefined;
	try {
		profile = JSON.parse(f.profileJson) as Record<string, unknown>;
	} catch {
		profile = undefined;
	}
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

// ===== SpeakerPicker: speaker selection with icons =====

function SpeakerPicker({
	speakers,
	speakerInfoMap,
	value,
	onSelect,
}: {
	speakers: Speaker[];
	speakerInfoMap: Record<string, SpeakerInfo>;
	value: string;
	onSelect: (speakerId: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleMouseDown(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, []);

	const selected = speakers.find((s) => s.speaker_uuid === value);
	const selectedIcon = value ? speakerInfoMap[value]?.style_infos[0]?.icon : undefined;

	return (
		<div className="relative" ref={ref}>
			<button
				type="button"
				className="flex h-10 w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
				onClick={() => setOpen((v) => !v)}
			>
				{selectedIcon ? (
					<img
						src={`data:image/png;base64,${selectedIcon}`}
						alt=""
						className="h-7 w-7 flex-shrink-0 rounded object-cover"
					/>
				) : (
					<span className="h-7 w-7 flex-shrink-0 rounded bg-slate-100" />
				)}
				<span className="flex-1 text-left">{selected?.name ?? "スピーカーを選択..."}</span>
				<ChevronDown className="h-4 w-4 flex-shrink-0 text-slate-400" />
			</button>
			{open && (
				<div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
					{speakers.map((s) => {
						const icon = speakerInfoMap[s.speaker_uuid]?.style_infos[0]?.icon;
						return (
							<button
								key={s.speaker_uuid}
								type="button"
								className={cn(
									"flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-slate-50",
									s.speaker_uuid === value && "bg-emerald-50 font-medium text-emerald-700",
								)}
								onClick={() => {
									onSelect(s.speaker_uuid);
									setOpen(false);
								}}
							>
								{icon ? (
									<img
										src={`data:image/png;base64,${icon}`}
										alt=""
										className="h-7 w-7 flex-shrink-0 rounded object-cover"
									/>
								) : (
									<span className="h-7 w-7 flex-shrink-0 rounded bg-slate-100" />
								)}
								{s.name}
							</button>
						);
					})}
				</div>
			)}
		</div>
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

	const speakerInfoQueries = useQueries({
		queries: (speakers ?? []).map((s) => ({
			queryKey: ["voicevox-speaker-info", s.speaker_uuid],
			queryFn: () => api.voicevox.speakerInfo(s.speaker_uuid),
			enabled: isVvRunning && !!speakers,
			retry: false,
			staleTime: 5 * 60 * 1000,
		})),
	});

	const speakerInfoMap = useMemo(() => {
		const map: Record<string, SpeakerInfo> = {};
		for (let i = 0; i < (speakers ?? []).length; i++) {
			const data = speakerInfoQueries[i]?.data;
			if (data) map[(speakers ?? [])[i].speaker_uuid] = data;
		}
		return map;
	}, [speakerInfoQueries, speakers]);

	const saveMutation = useMutation({
		mutationFn: (f: CharForm) => {
			const data = formToChar(f);
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
							const info = speakerInfoMap[item.voice.speakerId];
							const icon =
								info?.style_infos.find((s) => s.id === item.voice.styleId)?.icon ??
								info?.style_infos[0]?.icon;
							const isSelected = selected === item.key && !isNew;
							return (
								<button
									key={item.key}
									type="button"
									onClick={() => selectChar(item)}
									className={cn(
										"flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
										isSelected ? "bg-emerald-600 text-white" : "hover:bg-slate-100",
									)}
								>
									{icon ? (
										<img
											src={`data:image/png;base64,${icon}`}
											alt=""
											className="h-9 w-9 flex-shrink-0 rounded object-cover"
										/>
									) : (
										<span className="h-9 w-9 flex-shrink-0 rounded bg-slate-200" />
									)}
									<div className="min-w-0">
										<div className="font-medium">{item.name}</div>
										<div className="text-xs opacity-60">{item.key}</div>
									</div>
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
									<Label>Speaker</Label>
									<SpeakerPicker
										speakers={speakers}
										speakerInfoMap={speakerInfoMap}
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

						{/* Profile */}
						<Fieldset legend="Profile (JSON)">
							{(() => {
								let profileJsonError: string | null = null;
								try {
									JSON.parse(form.profileJson);
								} catch (e) {
									profileJsonError = e instanceof Error ? e.message : "Invalid JSON";
								}
								return (
									<>
										<Textarea
											value={form.profileJson}
											onChange={(e) => patch({ profileJson: e.target.value })}
											rows={20}
											className="font-mono text-xs"
											spellCheck={false}
										/>
										{profileJsonError && (
											<p className="mt-1 text-xs text-red-600">{profileJsonError}</p>
										)}
									</>
								);
							})()}
						</Fieldset>

						{/* Feedback */}
						{error && <p className="text-sm text-red-600">{error}</p>}
						{success && (
							<p className="text-sm text-emerald-600">Saved successfully.</p>
						)}

						{/* Actions */}
						<div className="flex gap-3 pt-2">
							<Button
								onClick={() => {
									let profileJsonError: string | null = null;
									try {
										JSON.parse(form.profileJson);
									} catch (e) {
										profileJsonError = e instanceof Error ? e.message : "Invalid JSON";
									}
									if (profileJsonError) {
										setError(`Profile JSON エラー: ${profileJsonError}`);
										return;
									}
									saveMutation.mutate(form);
								}}
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
