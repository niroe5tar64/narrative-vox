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

export type ProjectConfig = {
  GENRE: string;
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

export type SpeakerStyle = { name: string; id: number; type: string };
export type Speaker = { name: string; speaker_uuid: string; styles: SpeakerStyle[] };
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

  styles: {
    list: () => apiFetch<{ items: unknown[] }>("/configs/styles"),
  },

  voicevox: {
    status: () => apiFetch<VoicevoxStatus>("/voicevox/status"),
    speakers: () => apiFetch<Speaker[]>("/voicevox/speakers"),
    getConfig: (name: string) => apiFetch<unknown>(`/configs/voice/voicevox/${name}`),
    putConfig: (name: string, data: unknown) =>
      apiFetch<unknown>(`/configs/voice/voicevox/${name}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },
};
