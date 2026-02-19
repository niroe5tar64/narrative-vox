# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

Narrative Vox は技術書・記事をナレーション台本に変換し、VOICEVOX で音声データを生成するツール。2層パイプライン構成:

1. **Layer 1（LLM駆動）**: ブループリント → 素材 → 台本 → ダイジェスト（Skills: `/gen-blueprint`, `/gen-material`, `/gen-script`, `/gen-digest`）
2. **Layer 2（決定的CLI）**: `build-text` → `build-project` → `build-audio`

データは実行ディレクトリ `projects/<project-id>/run-YYYYMMDD-HHMM/` 配下のサブフォルダ（blueprint/, material/, script/, context/, voicevox_text/, voicevox_project/, audio/）を通して流れる。

## コマンド

```bash
# テスト
bun run test                    # 全テスト実行
bun test --filter "pattern"     # パターンに一致するテストのみ実行（"run" なし）

# 型チェック
bun run typecheck

# パイプラインコマンド（すべて --help でフラグ確認可能）
bun run build-text -- --script path/to/E01_script.md
bun run build-project -- --run-dir path/to/run-dir --episode-id E01
bun run build-audio -- --run-dir path/to/run-dir --episode-id E01
bun run build-all -- --script path/to/E01_script.md
bun run check-run -- --run-dir path/to/run-dir
bun run prepare-run -- --from path/to/existing-run

# VOICEVOX Engine（Docker）
bun run voicevox:up / voicevox:down / voicevox:check
```

ビルド・コンパイル不要 — Bun が TypeScript を直接実行する。リント・フォーマットは Biome（`biome.json` で設定）。

CI: `bun install --frozen-lockfile` → `bun run typecheck` → `bun test`

## アーキテクチャ

### ソース構成（`src/`）

- **`cli/`** — CLIエントリポイント（`main.ts` が7コマンドをディスパッチ）、`prepare_run.ts`、`render_prompt.ts`
- **`pipeline/`** — パイプライン各ステージ:
  - `build_text.ts` — script.md → 発話データ（voicevox_text.json + .txt + dict_candidates.csv）
  - `build_project.ts` — voicevox_text.json → .vvproj（VOICEVOX `/audio_query` を呼出）
  - `build_audio.ts` — .vvproj → WAV → MP3（VOICEVOX `/synthesis` 呼出、純TS WAV結合、ffmpeg圧縮）
  - `voicevox_engine.ts` — VOICEVOX APIクライアント（リトライ/バックオフ、URL自動検出、camelCase↔snake_case変換）
  - `build_text/` — 文分割、ポーズ計算、読み上げ適性スコア、kuromoji辞書抽出、読み辞書、成果物書き出し
  - `build_project/` — 抑揚（イントネーションスケール）、速度プロファイル
- **`shared/`** — 型定義、キャラクター/音声読込、CLI引数解析、JSON/スキーマヘルパー、台本構造解析
- **`quality/`** — `check_run.ts`（スキーマ＋構造バリデーション）、`schema_validator.ts`（AJVラッパー）

### 主要パターン

- **スキーマ駆動バリデーション**: 全データ構造に `schemas/` のJSON Schemaが対応し、AJVで各ステージごとに検証
- **キャラクター/話者解決**: 台本の `speaker_key` → キャラクターマップ（`configs/characters/`）→ VOICEVOX の engineId/speakerId/styleId。キャラクターごとの感情スタイル対応
- **台本構造**: エピソードは8セクション構成のMarkdown形式（`check-run` で検証）
- **自動推論**: 大半のCLIフラグ（run-dir, episode-id, voicevox-url）はファイルパスや環境変数から推論可能

### 設定ファイル

- `configs/characters/*.json` — キャラクター定義（音声設定含む）
- `configs/voicevox/` — 音声プロファイル、キャラクターマップ、build-text設定（ポーズ・読み上げ適性閾値）、速度プロファイル、読み辞書
- `configs/projects/*.json` — プロジェクト設定（ソースパス、エピソード数）

## 開発方針

- **後方互換は不要**: リリース前の個人開発プロダクトのため、既存データ形式・API・スキーマの後方互換を考慮する必要はない。破壊的変更は一括切替で行う。

## コミット規約

Japanese Conventional Commits 形式: `<type>: <日本語subject>`（例: `feat: 音声合成パイプラインを追加`）。type: feat, fix, refactor, docs, style, test, chore, perf。コミット時は `/commit` スキル（`git-commit-ja-prefix`）を使用する。
