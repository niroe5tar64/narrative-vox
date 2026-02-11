# Stage 4: Script to VOICEVOX Text

目的: Stage 3 の台本 (`E##_script.md`) を、VOICEVOX取り込み前処理向けに正規化する。

## 入力

- `stage3/E##_script.md`

## 出力

- `stage4/E##_voicevox_text.json`
  - スキーマ: `schemas/stage4.voicevox-text.schema.json`
- `stage4/E##_voicevox.txt`
- `stage4_dict/E##_dict_candidates.csv`

## 変換ルール（最小）

1. 固定構成見出し (`1.` 〜 `8.`) を認識する。
2. 本文を短文へ分割し、`utterances[]` を生成する。
3. `合計想定時間` 行は除外する。
4. インラインコード記法 (`` `...` ``) を平文化する。
5. ルビ記法 (`{漢字|よみ}`) は読みへ置換する。
6. 用語候補を抽出し、辞書候補としてCSVへ出力する。

## 実行

```bash
bun run build-text -- \
  --script projects/<id>/run-YYYYMMDD-HHMM/stage3/E01_script.md \
  --run-dir projects/<id>/run-YYYYMMDD-HHMM
```
