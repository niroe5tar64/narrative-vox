# Narrative Vox

このリポジトリは、元テキストから目的別の読み上げ原稿を生成し、最終的に VOICEVOX 向け import データへ変換するための作業リポジトリです。

## 目的

- 技術書・記事・技術資料から「耳学習」向け原稿を生成する
- 小説からオーディオブック風原稿を生成する
- 原稿から VOICEVOX 向けデータを生成する

## ディレクトリ構成

```text
.
├── prompts/
│   ├── study/       # 技術資料向けプロンプト (Stage 1-5)
│   ├── audiobook/   # 小説向けプロンプト（整備中）
│   └── shared/      # 共通ルール（整備中）
├── configs/
│   ├── books/
│   ├── novels/
│   └── voicevox/
├── inputs/
│   ├── books/
│   └── novels/
├── projects/
│   └── <book-or-novel-id>/run-YYYYMMDD-HHMM/
│       ├── stage1/
│       ├── stage2/
│       ├── stage3/
│       ├── voicevox_text/
│       ├── dict_candidates/
│       ├── voicevox_project/
│       ├── reports/
│       └── logs/
├── schemas/
├── src/
├── tests/
├── docs/
│   ├── architecture/
│   └── decisions/
└── .tmp/
```

## 現在の実装スコープ

- Stage 1: 書籍全体 Blueprint JSON 生成
- Stage 2: エピソード変数 JSON 生成
- Stage 3: 固定フレーム台本生成
- Stage 4: `script.md` から `voicevox_text.json / voicevox.txt / dict_candidates.csv` 生成
  - 辞書候補抽出は形態素解析（`kuromoji`）を優先し、利用不可時は既存トークン分割へフォールバック
  - `voicevox_text.json` の `quality_checks.speakability` に読み上げやすさ指標（score/平均文字数/長文比率/終端記号比率）を出力
- Stage 5: Stage 4 JSON から VOICEVOX import (`.vvproj`) 生成
  - `--prefill-query minimal` を指定すると `talk.audioItems[*].query` を最小値で事前埋めできる

## サンプルデータ

- 入力ソース: `inputs/books/introducing-rescript/source/`
- 参照 run（2026-02-11）:
  - `projects/introducing-rescript/run-20260211-0000/stage1/`
  - `projects/introducing-rescript/run-20260211-0000/stage2/`
  - `projects/introducing-rescript/run-20260211-0000/stage3/`
  - `projects/introducing-rescript/run-20260211-0000/voicevox_text/`
  - `projects/introducing-rescript/run-20260211-0000/dict_candidates/`
- `projects/introducing-rescript/run-20260211-0000/voicevox_project/`
- `projects/introducing-rescript/run-20260211-0000/reports/`
- Stage4 の Speakability 警告再現手順は `docs/architecture/build-text-speakability-checklist.md` を参照してください。

詳細フローは `docs/architecture/pipeline.md` を参照。
TypeScript 移行後の運用ガイドは `docs/architecture/typescript-migration.md` を参照。

## 実行コマンド（最小）

```bash
# 1) 既存 run を複製して新しい run を作る（引数不足時は対話入力）
bun run prepare-run -- \
  --source-run-dir projects/introducing-rescript/run-20260211-0000

# 2) Stage1/2/3 生成物を検証する（Stage1/2はJSON Schema、Stage3は台本形式）
bun run check-run -- \
  --run-dir projects/introducing-rescript/run-20260211-0000

# 3) script.md から VOICEVOX text を生成（run_id を明示する場合）
bun run build-text -- \
  --script projects/introducing-rescript/run-20260211-0000/stage3/E01_script.md \
  --run-id run-20260211-1234

# 4) Build Text JSON から VOICEVOX project を生成
bun run build-project -- \
  --stage4-json projects/introducing-rescript/run-20260211-0000/voicevox_text/E01_voicevox_text.json \
  --prefill-query minimal

# Build Text + Build Project を連続実行
bun run build-all -- \
  --script projects/introducing-rescript/run-20260211-0000/stage3/E01_script.md
```

- `--run-id` は任意です。
- 未指定時は `--run-dir` のパス要素に含まれる `run-YYYYMMDD-HHMM` を優先利用します。
- `--run-dir` から判定できない場合は、CLI が `run-YYYYMMDD-HHMM` を自動生成します。
- `--prefill-query` は `none`（既定）または `minimal` を指定できます。
- `bun run prepare-run` は `stage1` / `stage2` / `stage3` を新 run に複製します。
- `build-text` / `build-project` / `build-all` の `--run-dir` は任意です。
  - `build-text` / `build-all`: `--script` が `.../run-.../stage3/...` 配下なら自動推論
  - `build-project`: `--stage4-json` が `.../run-.../voicevox_text/...` 配下なら自動推論
- `prepare-run` では `--default-project-id` / `--default-source-run-dir` / `--default-run-id` で未入力時の既定値を上書きできます。

## Build Text 辞書CSVの確認観点

- 重複確認: `surface` が同一の候補は `occurrences` に集約され、重複行を出さない。
- 過検出確認: 単発かつ推定読み (`reading_inferred`) の語は `LOW` として扱い、優先度を上げすぎない。
- `priority` 判定:
  - `HIGH`: ルビ由来、または出現3回以上、または形態素由来かつ2回以上出現
  - `MEDIUM`: 形態素読みを持つ語、または2回以上出現、または信頼できる読みがある語
  - `LOW`: 上記に該当しない語（特に単発の推定読み候補）

## Build Text Speakability warning checklist

警告が出た場合の期待動作、対策、テストセットは `docs/architecture/build-text-speakability-checklist.md` に一覧化してあり、QA/開発チームは以下の順で確認できます。

| 警告 | 期待値 | 対策例 | 再現テスト |
| --- | --- | --- | --- |
| Speakability score is low | `quality_checks.speakability.score < 70` | 長文を複数の文章に分割し、`PauseConfig` の `bases` か `lengthBonus` を見直す | `E04 script` で score=60 を再現 |
| Terminal punctuation is infrequent | `terminal_punctuation_ratio < 0.65` | 句点/感嘆符などを末尾に追加し、`SpeakabilityWarningConfig.minTerminalPunctuationRatio` を上回るようにする | `E01/E02 script` で 0.5/0.467 の比率を確認 |
| Long utterance ratio is high | `long_utterance_ratio > 0.25` | `splitIntoSentences` の `maxCharsPerSentence` 制御点を引き締め、`collectPreferredSplitPoints` を再考する | `E04 script` で 44% の長文率を再現 |

チェックリストには上記の期待動作に加えて CSV ヘッダー確認や `SpeakabilityWarningConfig` しきい値の説明も含まれているので、QA は実行ごとに同ドキュメントを参照してください。Phase5 では `docs/phase5-speakability-guidance.md` を使って警告ごとの期待値・対策・再現コマンド・必要ドキュメントリンクを整理し、報告とドキュメント更新のアクションを確認します。

再現ログを確認するには、`projects/introducing-rescript/run-20260211-0000/voicevox_text/` 以下の `*_voicevox_text.json` を開いて `quality_checks.speakability` に記録された値（例: `E04` では `score=60`、`long_utterance_ratio=0.444`、`terminal_punctuation_ratio=0`）と `quality_checks.warnings` の警告メッセージをチェックします。また `dict_candidates/E04_dict_candidates.csv` では `DictionaryCsvField` に則ったヘッダーと `occurrences` の集約を確認できます。`SpeakabilityWarningConfig` のしきい値（scoreThreshold=70、minTerminalPunctuationRatio=0.65、maxLongUtteranceRatio=0.25）は `src/pipeline/build_text.ts` に定義されており、このドキュメント群と `docs/phase5-speakability-guidance.md` を併用することで Phase5 での報告と対策を相互補完できます。
