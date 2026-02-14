# Stage 5: VOICEVOX Text to Import File

目的: Stage 4 JSON を VOICEVOX import 可能な `.vvproj` 形式へ変換する。

## 入力

- `voicevox_text/E##_voicevox_text.json`
- `configs/voicevox/default_profile.json`（ローカル）または `configs/voicevox/default_profile.example.json`

## 出力

- `voicevox_project/E##_voicevox_import.json`
- `voicevox_project/E##.vvproj`
  - スキーマ: `schemas/stage5.voicevox-import.schema.json`

## 変換ルール

1. `utterances[]` を `talk.audioItems` にマッピングする。
2. `audioKeys` は `E##_U###` 形式で連番化する。
3. `voice.engineId/speakerId/styleId` は profile を適用する。
4. `song` は空トラック構成で最小値を埋める。
5. `--prefill-query minimal` 指定時は `talk.audioItems[*].query` を profile の `queryDefaults`（未指定時は組み込み既定値）で事前埋めし、`postPhonemeLength` は Stage4 `pause_length_ms` を秒換算して反映する。
6. `--prefill-query engine` 指定時は VOICEVOX Engine `/audio_query` で `accentPhrases` を生成し、profile の `queryDefaults` と Stage4 `pause_length_ms` を重ねて `query` を出力する（`--voicevox-url` 未指定時は `http://127.0.0.1:50021`）。

## 実行

```bash
bun run build-project -- \
  --stage4-json projects/<id>/run-YYYYMMDD-HHMM/voicevox_text/E01_voicevox_text.json \
  --prefill-query engine
```

- `--run-dir` は任意（`--stage4-json` が `.../run-.../voicevox_text/...` 配下なら自動推論）。
