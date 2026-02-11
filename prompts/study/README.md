# Study Prompt Guide

技術書・記事・技術資料を音声学習向け台本に変換するための運用ガイドです。

## ファイル

- `prompts/study/stage1_blueprint.md`
- `prompts/study/stage2_episode_variables.md`
- `prompts/study/stage3_script_common_frame.md`
- `prompts/study/stage4_voicevox_text.md`
- `prompts/study/stage5_voicevox_import.md`
- `configs/books/<book-id>.json`

## 実行順

1. Stage 1
- 入力: `stage1_blueprint.md` + `configs/books/<book-id>.json`
- 出力: `projects/<book-id>/run-YYYYMMDD-HHMM/stage1/book_blueprint.json`

2. Stage 2
- 入力: `stage2_episode_variables.md` + Stage 1 出力 + `EPISODE_ID`
- 出力: `projects/<book-id>/run-YYYYMMDD-HHMM/stage2/E##_variables.json`

3. Stage 3
- 入力: `stage3_script_common_frame.md` + Stage 2 出力
- 出力: `projects/<book-id>/run-YYYYMMDD-HHMM/stage3/E##_script.md`

4. Stage 4 (script -> voicevox text)
- 入力: `stage3/E##_script.md`
- 出力: `stage4/E##_voicevox_text.json`
- 出力: `stage4/E##_voicevox.txt`
- 出力: `stage4_dict/E##_dict_candidates.csv`

5. Stage 5 (voicevox text -> import)
- 入力: `stage4/E##_voicevox_text.json` + `configs/voicevox/default_profile.json`（ローカル）または `configs/voicevox/default_profile.example.json`
- 出力: `stage5/E##_voicevox_import.json`
- 出力: `stage5/E##.vvproj`

6. 品質確認
- 出力: `projects/<book-id>/run-YYYYMMDD-HHMM/reports/quality_gate_report.md`

## 補助指示

各Stageの末尾に以下を付けると安定します。

`上記Prompt内の {{PLACEHOLDER}} は、添付したbook-config JSONの同名キーで解決してから実行してください。`

Stage 2で回を切り替える場合は以下を追加します。

`今回は EPISODE_ID=E02 として実行してください。`

## 必須キー（book config）

- `BOOK_ID`
- `BOOK_TITLE`
- `SOURCE_MARKDOWN_PATHS`
- `AUDIENCE_BACKGROUND`
- `AUDIENCE_LEVEL`
- `AUDIENCE_INTEREST`
- `BASELINE_CONTEXT_OR_EMPTY`
- `EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY`
- `BOOK_BLUEPRINT_JSON_PATH`
- `EPISODE_ID`

## CLI 実行例（Stage4/5）

```bash
bun run build-all -- \
  --script projects/introducing-rescript/run-20260211-0000/stage3/E01_script.md \
  --run-dir projects/introducing-rescript/run-20260211-0000
```
