# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

Narrative Vox は技術書・記事をナレーション台本に変換し、VOICEVOX で音声データを生成するツール。2層パイプライン構成:

1. **Layer 1（LLM駆動）**: ブループリント → 素材 → 台本 → ダイジェスト（Skills: `/gen-blueprint`, `/gen-material`, `/gen-script`, `/gen-digest`）
2. **Layer 2（決定的CLI）**: `build-text` → `build-project` → `build-audio`

データは実行ディレクトリ `data/projects/<project-id>/run-YYYYMMDD-HHMM/` 配下のサブフォルダ（blueprint/, material/, script/, context/, voicevox_text/, dict_candidates/, voicevox_project/, audio/）を通して流れる。

## コマンド

```bash
# テスト
bun run test                    # 全テスト実行
bun test --filter "pattern"     # パターンに一致するテストのみ実行（"run" なし）

# 型チェック
bun run typecheck

# Layer 1 コマンド（LLM駆動、Skills /gen-* の実体）
bun run gen-blueprint -- --project-id <id>
bun run gen-material -- --project-id <id> --episode-id E01 --run-dir path/to/run-dir
bun run gen-script -- --project-id <id> --episode-id E01 --run-dir path/to/run-dir
bun run gen-digest -- --project-id <id> --episode-id E01 --run-dir path/to/run-dir

# Layer 2 コマンド（決定的CLI、すべて --help でフラグ確認可能）
bun run build-text -- --script path/to/E01_script.md
bun run patch-voicevox-text -- --voicevox-text-json path/to/voicevox_text/E01_voicevox_text.json
bun run build-project -- --voicevox-text-json path/to/voicevox_text/E01_voicevox_text.json
bun run build-audio -- --vvproj path/to/voicevox_project/E01.vvproj
bun run build-all -- --script path/to/E01_script.md
bun run check-run -- --run-dir path/to/run-dir
bun run prepare-run -- --source-run-dir path/to/existing-run
bun run render-prompt -- --genre tech-explainer --step blueprint --project-config path/to/project.json --episode-id E01
bun run dict-sync -- --voicevox-url http://localhost:50021

# VOICEVOX Engine（Docker）
bun run voicevox:up / voicevox:down / voicevox:check
```

ビルド・コンパイル不要 — Bun が TypeScript を直接実行する。リント・フォーマットは Biome（`biome.json` で設定）。

CI: `bun install --frozen-lockfile` → `bun run typecheck` → `bun test`

## アーキテクチャ

### ソース構成（モノレポ）

**`apps/`** — アプリケーションエントリポイント

- **`apps/cli/`** — CLIエントリポイント（`main.ts` が9コマンドをディスパッチ）、`prepare-run.ts`、`render-prompt.ts`
- **`apps/api/`** — Bun + Hono APIサーバー（パイプライン実行・設定・ファイル操作エンドポイント）
- **`apps/web/`** — Vite + React フロントエンド

**`packages/`** — 共有ライブラリ（レイヤードアーキテクチャ）

- **`packages/application/`** — ユースケース実装（`build-text.ts` / `patch-voicevox-text.ts` / `build-project.ts` / `build-audio.ts` / `dict-sync/` と配下モジュール）
- **`packages/domain/`** — ドメイン型・ルール（話者タグ、台本構造、run-id、キャラクター定義など）
- **`packages/infrastructure/`** — 外部I/O（filesystem、JSON、schema解決、VOICEVOX APIクライアント、`schema-validator.ts`（AJVラッパー））
- **`packages/quality/`** — `check-run.ts`（スキーマ＋構造バリデーション）

### 主要パターン

- **スキーマ駆動バリデーション**: 全データ構造に `schemas/` のJSON Schemaが対応し、AJVで各ステージごとに検証
- **キャラクター/話者解決**: 台本の `speaker_key` → キャラクターマップ（`configs/content/characters/`）→ VOICEVOX の engineId/speakerId/styleId。キャラクターごとの感情スタイル対応
- **台本構造**: `check-run` では最小構造（空でないこと、セクション見出しを含むこと、speaker_modeに応じた話者タグ）を検証
- **自動推論**: 大半のCLIフラグ（run-dir, episode-id, voicevox-url）はファイルパスや環境変数から推論可能

### 設定ファイル

- `configs/content/characters/*.yaml` — キャラクター定義（音声設定含む）
- `configs/voice/voicevox/` — 音声プロファイル、キャラクターマップ、build-text設定（ポーズ・読み上げ適性閾値）、速度プロファイル、読み辞書
- `configs/pipeline/projects/*.yaml` — プロジェクト設定（ソースパス、エピソード数）

## 開発方針

- **後方互換は不要**: リリース前の個人開発プロダクトのため、既存データ形式・API・スキーマの後方互換を考慮する必要はない。破壊的変更は一括切替で行う。

## Web UI 操作上の注意

- **実行ボタンを押さない**: `http://localhost:5173` の Pipeline ページにある「実行」「再実行」ボタンは重たい LLM 処理・音声合成処理を起動するため、**絶対にクリックしない**。デザイン確認・スクリーンショット取得のみに留める。

## コミット規約

Japanese Conventional Commits 形式: `<type>: <日本語subject>`（例: `feat: 音声合成パイプラインを追加`）。type: feat, fix, refactor, docs, style, test, chore, perf。コミット時は `/commit` スキル（`git-commit-ja-prefix`）を使用する。
