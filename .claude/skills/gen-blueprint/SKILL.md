---
name: gen-blueprint
description: "project config を使って Blueprint（全体設計JSON）を生成する。引数: [project-id]（例: /gen-blueprint introducing-rescript）"
---

# gen-blueprint

## 目的

project config と参照ソースを入力として、書籍全体の設計図（Blueprint JSON）を LLM で生成し、バリデーション済みファイルとして保存する。

## 実行手順

### Step 1: project config 読み込み

1. `configs/projects/$ARGUMENTS.json` を読み込む。
2. `GENRE` フィールドを確認する（例: `study`）。

### Step 2: プロンプト解決

1. `prompts/{GENRE}/blueprint.md` を読み込む。
2. `## Prompt` セクション以降のプレースホルダ `{{KEY}}` を project config の値で置換する。
3. ````json` コードブロック内のプレースホルダは置換しない（出力形式の例示のため）。
4. 未解決プレースホルダが残っていればエラー報告して終了する。

### Step 3: ソースマテリアル読み込み

1. project config の `SOURCE_MARKDOWN_PATHS` のグロブパターンでファイルを取得する。
2. 各ファイルの内容を添付コンテキストとして提供する。

### Step 4: LLM 実行

1. Step 2 で解決済みの `## Prompt` 以降をシステムプロンプトとして使用する。
2. Step 3 のソースを入力として渡す。
3. 出力は JSON のみ。

### Step 5: 出力保存

1. 出力先: `projects/{PROJECT_ID}/run-YYYYMMDD-HHMM/blueprint/project_blueprint.json`
   - `run-YYYYMMDD-HHMM` は現在日時で新規作成する。
   - 既存の run ディレクトリを上書きしない。
2. JSON をフォーマットして保存する。

### Step 6: バリデーション

1. `schemas/blueprint.schema.json` で JSON Schema バリデーションを実行する。
2. バリデーションエラーがあれば報告する（ファイルは保存済み）。

### Step 7: 報告

1. 保存先パスを表示する。
2. バリデーション結果（OK / NG + 詳細）を表示する。
3. `quality_checks` の内容を要約する。

## 注意事項

- JSON 以外の出力（説明文やマークダウン）を生成しない。
- `{{EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY}}` が空文字の場合、`continuity_plan` は `N/A` 扱いとする。
- ソースファイルが見つからない場合はエラー報告して終了する。
