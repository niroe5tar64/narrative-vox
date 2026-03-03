export type RunItem = {
  projectId: string;
  runId: string;
  createdAt: string;
};

export type SingletonStageInfo = {
  status: "completed" | "idle";
};

export type PerEpisodeStageInfo =
  | { status: "completed" }
  | { status: "partial" | "idle"; episodeIds: string[] };

export type RunStatus = {
  projectId: string;
  runId: string;
  plannedEpisodeIds: string[];
  stages: {
    source_index: SingletonStageInfo;
    blueprint: SingletonStageInfo;
    episode_pack: PerEpisodeStageInfo;
    script: PerEpisodeStageInfo;
    series_context: PerEpisodeStageInfo;
    voicevox_text: PerEpisodeStageInfo;
    voicevox_project: PerEpisodeStageInfo;
    audio: PerEpisodeStageInfo;
  };
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

export type RunTreeResult = {
  tree: TreeNode;
};

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
