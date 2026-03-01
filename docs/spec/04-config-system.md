---
spec-id: spec-04
title: 設定システム
updated: 2026-03-01
depends-on: [spec-01, spec-02, spec-03, spec-05]
referenced-by: [spec-00, spec-07, spec-08]
---

# 設定システム

## 概要

`configs/` 配下にすべての設定ファイルが集約される。設定はコンテンツ設定（キャラクター・スタイル・ジャンル）・パイプライン設定（プロジェクト）・音声設定（VOICEVOX 関連）の3カテゴリに分かれる。一部は REST API 経由で CRUD 可能。

---

## configs/ 全体マップ

```
configs/
├── content/
│   ├── characters/           # キャラクター定義（CRUD 可）
│   │   ├── metan.json
│   │   ├── zundamon.json
│   │   ├── teacher.json
│   │   ├── student.json
│   │   └── narrator.json
│   ├── styles/               # コンテンツスタイル（読み取り専用）
│   │   └── radio-talk.json
│   └── genres/               # ジャンル定義（読み取り専用）
│       └── tech-explainer.json
├── pipeline/
│   └── projects/             # プロジェクト設定（CRUD 可）
│       ├── introducing-rescript.json
│       └── *.example.json    # 例示ファイル（API から除外）
└── voice/
    └── voicevox/             # VOICEVOX 音声設定（PUT のみ）
        ├── synthesis-defaults.json
        ├── build-text-config.json
        ├── speed-profiles.json
        ├── patch-config.json
        └── user-dict.json
```

---

## API 経由 CRUD 操作可能範囲

| カテゴリ | パス | GET（一覧） | GET（単体） | POST | PUT | DELETE |
|---|---|:---:|:---:|:---:|:---:|:---:|
| キャラクター | `/api/configs/characters` | ○ | ○ | ○ | ○ | ○ |
| プロジェクト | `/api/configs/projects` | ○ | ○ | ○ | ○ | ○ |
| スタイル | `/api/configs/styles` | ○ | ○ | — | — | — |
| ジャンル | `/api/configs/genres` | ○ | — | — | — | — |
| synthesis-defaults | `/api/configs/voice/voicevox/synthesis-defaults` | — | ○ | — | ○ | — |
| build-text-config | `/api/configs/voice/voicevox/build-text-config` | — | ○ | — | ○ | — |
| speed-profiles | `/api/configs/voice/voicevox/speed-profiles` | — | ○ | — | ○ | — |
| user-dict | `/api/configs/voice/voicevox/user-dict` | — | ○ | — | ○ | — |

> [CONSTRAINT] `configs/voice/voicevox/patch-config.json` は API 経由では操作不可（手動編集のみ）。

---

## キャラクター設定（configs/content/characters/）

各ファイルは `character.schema.json` に準拠する。

### 現在定義済みキャラクター

| キー | 名前 | 役割 |
|---|---|---|
| `metan` | 四国めたん | 専門家・講師役 |
| `zundamon` | ずんだもん | 視聴者代表・質問役 |
| `teacher` | — | 先生役（汎用） |
| `student` | — | 学生役（汎用） |
| `narrator` | — | ナレーター（中立） |

### API バリデーション

POST/PUT 時に `character.schema.json` でスキーマ検証。違反は HTTP 422 で返却。

キーバリデーション: `^[a-z0-9][a-z0-9_-]*$`

---

## プロジェクト設定（configs/pipeline/projects/）

各ファイルは `project-config.schema.json` に準拠する。

### 実例（introducing-rescript.json）

```json
{
  "PROJECT_ID": "introducing-rescript",
  "GENRE_ID": "tech-explainer",
  "STYLE_ID": "radio-talk",
  "PROJECT_TITLE": "ReScript入門",
  "SOURCE_MARKDOWN_PATHS": "data/inputs/tech-explainer/introducing-rescript/*.md",
  "AUDIENCE_BACKGROUND": "TypeScript/JavaScriptでWeb開発をしているエンジニア",
  "AUDIENCE_LEVEL": "ReScript初学者〜中級手前",
  "CAST": {
    "lead": "metan",
    "questioner": "zundamon"
  }
}
```

### フィールド説明

| フィールド | 必須 | 説明 |
|---|---|---|
| `PROJECT_ID` | ○ | プロジェクト ID（ファイル名と一致） |
| `GENRE_ID` | ○ | プロンプトテンプレートのジャンル |
| `STYLE_ID` | ○ | コンテンツスタイル ID |
| `PROJECT_TITLE` | 任意 | 表示用タイトル |
| `SOURCE_MARKDOWN_PATHS` | ○ | ソース Markdown のグロブパターン |
| `AUDIENCE_BACKGROUND` | 任意 | 対象読者の背景 |
| `AUDIENCE_LEVEL` | 任意 | 対象読者のレベル |
| `CAST` | 任意 | 役 → キャラクターキーのマッピング |

> [CONSTRAINT] `*.example.json` は API の一覧（`GET /api/configs/projects`）から自動除外される。

### CAST マッピング

`CAST` の役名（`lead`, `questioner` など）はプロンプトテンプレート内で参照される。役名はジャンルによって異なる。

---

## コンテンツスタイル設定（configs/content/styles/）

台本生成の話し方・ペース・構成を定義する。現在は `radio-talk.json` のみ。

```json
{
  "style_id": "radio-talk",
  "format": {
    "speaker_mode": "dialogue",
    "pacing": {
      "target_duration_min": 11,
      "chars_per_utterance": 120,
      "max_chars_per_utterance": 200
    },
    "language": {
      "formality": "polite"
    }
  },
  "segment_structure": {
    "chat_ratio": 0.15
  }
}
```

> [CONSTRAINT] スタイルファイルは API 経由では読み取り専用。追加・変更は手動。

---

## VOICEVOX 音声設定（configs/voice/voicevox/）

### synthesis-defaults.json

VOICEVOX の全合成パラメータのデフォルト値。build-project が読み込む。
詳細は [spec-03: データスキーマ](./03-data-schemas.md#synthesis-defaultsschema-json) を参照。

### build-text-config.json

文章分割・ポーズ計算・Speakability スコアの閾値設定。build-text が読み込む。
詳細は [spec-03: データスキーマ](./03-data-schemas.md#build-text-configschema-json) を参照。

### speed-profiles.json

速度プリセット定義（slow/normal/fast）。
詳細は [spec-03: データスキーマ](./03-data-schemas.md#speed-profilesschema-json) を参照。

### patch-config.json

テキスト正規化ルールと辞書パッチ。patch-voicevox-text が読み込む。
詳細は [spec-02: Layer 2](./02-pipeline-layer2.md#ステップ2-patch-voicevox-text) を参照。

### user-dict.json

VOICEVOX ユーザー辞書のアプリ管理形式。`dict-sync` コマンドで VOICEVOX Engine に同期。

---

## 設定の読み込み優先順位

CLI フラグによる上書きが最優先。

```
CLIフラグ > configs/ のファイル > コード内デフォルト
```

| 設定 | デフォルトパス |
|---|---|
| build-text-config | `configs/voice/voicevox/build-text-config.json` |
| patch-config | `configs/voice/voicevox/patch-config.json` |
| synthesis-defaults | `configs/voice/voicevox/synthesis-defaults.json` |
| speed-profiles | `configs/voice/voicevox/speed-profiles.json` |
| character-map | `buildRunCharacters()` で動的生成 |

---

## パストラバーサル対策

API 経由での設定ファイルアクセスは `safeResolve()` でバリデーションされる。

- キーバリデーション: `^[a-z0-9][a-z0-9_-]*$`
- `..` セグメント拒否
- 絶対パス拒否
- `configs/` ディレクトリ外へのアクセス拒否

---

## 関連仕様

- [spec-03: データスキーマ](./03-data-schemas.md) — 各設定ファイルのスキーマ定義
- [spec-05: キャラクター/話者解決](./05-character-voice.md) — キャラクター設定の使用方法
- [spec-07: API コントラクト](./07-api-contracts.md) — /api/configs エンドポイント
