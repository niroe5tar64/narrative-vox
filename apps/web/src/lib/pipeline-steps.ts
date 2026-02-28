export const LAYER1_STEPS = [
  {
    key: "gen-blueprint",
    label: "ブループリント生成",
    note: "全体設計 JSON の生成",
  },
  {
    key: "gen-material",
    label: "素材生成",
    note: "エピソード素材 JSON の生成",
  },
  {
    key: "gen-script",
    label: "台本生成",
    note: "素材 → ナレーション台本 (.md)",
  },
  {
    key: "gen-digest",
    label: "ダイジェスト生成",
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

export type Layer1StepKey = (typeof LAYER1_STEPS)[number]["key"];
export type Layer2StepKey = (typeof LAYER2_STEPS)[number]["key"];
export type StepKey = Layer1StepKey | Layer2StepKey;

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

export function getLayer1StepArgs(
  stepKey: Layer1StepKey,
  projectId: string,
  episodeId: string,
  runDir: string,
): string[] {
  switch (stepKey) {
    case "gen-blueprint":
      return ["--project-id", projectId];
    default:
      return [
        "--project-id",
        projectId,
        "--episode-id",
        episodeId,
        "--run-dir",
        runDir,
      ];
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
export type PipelineTab = "layer1" | "layer2" | "utility";

export const PIPELINE_TABS: { id: PipelineTab; label: string }[] = [
  { id: "layer1", label: "Layer 1 — LLM 生成" },
  { id: "layer2", label: "Layer 2 — 音声合成" },
  { id: "utility", label: "ユーティリティ" },
];
