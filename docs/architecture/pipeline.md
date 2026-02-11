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
