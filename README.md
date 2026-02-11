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
│       ├── stage4/
│       ├── stage4_dict/
│       ├── stage5/
│       ├── reports/
│       └── logs/
├── schemas/
├── src/
├── tests/
├── docs/
│   ├── architecture/
│   └── decisions/
└── tmp/
```

## 現在の実装スコープ

- Stage 1: 書籍全体 Blueprint JSON 生成
- Stage 2: エピソード変数 JSON 生成
- Stage 3: 固定フレーム台本生成
- Stage 4: `script.md` から `voicevox_text.json / voicevox.txt / dict_candidates.csv` 生成
  - 辞書候補抽出は形態素解析（`kuromoji`）を優先し、利用不可時は既存トークン分割へフォールバック
  - `voicevox_text.json` の `quality_checks.speakability` に読み上げやすさ指標（score/平均文字数/長文比率/終端記号比率）を出力
- Stage 5: Stage 4 JSON から VOICEVOX import (`.vvproj`) 生成

## サンプルデータ

- 入力ソース: `inputs/books/introducing-rescript/source/`
- 参照 run（2026-02-11）:
  - `projects/introducing-rescript/run-20260211-0000/stage1/`
  - `projects/introducing-rescript/run-20260211-0000/stage2/`
  - `projects/introducing-rescript/run-20260211-0000/stage3/`
  - `projects/introducing-rescript/run-20260211-0000/stage4/`
  - `projects/introducing-rescript/run-20260211-0000/stage4_dict/`
  - `projects/introducing-rescript/run-20260211-0000/stage5/`
  - `projects/introducing-rescript/run-20260211-0000/reports/`

詳細フローは `docs/architecture/pipeline.md` を参照。
TypeScript 移行後の運用ガイドは `docs/architecture/typescript-migration.md` を参照。

## 実行コマンド（最小）

```bash
# Stage4 + Stage5 を連続実行
bun run pipeline -- \
  --script projects/introducing-rescript/run-20260211-0000/stage3/E01_script.md \
  --out-dir projects/introducing-rescript/run-20260211-0000

# run_id を明示する場合（形式: run-YYYYMMDD-HHMM）
bun run stage4 -- \
  --script projects/introducing-rescript/run-20260211-0000/stage3/E01_script.md \
  --out-dir projects/introducing-rescript/run-20260211-0000 \
  --run-id run-20260211-1234
```

- `--run-id` は任意です。
- 未指定時は `--out-dir` のパス要素に含まれる `run-YYYYMMDD-HHMM` を優先利用します。
- `--out-dir` から判定できない場合は、CLI が `run-YYYYMMDD-HHMM` を自動生成します。

## Stage4 辞書CSVの確認観点

- 重複確認: `surface` が同一の候補は `occurrences` に集約され、重複行を出さない。
- 過検出確認: 単発かつ推定読み (`reading_inferred`) の語は `LOW` として扱い、優先度を上げすぎない。
- `priority` 判定:
  - `HIGH`: ルビ由来、または出現3回以上、または形態素由来かつ2回以上出現
  - `MEDIUM`: 形態素読みを持つ語、または2回以上出現、または信頼できる読みがある語
  - `LOW`: 上記に該当しない語（特に単発の推定読み候補）
