---
name: gen-script
description: "Episode Variables JSON を使って台本（Markdown）を生成する。引数: [project-id] [episode-id]（例: /gen-script introducing-rescript E01）"
---

# gen-script

## 目的

Episode Variables JSON を入力として、固定構成 1〜8 の音声台本（Markdown）を LLM で生成し、構造検証済みファイルとして保存する。

## 引数

- `$0`: project-id（例: `introducing-rescript`）
- `$1`: episode-id（例: `E01`）

## 実行手順

### Step 1: project config 読み込み

1. `configs/projects/$0.json` を読み込む。
2. `GENRE` フィールドを確認する（例: `study`）。

### Step 2: Episode Variables 読み込み

1. project config の `PROJECT_BLUEPRINT_JSON_PATH` から run ディレクトリを推定する。
2. `projects/{PROJECT_ID}/{run-dir}/variables/{$1}_variables.json` を読み込む。
3. ファイルが存在しなければエラー報告して終了する。

### Step 3: プロンプト取得

1. `prompts/{GENRE}/script_common_frame.md` を読み込む。
2. このプロンプトにはプレースホルダがない（Variables JSON を直接入力として使うため）。

### Step 4: LLM 実行

1. Step 3 のプロンプト（`## Prompt` 以降）をシステムプロンプトとして使用する。
2. Episode Variables JSON 全体を入力として渡す。
3. 出力は Markdown 形式の台本。

### Step 5: 出力保存

1. 出力先: `projects/{PROJECT_ID}/{run-dir}/script/{EPISODE_ID}_script.md`
   - Variables と同じ run ディレクトリを使用する。
2. Markdown をそのまま保存する。

### Step 6: 構造検証

1. 保存した台本に対して `check-run` 相当のセクション構造検証を行う:
   - セクション 1〜8 が存在すること。
   - セクション順序が正しいこと。
2. 検証エラーがあれば報告する（ファイルは保存済み）。

### Step 7: 報告

1. 保存先パスを表示する。
2. 構造検証結果（OK / NG + 詳細）を表示する。
3. 各セクションのタイトルと概要行数を表示する。

## 注意事項

- 台本以外のメタ説明を出力に含めない。
- 固定構成 1〜8 の順序を崩さない。
- `quality_checks.blueprint_alignment` が `NG` の Variables を入力した場合、その旨を報告して生成を中断する。
- `episode_constraints.scope_guardrails` で指定された範囲外の内容を含めない。
