# Pipeline Architecture

## Goal

入力テキストから音声原稿を生成し、最終的に VOICEVOX import に接続できる形へ段階変換する。

## Stages

1. Stage 1: Book Blueprint
- Input: source markdown + book config
- Output: `stage1/book_blueprint.json`

2. Stage 2: Episode Variables
- Input: blueprint + episode id + optional overrides
- Output: `stage2/E##_variables.json`

3. Stage 3: Script
- Input: Stage 2 JSON
- Output: `stage3/E##_script.md`

4. Stage 4: VOICEVOX Text
- Input: script
- Output: `stage4/E##_voicevox_text.json`
- Output: `stage4/E##_voicevox.txt`
- Output: `stage4_dict/E##_dict_candidates.csv`

5. Stage 5: VOICEVOX Import
- Input: `stage4/E##_voicevox_text.json` + voice profile
- Output: `stage5/E##_voicevox_import.json`
- Output: `stage5/E##.vvproj`

## Data Layout

- Sources: `inputs/books/*/source/*`
- Runs: `projects/<id>/run-YYYYMMDD-HHMM/*`
- Prompt assets: `prompts/*`
- Config: `configs/*`
- Schemas: `schemas/*`

## Current status (2026-02-11)

- Stage 1-3 prompt/サンプルは配置済み
- Stage 4/5 は最小実装済み（CLI: `src/cli/main.ts`）

## Stage4 Speakability warning guidance

- `src/pipeline/build_text/text_processing.ts` と `src/pipeline/build_text.ts` で定義した `SpeakabilityConfig`/`SpeakabilityWarningConfig` は、スクリプトの実行結果として `quality_checks.speakability` を計算し、あらかじめ定義したしきい値を超えた場合に `warnings` にメッセージを追加します。  
  - `scoreThreshold = 70`：平均文字数や長文率／終端句読点比率を組み合わせたスコアが 70 未満だと「Speakability score is low」警告が出ます。E04 スクリプト（`run-20260211-1111`）では `score=60` となり、この警告と併せて長文率警告も出ています。
  - `minTerminalPunctuationRatio = 0.65`：終端句読点付き utterance が全体の 65% 未満だと「Terminal punctuation is infrequent」警告が入りました（E01 と E02 では 0.5 / 0.467、E04 では 0%）。  
  - `maxLongUtteranceRatio = 0.25`：1 文あたり 49 文字超の utterance 数が 25% を超えると「Long utterance ratio is high」警告が出ます（E04 では 44.4%）。必要なら `splitIntoSentences` で 48 字以上の区切りを意図的に作るスクリプトを追加してこの警告を再現してください。

上記警告はすべて同時に出ることがあり、ドキュメント化した新しいスクリプト（E01/E02/E04）を Stage4 実行の例として共有しています。Phase5 ではこのドキュメントを元に、警告が出る条件と対策を README や docs にまとめたチェックリストを作成する予定です。

## Stage4 Speakability warning guidance

- `src/pipeline/build_text/text_processing.ts` と `src/pipeline/build_text.ts` で定義した `SpeakabilityConfig`/`SpeakabilityWarningConfig` は、スクリプトの実行結果として `quality_checks.speakability` を計算し、あらかじめ定義したしきい値を超えた場合に `warnings` にメッセージを追加します。  
  - `scoreThreshold = 70`：平均文字数や長文率／終端句読点比率を組み合わせたスコアが 70 未満だと「Speakability score is low」警告が出ます。E04 スクリプト（`run-20260211-1111`）では `score=60` となり、この警告と併せて長文率警告も出ています。
  - `minTerminalPunctuationRatio = 0.65`：終端句読点付き utterance が全体の 65% 未満だと「Terminal punctuation is infrequent」警告が入りました（E01 と E02 では 0.5 / 0.467、E04 では 0%）。  
  - `maxLongUtteranceRatio = 0.25`：1 文あたり 49 文字超の utterance 数が 25% を超えると「Long utterance ratio is high」警告が出ます（E04 では 44.4%）。必要なら `splitIntoSentences` で 48 字以上の区切りを意図的に作るスクリプトを追加してこの警告を再現してください。

上記警告はすべて同時に出ることがあり、ドキュメント化した新しいスクリプト（E01/E02/E04）を Stage4 実行の例として共有しています。Phase5 ではこのドキュメントを元に、警告が出る条件と対策を README や docs にまとめたチェックリストを作成する予定です。
