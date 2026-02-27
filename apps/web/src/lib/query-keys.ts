export const queryKeys = {
  characters: {
    all: ["characters"] as const,
    list: () => ["characters"] as const,
  },
  projects: {
    all: ["projects"] as const,
    list: () => ["projects"] as const,
  },
  runs: {
    all: ["runs"] as const,
    list: (projectId?: string, page?: number) =>
      ["runs", projectId, page] as const,
    byProject: (projectId?: string) => ["runs", projectId] as const,
    tree: (projectId: string, runId: string) =>
      ["run-tree", projectId, runId] as const,
    status: (projectId: string, runId: string) =>
      ["run-status", projectId, runId] as const,
    statusAll: ["run-status"] as const,
    file: (projectId: string, runId: string, filePath: string) =>
      ["run-file", projectId, runId, filePath] as const,
  },
  voicevox: {
    status: () => ["voicevox-status"] as const,
    speakers: () => ["voicevox-speakers"] as const,
    speakerInfo: (uuid: string) => ["voicevox-speaker-info", uuid] as const,
    config: (name: string) => ["voicevox-config", name] as const,
  },
  genres: {
    list: () => ["genres"] as const,
  },
  styles: {
    list: () => ["styles"] as const,
  },
} as const;
