import type {
  FileResult,
  JobCancelResult,
  JobStartResult,
  LogEntry,
  PipelineRunRequest,
  ProblemResponse,
  RunListResult,
  RunStatus,
  RunTreeResult,
  TreeNode,
  Utterance,
  UtteranceUpdate,
  VoicevoxText,
} from "@narrative-vox/api-types";

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

export type UserDictWord = {
  surface: string;
  pronunciation: string;
  accent_type: number;
  word_type: string;
  priority: number;
};
export type UserDict = { version: number; words: UserDictWord[] };

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

export type {
  FileResult,
  JobCancelResult,
  JobStartResult,
  LogEntry,
  RunListResult,
  RunStatus,
  TreeNode,
  Utterance,
  UtteranceUpdate,
  VoicevoxText,
};

// ===== Error =====

export class ApiError extends Error {
  status: number;
  title: string;
  detail?: string;

  constructor(status: number, title: string, detail?: string) {
    super(title);
    this.status = status;
    this.title = title;
    this.detail = detail;
  }
}

// ===== Fetch helper =====

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const method = init?.method?.toUpperCase() ?? "GET";
  const hasBody = init?.body !== undefined && init?.body !== null;
  const isFormData =
    typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (
    hasBody &&
    method !== "GET" &&
    method !== "HEAD" &&
    !isFormData &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/api${path}`, {
    headers,
    ...init,
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json()) as T | ProblemResponse;
  if (!res.ok) {
    const problem = json as ProblemResponse;
    throw new ApiError(
      res.status,
      problem.title ?? "Unknown error",
      problem.detail,
    );
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
      apiFetch<SpeakerInfo>(
        `/voicevox/speaker_info?speaker_uuid=${encodeURIComponent(speakerUuid)}`,
      ),
    getConfig: (name: string) =>
      apiFetch<unknown>(`/configs/voice/voicevox/${name}`),
    putConfig: (name: string, data: unknown) =>
      apiFetch<unknown>(`/configs/voice/voicevox/${name}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    audioQuery: (text: string, speakerId: number) =>
      apiFetch<unknown>(
        `/voicevox/audio_query?text=${encodeURIComponent(text)}&speaker=${speakerId}`,
        { method: "POST" },
      ),
    synthesis: async (
      speakerId: number,
      audioQuery: unknown,
    ): Promise<string> => {
      const res = await fetch(`/api/voicevox/synthesis?speaker=${speakerId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(audioQuery),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as Record<
          string,
          unknown
        >;
        throw new ApiError(
          res.status,
          (err.title as string) ?? "Synthesis failed",
          err.detail as string | undefined,
        );
      }
      const buf = await res.arrayBuffer();
      return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
    },
    moraPitch: (accentPhrases: unknown[], speakerId: number) =>
      apiFetch<unknown[]>(`/voicevox/mora_pitch?speaker=${speakerId}`, {
        method: "POST",
        body: JSON.stringify(accentPhrases),
      }),
  },

  pipeline: {
    run: (command: string, args: string[]) => {
      const payload: PipelineRunRequest = { command, args };
      return apiFetch<JobStartResult>("/pipeline/run", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
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
      apiFetch<RunTreeResult>(`/runs/${projectId}/${runId}/tree`),

    status: (projectId: string, runId: string) =>
      apiFetch<RunStatus>(`/runs/${projectId}/${runId}/status`),

    getFile: async (
      projectId: string,
      runId: string,
      filePath: string,
    ): Promise<FileResult> => {
      const res = await fetch(
        `/api/runs/${projectId}/${runId}/file?path=${encodeURIComponent(filePath)}`,
      );
      if (!res.ok) {
        const json = (await res
          .json()
          .catch(() => ({}))) as Partial<ProblemResponse>;
        throw new ApiError(
          res.status,
          json.title ?? "Unknown error",
          json.detail,
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
        const json = (await res
          .json()
          .catch(() => ({}))) as Partial<ProblemResponse>;
        throw new ApiError(
          res.status,
          json.title ?? "Unknown error",
          json.detail,
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
