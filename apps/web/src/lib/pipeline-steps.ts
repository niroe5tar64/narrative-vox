export const AUTHORING_STEPS = [
  {
    key: "gen-source-index",
    label: "ソースインデックス生成",
    note: "ソースファイルの解析・チャンク分割",
  },
  {
    key: "gen-blueprint",
    label: "ブループリント生成",
    note: "全体設計 JSON の生成",
  },
  {
    key: "gen-episode-pack",
    label: "エピソードパック生成",
    note: "エピソード素材パックの生成",
  },
  {
    key: "gen-script",
    label: "台本生成",
    note: "素材 → ナレーション台本 (.md)",
  },
  {
    key: "update-series-context",
    label: "シリーズコンテキスト更新",
    note: "エピソード間一貫性用 JSON",
  },
] as const;

export const LAYER2_STEPS = [
  {
    key: "build-text",
    label: "テキスト変換",
    note: "台本 (.md) → VOICEVOX テキスト (.json)",
  },
  {
    key: "patch-voicevox-text",
    label: "テキスト正規化",
    note: "辞書パッチ・読み仮名補正",
  },
  {
    key: "build-project",
    label: "プロジェクト生成",
    note: "テキスト → VOICEVOX プロジェクト (.vvproj)",
  },
  {
    key: "build-audio",
    label: "音声合成",
    note: "VOICEVOX が必要",
  },
] as const;

export type AuthoringStepKey = (typeof AUTHORING_STEPS)[number]["key"];
export type Layer2StepKey = (typeof LAYER2_STEPS)[number]["key"];
export type StepKey = AuthoringStepKey | Layer2StepKey;

export type Paths = {
  script: string;
  voicevoxTextRaw: string;
  voicevoxTextPatched: string;
  vvproj: string;
  runDir: string;
};

export function derivePaths(runKey: string, episodeId: string): Paths | null {
  if (!runKey || !episodeId) return null;
  const idx = runKey.indexOf("/");
  if (idx < 0) return null;
  const projectId = runKey.slice(0, idx);
  const runId = runKey.slice(idx + 1);
  const base = `data/projects/${projectId}/${runId}`;
  return {
    script: `${base}/script/${episodeId}_script.md`,
    voicevoxTextRaw: `${base}/voicevox_text/${episodeId}_voicevox_text.json`,
    voicevoxTextPatched: `${base}/voicevox_text/${episodeId}_voicevox_text.patched.json`,
    vvproj: `${base}/voicevox_project/${episodeId}.vvproj`,
    runDir: base,
  };
}

export function getAuthoringStepArgs(
  stepKey: AuthoringStepKey,
  projectId: string,
  episodeId: string,
): string[] {
  switch (stepKey) {
    case "gen-source-index":
    case "gen-blueprint":
      return ["--project-id", projectId];
    default:
      return ["--project-id", projectId, "--episode-id", episodeId];
  }
}

export function getLayer2StepArgs(
  stepKey: Layer2StepKey,
  paths: Paths,
): string[] {
  switch (stepKey) {
    case "build-text":
      return ["--script", paths.script];
    case "patch-voicevox-text":
      return ["--voicevox-text-json", paths.voicevoxTextRaw];
    case "build-project":
      return ["--voicevox-text-json", paths.voicevoxTextPatched];
    case "build-audio":
      return ["--vvproj", paths.vvproj];
  }
}

export type StepStatus = "idle" | "running" | "done" | "error";
export type PipelineTab = "authoring" | "layer2" | "utility";

export const PIPELINE_TABS: { id: PipelineTab; label: string }[] = [
  { id: "authoring", label: "Authoring Pipeline" },
  { id: "layer2", label: "Layer 2 — 音声合成" },
  { id: "utility", label: "ユーティリティ" },
];
