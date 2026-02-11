# Stage 5: VOICEVOX Text to Import File

目的: Stage 4 JSON を VOICEVOX import 可能な `.vvproj` 形式へ変換する。

## 入力

- `stage4/E##_voicevox_text.json`
- `configs/voicevox/default_profile.json`（ローカル）または `configs/voicevox/default_profile.example.json`

## 出力

- `stage5/E##_voicevox_import.json`
- `stage5/E##.vvproj`
  - スキーマ: `schemas/stage5.voicevox-import.schema.json`

## 変換ルール

1. `utterances[]` を `talk.audioItems` にマッピングする。
2. `audioKeys` は `E##_U###` 形式で連番化する。
3. `voice.engineId/speakerId/styleId` は profile を適用する。
4. `song` は空トラック構成で最小値を埋める。
5. `--prefill-query minimal` 指定時は `talk.audioItems[*].query` を profile の `queryDefaults`（未指定時は組み込み既定値）で事前埋めする。

## 実行

```bash
bun run build-project -- \
  --stage4-json projects/<id>/run-YYYYMMDD-HHMM/stage4/E01_voicevox_text.json \
  --run-dir projects/<id>/run-YYYYMMDD-HHMM \
  --prefill-query minimal
```
