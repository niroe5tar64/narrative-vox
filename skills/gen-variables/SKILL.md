---
name: gen-variables
description: "Blueprint と book config を使って Episode Variables（エピソード変数JSON）を生成する。引数: [book-id] [episode-id]（例: /gen-variables introducing-rescript E01）"
---

# gen-variables

## 目的

Blueprint JSON と book config を入力として、指定エピソードの可変データ定義（Episode Variables JSON）を LLM で生成し、バリデーション済みファイルとして保存する。

## 引数

- `$0`: book-id（例: `introducing-rescript`）
- `$1`: episode-id（例: `E01`）

## 実行手順

### Step 1: book config 読み込み

1. `configs/books/$0.json` を読み込む。
2. `GENRE` フィールドを確認する（例: `study`）。
3. `EPISODE_ID` を `$1` で上書きする。

### Step 2: Blueprint 読み込み

1. book config の `BOOK_BLUEPRINT_JSON_PATH` から Blueprint JSON を読み込む。
2. Blueprint の `episode_plan` に `$1` が存在することを確認する。存在しなければエラー報告して終了する。

### Step 3: プロンプト解決

1. `prompts/{GENRE}/episode_variables.md` を読み込む。
2. `## Prompt` セクション以降のプレースホルダ `{{KEY}}` を book config の値（EPISODE_ID は上書き済み）で置換する。
3. ````json` コードブロック内のプレースホルダは置換しない。
4. 未解決プレースホルダが残っていればエラー報告して終了する。

### Step 4: LLM 実行

1. Step 3 で解決済みの `## Prompt` 以降をシステムプロンプトとして使用する。
2. Blueprint JSON 全体を添付コンテキストとして提供する。
3. `SOURCE_MARKDOWN_PATHS` のグロブパターンでソースファイルも添付する。
4. 出力は JSON のみ。

### Step 5: 出力保存

1. 出力先: `projects/{BOOK_ID}/{run-dir}/variables/{EPISODE_ID}_variables.json`
   - Blueprint と同じ run ディレクトリを使用する（`BOOK_BLUEPRINT_JSON_PATH` からパスを推定）。
   - run ディレクトリが存在しない場合は作成する。
2. JSON をフォーマットして保存する。

### Step 6: バリデーション

1. `schemas/episode-variables.schema.json` で JSON Schema バリデーションを実行する。
2. バリデーションエラーがあれば報告する（ファイルは保存済み）。

### Step 7: 報告

1. 保存先パスを表示する。
2. バリデーション結果（OK / NG + 詳細）を表示する。
3. `quality_checks` と `continuity_checks` の内容を要約する。

## 注意事項

- JSON 以外の出力（説明文やマークダウン）を生成しない。
- `EPISODE_ID` は必ず引数 `$1` の値を使用する。book config の値は無視する。
- Blueprint に存在しないエピソード ID を指定された場合はエラーで終了する。
