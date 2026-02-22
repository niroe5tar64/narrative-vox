// ===== Domain Types =====

export type CharacterConfig = {
	key: string;
	name: string;
	description?: string;
	voice: {
		engineId: string;
		speakerId: string;
		styleId: number;
	};
	emotionStyles: Record<string, number>;
	profile?: Record<string, unknown>;
};

export type GenreConfig = {
	genre_id: string;
	genre_name: string;
	extra_fields: string[];
};

export type ProjectConfig = {
	GENRE_ID: string;
	PROJECT_ID: string;
	PROJECT_TITLE: string;
	SOURCE_MARKDOWN_PATHS: string;
	AUDIENCE_BACKGROUND: string;
	AUDIENCE_LEVEL: string;
	AUDIENCE_INTEREST: string;
	BASELINE_CONTEXT_OR_EMPTY: string;
	EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY: string;
	PROJECT_BLUEPRINT_JSON_PATH: string;
	EPISODE_ID: string;
	STYLE_ID: string;
	CAST: Record<string, string>;
	NOTES?: string;
};

export type StyleConfig = {
	style_id: string;
	style_name: string;
	format: {
		speaker_mode: string;
		speaker_count: number;
		speaker_roles: { role: string; utterance_share: number }[];
	};
};

export type SpeakerStyle = { name: string; id: number; type: string };
export type Speaker = {
	name: string;
	speaker_uuid: string;
	styles: SpeakerStyle[];
};
export type SpeakerStyleInfo = {
	id: number;
	icon: string;
	portrait?: string;
	voice_samples: string[];
};
export type SpeakerInfo = {
	policy: string;
	portrait: string;
	style_infos: SpeakerStyleInfo[];
};
export type VoicevoxStatus = { status: "running"; version: string };

export type ReadingEntry = { surface: string; reading: string };
export type ReadingDictionary = { version: number; entries: ReadingEntry[] };

export type UserDictWord = {
	surface: string;
	pronunciation: string;
	accent_type: number;
	word_type: string;
	priority: number;
};
export type UserDict = { version: number; words: UserDictWord[] };

// ===== Runs =====

export type RunItem = {
	projectId: string;
	runId: string;
	createdAt: string;
};

export type RunListResult = {
	items: RunItem[];
	total: number;
	page: number;
	pageSize: number;
};

export type TreeNode =
	| { name: string; type: "file"; path: string }
	| { name: string; type: "dir"; children: TreeNode[] };

export type Utterance = {
	utterance_id: string;
	section_id?: number;
	section_title?: string;
	speaker_key?: string;
	text: string;
	pause_length_ms: number;
	[key: string]: unknown;
};

export type VoicevoxText = {
	utterances: Utterance[];
	[key: string]: unknown;
};

export type UtteranceUpdate = {
	utterance_id: string;
	text?: string;
	pause_length_ms?: number;
};

export type FileResult = {
	content: string;
	etag: string | null;
};

export type ManifestUtterance = {
	audio_key: string;
	text: string;
	status: string;
	[key: string]: unknown;
};

export type ManifestData = {
	meta?: Record<string, unknown>;
	output?: Record<string, unknown>;
	utterances?: ManifestUtterance[];
	[key: string]: unknown;
};

export type LogEntry = {
	type: "stdout" | "stderr" | "system";
	data: string;
	ts: string;
	seq: number;
	code?: number;
	cancelled?: boolean;
};

export type JobStartResult = {
	jobId: string;
	command: string;
	args: string[];
	startedAt: string;
};

export type JobCancelResult = {
	jobId: string;
	status: string;
	cancelled: boolean;
};

// ===== Error =====

export class ApiError extends Error {
	constructor(
		public status: number,
		public title: string,
		public detail?: string,
	) {
		super(title);
	}
}

// ===== Fetch helper =====

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`/api${path}`, {
		headers: { "Content-Type": "application/json", ...init?.headers },
		...init,
	});
	if (res.status === 204) return undefined as T;
	const json = await res.json();
	if (!res.ok) {
		throw new ApiError(res.status, json.title ?? "Unknown error", json.detail);
	}
	return json as T;
}

// ===== API =====

export const api = {
	characters: {
		list: () => apiFetch<{ items: CharacterConfig[] }>("/configs/characters"),
		create: (data: CharacterConfig) =>
			apiFetch<CharacterConfig>("/configs/characters", {
				method: "POST",
				body: JSON.stringify(data),
			}),
		update: (key: string, data: CharacterConfig) =>
			apiFetch<CharacterConfig>(`/configs/characters/${key}`, {
				method: "PUT",
				body: JSON.stringify(data),
			}),
		delete: (key: string) =>
			apiFetch<void>(`/configs/characters/${key}`, { method: "DELETE" }),
	},

	projects: {
		list: () => apiFetch<{ items: ProjectConfig[] }>("/configs/projects"),
		create: (data: ProjectConfig) =>
			apiFetch<ProjectConfig>("/configs/projects", {
				method: "POST",
				body: JSON.stringify(data),
			}),
		update: (id: string, data: ProjectConfig) =>
			apiFetch<ProjectConfig>(`/configs/projects/${id}`, {
				method: "PUT",
				body: JSON.stringify(data),
			}),
		delete: (id: string) =>
			apiFetch<void>(`/configs/projects/${id}`, { method: "DELETE" }),
	},

	genres: {
		list: () => apiFetch<{ items: GenreConfig[] }>("/configs/genres"),
	},

	styles: {
		list: () => apiFetch<{ items: StyleConfig[] }>("/configs/styles"),
	},

	voicevox: {
		status: () => apiFetch<VoicevoxStatus>("/voicevox/status"),
		speakers: () => apiFetch<Speaker[]>("/voicevox/speakers"),
		speakerInfo: (speakerUuid: string) =>
			apiFetch<SpeakerInfo>(`/voicevox/speaker_info?speaker_uuid=${encodeURIComponent(speakerUuid)}`),
		getConfig: (name: string) =>
			apiFetch<unknown>(`/configs/voice/voicevox/${name}`),
		putConfig: (name: string, data: unknown) =>
			apiFetch<unknown>(`/configs/voice/voicevox/${name}`, {
				method: "PUT",
				body: JSON.stringify(data),
			}),
	},

	pipeline: {
		run: (command: string, args: string[]) =>
			apiFetch<JobStartResult>("/pipeline/run", {
				method: "POST",
				body: JSON.stringify({ command, args }),
			}),
		cancel: (jobId: string) =>
			apiFetch<JobCancelResult>(`/pipeline/${jobId}/cancel`, {
				method: "POST",
			}),
	},

	runs: {
		list: (params?: {
			projectId?: string;
			page?: number;
			pageSize?: number;
		}) => {
			const q = new URLSearchParams();
			if (params?.projectId) q.set("projectId", params.projectId);
			if (params?.page !== undefined) q.set("page", String(params.page));
			if (params?.pageSize !== undefined)
				q.set("pageSize", String(params.pageSize));
			const qs = q.toString();
			return apiFetch<RunListResult>(`/runs${qs ? `?${qs}` : ""}`);
		},

		tree: (projectId: string, runId: string) =>
			apiFetch<{ tree: TreeNode }>(`/runs/${projectId}/${runId}/tree`),

		getFile: async (
			projectId: string,
			runId: string,
			filePath: string,
		): Promise<FileResult> => {
			const res = await fetch(
				`/api/runs/${projectId}/${runId}/file?path=${encodeURIComponent(filePath)}`,
			);
			if (!res.ok) {
				const json = (await res.json().catch(() => ({}))) as Record<
					string,
					unknown
				>;
				throw new ApiError(
					res.status,
					(json.title as string | undefined) ?? "Unknown error",
					json.detail as string | undefined,
				);
			}
			const content = await res.text();
			const etag = res.headers.get("ETag");
			return { content, etag };
		},

		saveFile: async (
			projectId: string,
			runId: string,
			filePath: string,
			utterances: UtteranceUpdate[],
			etag: string,
		): Promise<FileResult> => {
			const res = await fetch(
				`/api/runs/${projectId}/${runId}/file?path=${encodeURIComponent(filePath)}`,
				{
					method: "PUT",
					headers: { "Content-Type": "application/json", "If-Match": etag },
					body: JSON.stringify({ utterances }),
				},
			);
			if (!res.ok) {
				const json = (await res.json().catch(() => ({}))) as Record<
					string,
					unknown
				>;
				throw new ApiError(
					res.status,
					(json.title as string | undefined) ?? "Unknown error",
					json.detail as string | undefined,
				);
			}
			const content = await res.text();
			const newEtag = res.headers.get("ETag");
			return { content, etag: newEtag };
		},
	},

	editor: {
		open: (path: string) =>
			apiFetch<{ opened: boolean; path: string }>("/editor/open", {
				method: "POST",
				body: JSON.stringify({ path }),
			}),
	},
};
