---
name: gen-script
description: "Material + Style + Cast + Characters + Digests を使って台本（Markdown）を生成する。引数: [project-id] [episode-id]（例: /gen-script introducing-rescript E01）"
---

# gen-script

## 目的

Episode Material JSON、コンテンツスタイル、キャスト、キャラクタープロファイル、先行ダイジェストを入力として、音声台本（Markdown）を LLM で生成し、最低限の構造検証済みファイルとして保存する。

演出層は「どう語るか」を決定する。セクション構成はスタイルと素材に基づき自由に決定する（固定8セクションではない）。

## 引数

- `$0`: project-id（例: `introducing-rescript`）
- `$1`: episode-id（例: `E01`）

## 実行手順

### Step 1: project config 読み込み

1. `configs/projects/$0.json` を読み込む。
2. `GENRE_ID`, `STYLE_ID`, `CAST` フィールドを取得する。
3. `EPISODE_ID` を `$1` で上書きする。

### Step 2: Material 読み込み

1. project config の `PROJECT_BLUEPRINT_JSON_PATH` から run ディレクトリを推定する。
2. `projects/{PROJECT_ID}/{run-dir}/material/{$1}_material.json` を読み込む。
3. ファイルが存在しなければエラー報告して終了する。

### Step 3: スタイル読み込み

1. `configs/styles/{STYLE_ID}.json` を読み込む。
2. `format.speaker_roles` と `CAST` のキーが一致することを検証する。
3. 不一致があればエラー報告して終了する。

### Step 4: キャラクター読み込み

1. `CAST` の各 character_key に対して `configs/characters/{key}.json` を読み込む。
2. ファイルが存在しなければエラー報告して終了する。
3. 各キャラクターの `profile` フィールドを取得する。

### Step 5: 先行ダイジェスト読み込み

1. `projects/{PROJECT_ID}/{run-dir}/context/` ディレクトリ内の `E{01..N-1}_episode_digest.json` を全て読み込む（N = 現エピソード番号）。
2. 存在するもののみ読み込む（E01 には先行ダイジェストがない）。

### Step 6: プロンプト構築

1. `prompts/{GENRE_ID}/script_common_frame.md` を読み込む。
2. LLM に以下の情報を構造化して渡す:
   - **Material**: Episode Material JSON 全体
   - **Style**: コンテンツスタイル JSON 全体
   - **Characters**: CAST の各キャラクターのプロファイル
   - **Digests**: 先行ダイジェスト（存在する場合）
3. 衝突ルール（キャラクター > スタイル）を明示指示する:
   - キャラクターの `speech_register` はスタイルの `language.formality` より優先
   - キャラクターの `forbidden_patterns` は常に適用
   - キャラクターの `personality_traits` はスタイルの要求と矛盾してもキャラクター性を維持
   - キャラクターの `filler_words` のみ使用（スタイルのリアクション設定に関わらず）

### Step 7: LLM 実行

1. Step 6 で構築したプロンプトをシステムプロンプトとして使用する。
2. 出力は Markdown 形式の台本。
3. セクション構成ルール:
   - セクション見出し: `## N. セクションタイトル` (N = 1, 2, 3, ...)
   - 話者タグ: `[speaker:character_key]`（dialogue/panel モードの場合）
   - セクション数はスタイルの `segment_structure` と素材の `sections` に基づき自由に決定
   - Material の `importance: "must"` 要素は全て台本に含める
   - Material の `importance: "should"` 要素は時間に余裕があれば含める
   - Material の `importance: "optional"` 要素は演出判断で省略可
   - `depends_on` の順序制約を尊重する
4. ダイジェスト消費ルール（先行ダイジェストがある場合）:
   - `terms_introduced` の用語は再定義しない
   - `examples_used` の例は再利用しない
   - `open_threads` で `target_episode` が現エピソードのものは回収する
   - `catchphrases_used` の使用頻度を分散させる
   - `listener_knowledge_state` を前提知識として扱う

### Step 8: 出力保存

1. 出力先: `projects/{PROJECT_ID}/{run-dir}/script/{EPISODE_ID}_script.md`
   - Material と同じ run ディレクトリを使用する。
2. Markdown をそのまま保存する。

### Step 9: 最低限構造検証

1. 保存した台本に対して最低限の構造検証を行う:
   - ファイルが空でないこと
   - Markdown 見出し（`## N.` 形式）が 1 つ以上あること
   - dialogue/panel モードの場合、`[speaker:xxx]` タグが 1 つ以上あること
2. セクション数・順序・内容は検証しない（演出層の自由裁量）。

### Step 10: 報告

1. 保存先パスを表示する。
2. 構造検証結果（OK / NG + 詳細）を表示する。
3. 各セクションのタイトルと概要行数を表示する。

## 注意事項

- 台本以外のメタ説明を出力に含めない。
- セクション数は固定 8 ではない。スタイルと素材に基づき自由に構成する。
- `scope_guardrails` で指定された範囲外の内容を含めない。
- キャラクターの `forbidden_patterns` に含まれる表現は台本に使用しない。
