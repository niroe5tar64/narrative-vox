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
- Output: `voicevox_text/E##_voicevox_text.json`
- Output: `voicevox_text/E##_voicevox.txt`
- Output: `dict_candidates/E##_dict_candidates.csv`

5. Stage 5: VOICEVOX Import
- Input: `voicevox_text/E##_voicevox_text.json` + voice profile
- Output: `voicevox_project/E##_voicevox_import.json`
- Output: `voicevox_project/E##.vvproj`

## Data Layout

- Sources: `inputs/books/*/source/*`
- Runs: `projects/<id>/run-YYYYMMDD-HHMM/*`
- Prompt assets: `prompts/*`
- Config: `configs/*`
- Schemas: `schemas/*`

## Current status (2026-02-11)

- Stage 1-3 prompt/サンプルは配置済み
- Build Text / Build Project は最小実装済み（CLI: `src/cli/main.ts`）

## Build Text Speakability warning guidance

- `src/pipeline/build_text/text_processing.ts` と `src/pipeline/build_text.ts` で定義した `SpeakabilityConfig`/`SpeakabilityWarningConfig` は、スクリプトの実行結果として `quality_checks.speakability` を計算し、あらかじめ定義したしきい値を超えた場合に `warnings` にメッセージを追加します。  
  - `scoreThreshold = 70`：平均文字数や長文率／終端句読点比率を組み合わせたスコアが 70 未満だと「Speakability score is low」警告が出ます。再現用 `E04_script.md`（`run-20260211-1111`）では `score=60` で、長文率警告も同時に出ます。
  - `minTerminalPunctuationRatio = 0.65`：終端句読点付き utterance が全体の 65% 未満だと「Terminal punctuation is infrequent」警告が出ます。再現用 `E01` と `E02` は 0.5 / 0.467、`E04` は 0% です。  
  - `maxLongUtteranceRatio = 0.25`：1 文あたり 49 文字超の utterance 数が 25% を超えると「Long utterance ratio is high」警告が出ます。再現用 `E04` は 44.4% です。必要なら `splitIntoSentences` で 48 字以上の区切りを意図的に作るスクリプトを追加して再現してください。

上記警告はすべて同時に出ることがあり、ドキュメント化した再現スクリプト（E01/E02/E04）を Build Text 実行例として共有しています。`projects/introducing-rescript/run-20260211-0000/voicevox_text/` は 2026-02-12 再生成時点で警告 0 件の健全系サンプルです。Phase5 ではこのドキュメントを元に、警告が出る条件と対策を README や docs にまとめたチェックリストを作成する予定です。
