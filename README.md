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
│   ├── tech_explainer/       # 技術資料向けプロンプト (Blueprint / Material / Script / Build Text / Build Project)
│   ├── audiobook/   # 小説向けプロンプト（整備中）
│   └── shared/      # 共通ルール（整備中）
├── configs/
│   ├── projects/
│   ├── novels/
│   ├── characters/
│   └── voicevox/
├── inputs/
│   ├── books/
│   ├── novels/
│   └── repos/       # oss-dive 用の clone 先
├── projects/
│   └── <book-or-novel-id>/run-YYYYMMDD-HHMM/
│       ├── blueprint/
│       ├── material/
│       ├── script/
│       ├── context/
│       ├── voicevox_text/
│       ├── dict_candidates/
│       ├── voicevox_project/
│       └── audio/
├── schemas/
├── src/
├── tests/
├── docs/
│   ├── architecture/
│   └── decisions/
└── .tmp/
```

## 現在の実装スコープ

- Blueprint: 書籍全体 Blueprint JSON 生成
- Episode Material: エピソード素材 JSON 生成
- Script: 固定フレーム台本生成
- Build Text: `script.md` から `voicevox_text.json / voicevox.txt / dict_candidates.csv` 生成
  - 辞書候補抽出は形態素解析（`kuromoji`）を優先し、利用不可時は既存トークン分割へフォールバック
  - `voicevox_text.json` の `quality_checks.speakability` に読み上げやすさ指標（score/平均文字数/長文比率/終端記号比率）を出力
- Build Project: Build Text JSON から VOICEVOX import (`.vvproj`) 生成
  - VOICEVOX Engine `/audio_query` から `accentPhrases` を含む `query` を常に生成し、synthesis defaults を適用する
  - `--speed-preset`（`slow|normal|fast`）指定時は `speedScale/pauseLengthScale/postPhonemeLength` を上書きする
  - `--intonation-scale` 指定時は `intonationScale` を上書きする（0未満は0にクランプ）
  - 最後に `postPhonemeLength` は `utterances[*].pause_length_ms` を秒換算した下限で補正する
  - 適用した調整は `voicevox_project/E##_project_meta.json` に記録する
- Build Audio: Build Project `.vvproj` から VOICEVOX Engine API で WAV を自動生成
  - `audio/E##.wav` を出力（utteranceを連結した単一ファイル）
  - 既定で `audio/E##.mp3`（128kbps）を自動生成
  - `audio/manifest.json` に voice 設定・出力先・実行結果を保存

## サンプルデータ

- 入力ソース: `inputs/books/introducing-rescript/source/`
- 参照 run（2026-02-11）:
  - `projects/introducing-rescript/run-20260211-0000/blueprint/`
  - `projects/introducing-rescript/run-20260211-0000/material/`
  - `projects/introducing-rescript/run-20260211-0000/script/`
  - `projects/introducing-rescript/run-20260211-0000/context/`
  - `projects/introducing-rescript/run-20260211-0000/voicevox_text/`
  - `projects/introducing-rescript/run-20260211-0000/dict_candidates/`
- `projects/introducing-rescript/run-20260211-0000/voicevox_project/`
- Build Text の Speakability 警告再現手順は `docs/architecture/build-text-speakability-checklist.md` を参照してください。

詳細フローは `docs/architecture/pipeline.md` を参照。
TypeScript 移行後の運用ガイドは `docs/architecture/typescript-migration.md` を参照。

## テスト実行方針

- テスト実行コマンドは `bun run test`（=`bun test`）を標準とする。
- テストファイルは `bun:test` を import して Bun ランナーに統一する。

## 実行コマンド（最小）

```bash
# 1) 既存 run を複製して新しい run を作る（引数不足時は対話入力）
bun run prepare-run -- \
  --source-run-dir projects/introducing-rescript/run-20260211-0000

# 2) Blueprint/Material/Script 生成物を検証する（Blueprint/MaterialはJSON Schema、Scriptは台本形式）
bun run check-run -- \
  --run-dir projects/introducing-rescript/run-20260211-0000

# 3) script.md から VOICEVOX text を生成（run_id を明示する場合）
bun run build-text -- \
  --script projects/introducing-rescript/run-20260211-0000/script/E01_script.md \
  --run-id run-20260211-1234

# 4) Build Text JSON から VOICEVOX project を生成
bun run build-project -- \
  --voicevox-text-json projects/introducing-rescript/run-20260211-0000/voicevox_text/E01_voicevox_text.json \
  --engine-id 074fc39e-678b-4c13-8916-ffca8d505d1d \
  --speaker-id 7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff \
  --style-id 67 \
  --voicevox-url http://voicevox-engine:50021

# 5) Build Project `.vvproj` から VOICEVOX audio を生成（GUI操作不要）
bun run build-audio -- \
  --vvproj projects/introducing-rescript/run-20260211-0000/voicevox_project/E01.vvproj \
  --voicevox-url http://voicevox-engine:50021 \
  --compressed-format mp3 \
  --compressed-bitrate-kbps 128

# Build Text + Build Project を連続実行
bun run build-all -- \
  --script projects/introducing-rescript/run-20260211-0000/script/E01_script.md \
  --engine-id 074fc39e-678b-4c13-8916-ffca8d505d1d \
  --speaker-id 7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff \
  --style-id 67

# (補助) Promptテンプレートを project config で解決して出力
bun src/cli/main.ts render-prompt \
  --genre tech_explainer \
  --step blueprint \
  --project-config configs/projects/tech_explainer.example.json
```

## Prompt工程の実行方法（Blueprint / Material / Script / Digest）

Phase 1（Blueprint / Material / Script / Digest）は次のどちらかで実行します。

1. Skills で一気通貫に実行する（推奨）

```text
/gen-blueprint introducing-rescript
/gen-material introducing-rescript E01
/gen-script introducing-rescript E01
/gen-digest introducing-rescript E01
```

- Skill定義: `tools/skills/gen-blueprint/SKILL.md`, `tools/skills/gen-material/SKILL.md`, `tools/skills/gen-script/SKILL.md`, `tools/skills/gen-digest/SKILL.md`
- 出力先: `projects/<project-id>/run-YYYYMMDD-HHMM/{blueprint,material,script,context}/...`

2. `render-prompt` でテンプレートを解決し、任意のLLMに投入する

```bash
# Blueprint Promptを解決
bun src/cli/main.ts render-prompt \
  --genre tech_explainer \
  --step blueprint \
  --project-config configs/projects/tech_explainer.example.json

# Material Promptを解決（EPISODE_IDを上書き）
bun src/cli/main.ts render-prompt \
  --genre tech_explainer \
  --step material \
  --project-config configs/projects/tech_explainer.example.json \
  --episode-id E01
```

- `--run-id` は任意です。
- 未指定時は `--run-dir` のパス要素に含まれる `run-YYYYMMDD-HHMM` を優先利用します。
- `--run-dir` から判定できない場合は、CLI が `run-YYYYMMDD-HHMM` を自動生成します。
- `build-text` / `build-all` で `--episode-id` 未指定時は、`--script` のファイル名が **厳密に** `E##_script.md`（例: `E01_script.md`）である必要があります。非一致の場合は `--episode-id E##` を明示してください。
- `--character-map` は `character_key -> voice(engineId/speakerId/styleId)` の JSON ファイルを指定します（例: `configs/voicevox/default_character_map.json`）。
- `--character-map` 未指定時は `configs/voicevox/default_character_map.json` を優先し、未作成なら `configs/characters/*.json` から自動的に character map を構築します。
- `--synthesis-defaults` 未指定時は `configs/voicevox/synthesis_defaults.json` を読み込みます。存在しない場合はエラーになるため、作成するか `--synthesis-defaults configs/voicevox/synthesis_defaults.example.json` などを明示指定してください。
- `speaker_key`（`voicevox_text.json` の `utterances[*].speaker_key`）または `--character-key` を使う場合は character map が必要です（`--character-map` 指定、`configs/voicevox/default_character_map.json`、または `configs/characters/*.json` からの自動構築）。
- `speaker_key` / `--character-key` を使わない場合は `--engine-id` / `--speaker-id` / `--style-id` の3つを指定してください（synthesis defaults には voice 指定がないため自動適用されません）。
- `--character-key` を指定すると Build Text の `utterances[*].speaker_key` より優先して全 utterance に同一キャラクターキーを適用します。
- `--emotion <key>` を指定すると、`character map` の `emotionStyles[character_key][key]` に従って `styleId` を切り替えます（`--style-id` 指定時はそちらを優先）。
- `--build-text-config` は Build Text の Speakability/Pause 設定ファイルです（任意、未指定時は既定値を使用）。
- `voicevox_text.json` の `meta.source_script_path` は、`--run-dir`（明示または自動推論）基準の相対パスとして固定保存されます（例: `script/E01_script.md`）。
- `--voicevox-url` 未指定時は `VOICEVOX_URL` 環境変数、`http://127.0.0.1:50021`、`http://voicevox-engine:50021`、`http://host.docker.internal:50021`、`http://narrative-vox-voicevox-engine:50021` の順で自動判定します。
- `build-project` と `build-audio` の両方で同じ URL 解決ロジックを使います。
- `build-project` では `--speed-preset slow|normal|fast` で速度プリセットを指定できます（`--speed-profiles` で定義ファイルを上書き可能、未指定時は `configs/voicevox/speed_profiles.json` を利用）。
- `build-project` では `--intonation-scale <number>` で `intonationScale` を指定できます。
- `build-project` 実行時は `voicevox_project/E##_project_meta.json` が出力され、`speed_preset` / `emotion` / `intonation_scale` の適用情報が保存されます。
- 推奨: 環境ごとに `VOICEVOX_URL` を設定する（例: DevContainer は `.devcontainer/devcontainer.json` で `http://voicevox-engine:50021`、ホスト実行はシェルで `http://127.0.0.1:50021`）。
- `build-audio` は Build Project の `query`（手調整済み含む）を優先して `synthesis` を呼びます。`query` 未設定項目のみ `audio_query` で補完します。
- `build-audio` は途中失敗があっても成功分を保持して `audio/manifest.json` に要約します。
- `build-audio` は WAV 連結後に `ffmpeg` で圧縮音声を生成します（既定: `mp3` / `128kbps`）。
- `build-audio` の圧縮設定は `--compressed-format mp3|m4a|ogg|none` と `--compressed-bitrate-kbps <num>` で上書きできます。
- 圧縮を有効化する場合は `ffmpeg` が必要です。`--ffmpeg-path <path>` で実行ファイルの場所を明示できます。
- `bun run prepare-run` は `blueprint` / `material` / `script` を新 run に複製します。
- `build-text` / `build-project` / `build-audio` / `build-all` の `--run-dir` は任意です。
  - `build-text` / `build-all`: `--script` が `.../run-.../script/...` 配下なら自動推論
  - `build-project`: `--voicevox-text-json` が `.../run-.../voicevox_text/...` 配下なら自動推論
  - `build-audio`: `--vvproj` が `.../run-.../voicevox_project/...` 配下なら自動推論
- `prepare-run` では `--default-project-id` / `--default-source-run-dir` / `--default-run-id` で未入力時の既定値を上書きできます。
- `check-run` は blueprint/material/script の構造検証に加えて、build 前提条件（synthesis defaults / character 解決 / speed preset / VOICEVOX 到達性）も事前検証します。

### VOICEVOX の利用可能キャラクターID確認

```bash
VOICEVOX_URL=${VOICEVOX_URL:-http://127.0.0.1:50021}
curl -fsS "${VOICEVOX_URL}/speakers"
```

- `styles[*].id` が `styleId`、`speaker_uuid` が `speakerId` です。

## DevContainer + VOICEVOX Engine

DevContainer から `build-project` / `build-audio` を使う場合は、同一 Docker ネットワーク上に `VOICEVOX Engine` コンテナを起動します。

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

チェックリストには上記の期待動作に加えて CSV ヘッダー確認や `SpeakabilityWarningConfig` しきい値の説明も含まれているので、QA は実行ごとに同ドキュメントを参照してください。`docs/phase5-speakability-guidance.md` を使って警告ごとの期待値・対策・再現コマンド・必要ドキュメントリンクを整理し、報告とドキュメント更新のアクションを確認します。

2026-02-12 に再生成した `projects/introducing-rescript/run-20260211-0000/voicevox_text/` は、`E01`〜`E12` すべてで `quality_checks.speakability` を含み、`quality_checks.warnings` は 0 件です。警告を再現して確認する場合は `docs/architecture/build-text-speakability-checklist.md` にある `/tmp/nv-build-text-script/*.md` を使用してください。`SpeakabilityWarningConfig` のしきい値（scoreThreshold=70、minTerminalPunctuationRatio=0.65、maxLongUtteranceRatio=0.25）は `configs/voicevox/build_text_config.json`（または `--build-text-config` 指定ファイル）で管理されています。
