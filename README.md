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
│       ├── audio/
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
  - `--prefill-query minimal` を指定すると `talk.audioItems[*].query` を最小値で事前埋めできる（`postPhonemeLength` は `utterances[*].pause_length_ms` を秒換算して反映）
  - `--prefill-query engine` を指定すると VOICEVOX Engine `/audio_query` から `accentPhrases` を含む `query` を生成し、profile 既定値を重ねて出力する
- Stage 6: Stage 5 `.vvproj` から VOICEVOX Engine API で WAV を自動生成
  - `audio/E##.wav` を出力（utteranceを連結した単一ファイル）
  - `audio/manifest.json` に voice 設定・出力先・実行結果を保存

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

## テスト実行方針

- テスト実行コマンドは `bun run test`（=`bun test`）を標準とする。
- テストファイルは `bun:test` を import して Bun ランナーに統一する。
- CI（`.github/workflows/ci.yml`）も `bun test` を実行し、ローカルと同じ実行方式に揃える。

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
  --run-id run-20260211-1234 \
  --stage4-config configs/voicevox/stage4_text_config.json

# 4) Build Text JSON から VOICEVOX project を生成
bun run build-project -- \
  --stage4-json projects/introducing-rescript/run-20260211-0000/voicevox_text/E01_voicevox_text.json \
  --prefill-query engine \
  --voicevox-url http://voicevox-engine:50021

# 5) Stage5 `.vvproj` から VOICEVOX audio を生成（GUI操作不要）
bun run build-audio -- \
  --stage5-vvproj projects/introducing-rescript/run-20260211-0000/voicevox_project/E01.vvproj \
  --voicevox-url http://voicevox-engine:50021

# Build Text + Build Project を連続実行
bun run build-all -- \
  --script projects/introducing-rescript/run-20260211-0000/stage3/E01_script.md \
  --stage4-config configs/voicevox/stage4_text_config.json
```

- `--run-id` は任意です。
- 未指定時は `--run-dir` のパス要素に含まれる `run-YYYYMMDD-HHMM` を優先利用します。
- `--run-dir` から判定できない場合は、CLI が `run-YYYYMMDD-HHMM` を自動生成します。
- `--prefill-query` は `none`（既定）/ `minimal` / `engine` を指定できます。
- `--stage4-config` は Stage4 の Speakability/Pause 設定ファイルです（必須、未指定はエラー）。
- `--voicevox-url` 未指定時は `VOICEVOX_URL` 環境変数、`http://127.0.0.1:50021`、`http://voicevox-engine:50021`、`http://host.docker.internal:50021`、`http://narrative-vox-voicevox-engine:50021` の順で自動判定します。
- `--prefill-query engine`（`build-project`）と `build-audio` の両方で同じ URL 解決ロジックを使います。
- 推奨: 環境ごとに `VOICEVOX_URL` を設定する（例: DevContainer は `.devcontainer/devcontainer.json` で `http://voicevox-engine:50021`、ホスト実行はシェルで `http://127.0.0.1:50021`）。
- `build-audio` は `stage5` の `query`（手調整済み含む）を優先して `synthesis` を呼びます。`query` 未設定項目のみ `audio_query` で補完します。
- `build-audio` は途中失敗があっても成功分を保持して `audio/manifest.json` に要約します。
- `bun run prepare-run` は `stage1` / `stage2` / `stage3` を新 run に複製します。
- `build-text` / `build-project` / `build-audio` / `build-all` の `--run-dir` は任意です。
  - `build-text` / `build-all`: `--script` が `.../run-.../stage3/...` 配下なら自動推論
  - `build-project`: `--stage4-json` が `.../run-.../voicevox_text/...` 配下なら自動推論
  - `build-audio`: `--stage5-vvproj` が `.../run-.../voicevox_project/...` 配下なら自動推論
- `prepare-run` では `--default-project-id` / `--default-source-run-dir` / `--default-run-id` で未入力時の既定値を上書きできます。

## DevContainer + VOICEVOX Engine

DevContainer から `--prefill-query engine` を使う場合は、同一 Docker ネットワーク上に `VOICEVOX Engine` コンテナを起動します。

```bash
# DevContainer 再作成（runArgs/features 変更反映）
# VS Code: "Dev Containers: Rebuild Container"

# Engine 起動
bun run voicevox:up

# 疎通確認（DevContainer 内サービス名）
bun run voicevox:check

# 停止
bun run voicevox:down
```

- 共有ネットワーク名: `narrative-vox-net`
- Compose ファイル: `docker-compose.voicevox.yml`
- DevContainer からの URL: `http://voicevox-engine:50021`
- ホストOS からの URL: `http://127.0.0.1:50021`

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

2026-02-12 に再生成した `projects/introducing-rescript/run-20260211-0000/voicevox_text/` は、`E01`〜`E12` すべてで `quality_checks.speakability` を含み、`quality_checks.warnings` は 0 件です。警告を再現して確認する場合は `docs/architecture/build-text-speakability-checklist.md` にある `/tmp/nv-stage4-script/*.md` を使用してください。`SpeakabilityWarningConfig` のしきい値（scoreThreshold=70、minTerminalPunctuationRatio=0.65、maxLongUtteranceRatio=0.25）は `configs/voicevox/stage4_text_config.json`（または `--stage4-config` 指定ファイル）で管理されています。
