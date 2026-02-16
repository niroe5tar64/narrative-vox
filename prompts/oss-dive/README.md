# OSS Dive Prompt Guide

OSSリポジトリのソースコードを解析し、テーマを絞って深掘りした音声コンテンツ用台本を生成するためのガイドです。

## study との違い

| 項目 | study | oss-dive |
|---|---|---|
| 入力ソース | Markdownファイル (`SOURCE_MARKDOWN_PATHS`) | リポジトリ全体 (`REPO_ROOT_PATH`) |
| 分析対象 | 書籍の章・節 | ディレクトリ・モジュール・ファイル |
| テーマ指定 | 書籍構成に従う | `DEEP_DIVE_FOCUS` で方向性を指定 |
| コード読み | 不要 | Blueprint/Variables生成時にClaudeがリポジトリを直接探索 |

## ファイル

- `prompts/oss-dive/blueprint.md`
- `prompts/oss-dive/episode_variables.md`
- `prompts/oss-dive/script_common_frame.md`
- `configs/projects/<project-id>.json`
- `configs/projects/oss-dive.example.json`

## 準備

1. 対象リポジトリを `inputs/repos/` に clone する:

```bash
git clone https://github.com/owner/repo.git inputs/repos/repo-name
```

2. `configs/projects/oss-dive.example.json` をコピーして project config を作成:

```bash
cp configs/projects/oss-dive.example.json configs/projects/my-oss-project.json
```

3. config の `REPO_ROOT_PATH` / `DEEP_DIVE_FOCUS` / `PROJECT_ID` 等を編集する。

## 実行順

1. Blueprint
- 入力: `blueprint.md` + `configs/projects/<project-id>.json`
- Claudeが `REPO_ROOT_PATH` を探索してリポジトリ全体像を把握
- 出力: `projects/<project-id>/run-YYYYMMDD-HHMM/blueprint/project_blueprint.json`

2. Episode Variables
- 入力: `episode_variables.md` + Blueprint 出力 + `EPISODE_ID`
- Claudeが `source_refs` のファイルパスから実際のコードを読む
- 出力: `projects/<project-id>/run-YYYYMMDD-HHMM/variables/E##_variables.json`

3. Script
- 入力: `script_common_frame.md` + Episode Variables 出力
- 出力: `projects/<project-id>/run-YYYYMMDD-HHMM/script/E##_script.md`

4. Build Text / Build Project / Build Audio
- study と同じパイプライン（ジャンル非依存）

## 必須キー（project config）

- `PROJECT_ID`
- `GENRE` — `"oss-dive"`
- `PROJECT_TITLE`
- `REPO_ROOT_PATH` — clone先パス（例: `inputs/repos/my-project`）
- `DEEP_DIVE_FOCUS` — 深掘りの方向性
- `AUDIENCE_BACKGROUND`
- `AUDIENCE_LEVEL`
- `AUDIENCE_INTEREST`
- `BASELINE_CONTEXT_OR_EMPTY`
- `EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY`
- `PROJECT_BLUEPRINT_JSON_PATH`
- `EPISODE_ID`

## Skills 実行例

```text
/gen-blueprint my-oss-project
/gen-variables my-oss-project E01
/gen-script my-oss-project E01
```

## CLI 実行例

```bash
# Prompt解決（Blueprint）
bun src/cli/main.ts render-prompt -- \
  --genre oss-dive \
  --step blueprint \
  --project-config configs/projects/my-oss-project.json

# Build Text + Build Project
bun run build-all -- \
  --script projects/my-oss-project/run-20260217-0000/script/E01_script.md \
  --run-dir projects/my-oss-project/run-20260217-0000
```

## DEEP_DIVE_FOCUS の例

- `"アーキテクチャと設計思想"` — 全体構造、モジュール分割、依存関係
- `"エラーハンドリング戦略"` — エラー型、リカバリ、ユーザーへの伝達
- `"プラグインシステムの実装"` — 拡張ポイント、プラグインAPI、ライフサイクル
- `"パフォーマンス最適化"` — キャッシュ戦略、遅延評価、バッチ処理
- `"型システムの活用"` — 型レベルの制約、ジェネリクス、型安全なAPI設計
