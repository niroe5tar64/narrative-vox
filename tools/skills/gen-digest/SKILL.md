---
name: gen-digest
description: "台本生成後にエピソード間一貫性のためのダイジェストJSONを生成する。引数: [project-id] [episode-id]（例: /gen-digest introducing-rescript E01）"
---

# gen-digest

## 目的

台本生成後に、エピソード間一貫性のための軽量な中間表現（Episode Digest JSON）を LLM で生成する。後続エピソードが全台本を読まずに一貫性を保てるようにする。

## 引数

- `$0`: project-id（例: `introducing-rescript`）
- `$1`: episode-id（例: `E01`）

## 実行手順

### Step 1: project config 読み込み

1. `configs/pipeline/projects/$0.json` を読み込む。
2. `GENRE_ID`, `STYLE_ID`, `CAST` フィールドを取得する。
3. `EPISODE_ID` を `$1` で上書きする。

### Step 2: 台本読み込み

1. project config の `PROJECT_BLUEPRINT_JSON_PATH` から run ディレクトリを推定する。
2. `data/projects/{PROJECT_ID}/{run-dir}/script/{$1}_script.md` を読み込む。
3. ファイルが存在しなければエラー報告して終了する。

### Step 3: Material 読み込み

1. `data/projects/{PROJECT_ID}/{run-dir}/material/{$1}_material.json` を読み込む。
2. ファイルが存在しなければエラー報告して終了する。

### Step 4: Blueprint 読み込み

1. project config の `PROJECT_BLUEPRINT_JSON_PATH` から Blueprint JSON を読み込む。
2. `episode_plan` で現エピソードの位置を確認する（narrative_position 判定用）。

### Step 5: キャラクター読み込み

1. `CAST` の各 character_key に対して `configs/content/characters/{key}.json` を読み込む。
2. `profile.sentence_patterns.catchphrases` を取得する（使用実績の追跡用）。

### Step 6: LLM 実行

1. 台本、Material、Blueprint、キャラクタープロファイルを入力として LLM に渡す。
2. 出力は `episode-digest.schema.json` に準拠する JSON。
3. 各フィールドの導出指示:

#### content_summary
- `core_topics_covered`: 台本 + material.sections[].section からトピックラベルを抽出（3〜7個）
- `key_conclusions`: 台本から主要な結論を一文で抽出（1〜5個）
- `terms_introduced`: material.elements[].technical_terms + 台本で初出の用語
- `examples_used`: 台本内の具体例をラベル化（最大5個）
- `scope_boundaries_stated`: material.elements[type=scope_boundary].content

#### character_behavior（CAST の各メンバーについて）
- `character_key`: CAST のキー
- `utterance_count`: 台本の `[speaker:key]` タグをカウント
- `catchphrases_used`: character.profile.sentence_patterns.catchphrases のうち台本で実際に使用されたもの
- `emotion_moments`: 台本で感情変化が見られる箇所（{emotion, context}）
- `notable_speech_patterns`: 台本で顕著だった speech_patterns

#### continuity
- `narrative_position`: blueprint.episode_plan の位置から判定:
  - 最初のエピソード → `series_start`
  - 全体の前半 25% → `early`
  - 全体の 25-75% → `middle`
  - 全体の後半 25% → `late`
  - 最後のエピソード → `finale`
- `open_threads`: 台本 + material から「次回以降で扱う」旨の言及（{thread, promised_in, target_episode?}）
- `resolved_threads`: 先行ダイジェストの open_threads のうち本エピソードで回収したもの
- `listener_knowledge_state`: 本エピソードまでにリスナーが理解した概念の累積リスト（最大15個）

### Step 7: 出力保存

1. 出力先: `data/projects/{PROJECT_ID}/{run-dir}/context/{EPISODE_ID}_episode_digest.json`
   - context ディレクトリが存在しない場合は作成する。
2. JSON をフォーマットして保存する。

### Step 8: バリデーション

1. `schemas/episode-digest.schema.json` で JSON Schema バリデーションを実行する。
2. `episode_id` がファイル名の E## と一致することを確認する。
3. バリデーションエラーがあれば報告する（ファイルは保存済み）。

### Step 9: 報告

1. 保存先パスを表示する。
2. バリデーション結果（OK / NG + 詳細）を表示する。
3. 要約:
   - トピック数、用語数、例の数
   - キャラクター別発話数
   - narrative_position
   - open_threads 数

## 消費ルール（後続エピソードの gen-script プロンプトに注入）

1. `terms_introduced` の用語 → 再定義しない
2. `examples_used` の例 → 再利用しない（新しい例を考案）
3. `open_threads` で `target_episode` が現エピソードのもの → 回収する
4. `catchphrases_used` → 使用頻度を分散させる
5. `listener_knowledge_state` → 前提知識として扱う（再説明しない）
6. `scope_boundaries_stated` → 現エピソードの material に該当すれば自然に接続

## 注意事項

- JSON 以外の出力（説明文やマークダウン）を生成しない。
- `EPISODE_ID` は必ず引数 `$1` の値を使用する。
- gen-digest は gen-script 完了後に手動で実行する別ステップ。
- E01 には先行ダイジェストがないため、resolved_threads は空配列になる。
