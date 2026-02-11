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

## 実行コマンド（最小）

```bash
# Stage4 + Stage5 を連続実行
bun run pipeline -- \
  --script projects/introducing-rescript/run-20260211-0000/stage3/E01_script.md \
  --out-dir projects/introducing-rescript/run-20260211-0000
```
