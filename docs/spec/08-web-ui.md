---
spec-id: spec-08
title: Web UI 仕様
updated: 2026-03-01
depends-on: [spec-07]
referenced-by: [spec-00]
---

# Web UI 仕様

## 概要

`apps/web/` は Vite + React の SPA。パイプライン操作・設定管理・Run 閲覧の3機能を持つ7ページで構成される。API サーバー（ポート 3000）と通信し、WebSocket でパイプラインのリアルタイムログを表示する。

---

## テックスタック

| 技術 | 用途 |
|---|---|
| Vite + React | ビルド・UI フレームワーク |
| React Router v6 | SPA ルーティング |
| TanStack Query | サーバーステート管理 |
| shadcn/ui | UI コンポーネント基盤 |
| Tailwind CSS v4 | スタイリング |
| Lucide React | アイコン |
| TypeScript | 型安全 |

---

## ディレクトリ構成

```
apps/web/src/
├── App.tsx                   # ルーター定義
├── api/
│   └── client.ts             # API クライアント
├── components/
│   ├── configs/              # 設定管理コンポーネント
│   │   ├── CharactersPanel.tsx
│   │   ├── GenrePanel.tsx
│   │   ├── StylesPanel.tsx
│   │   └── voicevox/
│   │       ├── SpeedProfilesEditor.tsx
│   │       └── SynthesisDefaultsEditor.tsx
│   ├── feedback/
│   │   ├── ApiErrorBanner.tsx
│   │   ├── ConfirmDialog.tsx
│   │   └── PageErrorBoundary.tsx
│   ├── layout/
│   │   └── AppShell.tsx      # ナビゲーション + ページレイアウト
│   ├── pipeline/
│   │   ├── LogTerminal.tsx   # リアルタイムログ表示
│   │   ├── PipelineContextSelector.tsx
│   │   ├── PipelineHeader.tsx
│   │   ├── PipelineLayer1Panel.tsx
│   │   ├── PipelineLayer2Panel.tsx
│   │   └── PipelineUtilityPanel.tsx
│   └── ui/                   # 汎用 UI コンポーネント
│       ├── button.tsx
│       ├── spinner.tsx
│       ├── tab-bar.tsx
│       └── textarea.tsx
├── hooks/
│   ├── useDirtyGuard.ts      # 未保存変更の離脱防止
│   ├── useFlashMessage.ts    # 一時メッセージ表示
│   ├── usePipelineAvailability.ts  # ステップ実行可否判定
│   ├── usePipelineContext.ts  # パイプラインコンテキスト状態
│   └── usePipelineJob.ts     # ジョブ実行・WebSocket
├── lib/
│   ├── pipeline-steps.ts     # パイプラインステップ定義
│   └── query-keys.ts         # TanStack Query キー定義
└── pages/
    ├── configs/
    │   ├── ContentPage.tsx
    │   ├── DictionariesPage.tsx
    │   ├── ProjectsPage.tsx
    │   └── VoicevoxPage.tsx
    ├── pipeline/
    │   └── PipelinePage.tsx
    └── runs/
        ├── RunDetailPage.tsx
        └── RunsPage.tsx
```

---

## ルーティング

| パス | コンポーネント | 説明 |
|---|---|---|
| `/` | → `/configs/content` リダイレクト | — |
| `/configs/content` | `ContentPage` | キャラクター・スタイル・ジャンル設定 |
| `/configs/pipeline/projects` | `ProjectsPage` | プロジェクト設定 |
| `/configs/voice/voicevox` | `VoicevoxPage` | 音声合成設定 |
| `/configs/dictionaries` | `DictionariesPage` | ユーザー辞書 |
| `/pipeline` | `PipelinePage` | パイプライン実行 |
| `/runs` | `RunsPage` | Run 一覧 |
| `/runs/:projectId/:runId` | `RunDetailPage` | Run 詳細 |
| `/*` | → `/configs/content` リダイレクト | — |

---

## ページ詳細仕様

### ContentPage（/configs/content）

**機能**: キャラクター定義・スタイル・ジャンルの閲覧・編集

**タブ構成**:
- `Characters` タブ: キャラクター一覧。キャラクターの新規作成・編集・削除（API CRUD）
- `Styles` タブ: コンテンツスタイル一覧（読み取り専用）
- `Genre` タブ: ジャンル一覧（読み取り専用）

**未保存変更の保護**: タブ切り替え時に未保存変更がある場合は確認ダイアログを表示。

---

### ProjectsPage（/configs/pipeline/projects）

**機能**: プロジェクト設定の閲覧・作成・編集・削除

- プロジェクト一覧表示
- 各プロジェクトの JSON 形式エディタ（スキーマバリデーション付き）
- 新規プロジェクト作成

---

### VoicevoxPage（/configs/voice/voicevox）

**機能**: VOICEVOX 音声合成パラメータの設定

**タブ構成**:
- `Synthesis Defaults` タブ: `SynthesisDefaultsEditor` コンポーネント（フォームベースの構造化エディタ）
- `Build Text Config` タブ: JSON テキストエディタ（直接編集）
- `Speed Profiles` タブ: `SpeedProfilesEditor` コンポーネント（slow/normal/fast の数値スライダー）

保存ボタン（`Save` アイコン + ラベル）でサーバーに PUT する。

---

### DictionariesPage（/configs/dictionaries）

**機能**: VOICEVOX ユーザー辞書の管理

- 辞書エントリの一覧表示・追加・削除
- `dict-sync` コマンドで VOICEVOX Engine に同期するためのUI

---

### PipelinePage（/pipeline）

**機能**: Layer 1/2 パイプラインのステップ実行・ログ監視

> [CONSTRAINT] **実行ボタンを押さない**: LLM処理・音声合成処理を起動するため、デザイン確認のみに使用すること（CLAUDE.md の注意事項）。

**コンテキストセレクター** (`PipelineContextSelector`):
- プロジェクト ID セレクト
- Run セレクト
- エピソード ID セレクト

**タブ構成**:

| タブ | コンポーネント | 内容 |
|---|---|---|
| `layer1` | `PipelineLayer1Panel` | gen-blueprint/material/script/digest の実行ボタン |
| `layer2` | `PipelineLayer2Panel` | build-text/patch/project/audio の実行ボタン、build-all ボタン |
| `utility` | `PipelineUtilityPanel` | check-run/prepare-run/dict-sync の実行ボタン |

各ステップボタンには「コマンドをコピー」機能あり（クリップボードにCLIコマンドをコピー）。

**ログターミナル** (`LogTerminal`):
- WebSocket でリアルタイムログを表示
- stdout（白）/ stderr（黄）/ system（灰）の色分け
- コマンド実行中はステータスインジケーター表示

**VOICEVOX 接続状態**:
- ヘッダー右側にインジケーター（緑: 接続中、赤: オフライン）
- バージョン番号を表示

---

### RunsPage（/runs）

**機能**: 全 Run の一覧表示

- プロジェクト ID フィルタ（テキスト入力）
- ページネーション（20件/ページ）
- 各 Run → `RunDetailPage` へのリンク
- カラム: Project / Run ID / 作成日時

---

### RunDetailPage（/runs/:projectId/:runId）

**機能**: 特定 Run の詳細閲覧

- Run ステータス表示（ステージごとの状態バッジ）
- ファイルツリー表示
- ファイル内容プレビュー
- `voicevox_text.json` の発話テキスト・ポーズ時間インライン編集（ETag楽観的ロック）

---

## usePipelineAvailability（実行可否制御）

各パイプラインステップの実行可否を判定するフック。

```typescript
usePipelineAvailability({
  runStatus: RunStatus | undefined,
  episodeId: string,
  paths: PipelinePaths | undefined,
  isAnyStepRunning: boolean,
  voicevoxOffline: boolean,
  getSessionStatus: (stepKey: string) => StepStatus,
})
```

**判定ロジック**:

| 条件 | 影響するステップ |
|---|---|
| `isAnyStepRunning` が true | 全ステップを無効化 |
| `voicevoxOffline` が true | build-project / build-audio を無効化 |
| `episodeId` が未選択 | エピソード依存ステップを無効化 |
| 前ステップの成果物が存在しない | 依存ステップを無効化 |
| セッション内で前ステップが完了済み | 次ステップを有効化 |

---

## usePipelineJob（ジョブ管理）

パイプラインジョブの実行・WebSocket 接続を管理するフック。

```typescript
const {
  startJob,          // コマンド + 引数でジョブ開始
  startStepJob,      // ステップキーでジョブ開始
  cancel,            // ジョブキャンセル
  logs,              // ログエントリ配列
  logStatus,         // "idle" | "running" | "done" | "error"
  isJobActive,       // ジョブ実行中かどうか
  runningCommand,    // 実行中コマンド名
  apiError,          // API エラー情報
  getStepStatus,     // ステップの状態取得
  resetStatuses,     // ステップ状態リセット
} = usePipelineJob(callbacks)
```

---

## デザインファイル

| ファイル | 説明 |
|---|---|
| `design/frontend-console.pen` | Pencil デザインファイル（UI レイアウト） |
| `design/screenshots/` | 画面キャプチャ |

---

## 関連仕様

- [spec-07: API コントラクト](./07-api-contracts.md) — Web UI が使用する全 API エンドポイント
- [spec-06: Runディレクトリ](./06-run-directory.md) — RunStatus の構造
