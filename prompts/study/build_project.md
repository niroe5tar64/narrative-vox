# Build Project: VOICEVOX Text to Import File

目的: Build Text JSON を VOICEVOX import 可能な `.vvproj` 形式へ変換する。

## 入力

- `voicevox_text/E##_voicevox_text.json`
- `configs/voicevox/default_profile.json`（ローカル）または `configs/voicevox/default_profile.example.json`

## 出力

- `voicevox_project/E##_voicevox_import.json`
- `voicevox_project/E##.vvproj`
  - スキーマ: `schemas/voicevox-import.schema.json`

## 変換ルール

1. `utterances[]` を `talk.audioItems` にマッピングする。
2. `audioKeys` は `E##_U###` 形式で連番化する。
3. `voice.engineId/speakerId/styleId` は次の優先順で決定する。
   - `--character-key` 指定時: 対応する `character map` エントリ
   - `utterances[*].speaker_key` がある場合: 対応する `character map` エントリ
   - `--emotion` 指定時: `character map` の `emotionStyles[character_key][emotion]` で `styleId` を上書き
   - どちらもない場合: profile の voice
   - `speaker_key` または `--character-key` を使う場合、`character map` が未設定だとエラー
   - `--style-id` 指定時は emotion より優先して最終上書き
4. `song` は空トラック構成で最小値を埋める。
5. VOICEVOX Engine `/audio_query` で `accentPhrases` を含む `query` を生成し、profile の `queryDefaults` を適用する。
6. `--speed-preset` 指定時は `speed_profiles` の値で `speedScale/pauseLengthScale/postPhonemeLength` を上書きする。
7. 最後に Build Text `pause_length_ms` を秒換算して `postPhonemeLength` の下限を保証する（`--voicevox-url` 未指定時は自動解決）。

## 実行

```bash
bun run build-project -- \
  --voicevox-text-json projects/<id>/run-YYYYMMDD-HHMM/voicevox_text/E01_voicevox_text.json
```

- `--run-dir` は任意（`--voicevox-text-json` が `.../run-.../voicevox_text/...` 配下なら自動推論）。
