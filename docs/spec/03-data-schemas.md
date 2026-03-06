---
spec-id: spec-03
title: データスキーマ定義
updated: 2026-03-01
depends-on: []
referenced-by: [spec-01, spec-02, spec-04, spec-05, spec-06, spec-07]
---

# データスキーマ定義

## 概要

Narrative Vox の全データ構造は `schemas/` 配下の JSON Schema ファイルで定義され、AJV（Another JSON Validator）によって各パイプラインステージで検証される。17のスキーマが存在し、Layer 1・Layer 2・設定の3カテゴリに分類される。

---

## スキーマ一覧

| スキーマ名 | ファイル | カテゴリ | 対応ステップ/用途 |
|---|---|---|---|
| `run-contract` | `run-contract.schema.json` | 共通 | Run メタデータ |
| `blueprint` | `blueprint.schema.json` | Layer 1 | gen-blueprint 出力 |
| `episode-material` | `episode-material.schema.json` | Layer 1 | gen-material 出力 |
| `episode-digest` | `episode-digest.schema.json` | Layer 1 | gen-digest 出力 |
| `content-style` | `content-style.schema.json` | Layer 1 | コンテンツスタイル設定 |
| `voicevox-text` | `voicevox-text.schema.json` | Layer 2 | build-text 出力 |
| `voicevox-text-patch-config` | `voicevox-text-patch-config.schema.json` | Layer 2 | patch-voicevox-text 設定 |
| `voicevox-import` | `voicevox-import.schema.json` | Layer 2 | build-project 出力（.vvproj） |
| `voicevox-project-meta` | `voicevox-project-meta.schema.json` | Layer 2 | build-project メタデータ |
| `character` | `character.schema.json` | 設定 | キャラクター定義 |
| `character-map` | `character-map.schema.json` | 設定 | キャラクターマップ |
| `project-config` | `project-config.schema.json` | 設定 | プロジェクト設定 |
| `build-text-config` | `build-text-config.schema.json` | 設定 | build-text 動作設定 |
| `synthesis-defaults` | `synthesis-defaults.schema.json` | 設定 | VOICEVOX 合成デフォルト |
| `speed-profiles` | `speed-profiles.schema.json` | 設定 | 速度プリセット |
| `user-dict` | `user-dict.schema.json` | 設定 | ユーザー辞書 |

---

## バリデーション実装

### AJV ラッパー（packages/infrastructure/src/schema-validator.ts）

```typescript
// スキーマ名からJSONスキーマファイルを読み込み、コンパイル済みバリデータを返す
validateAgainstSchema(data: unknown, schemaName: string): string[] | null
// 戻り値: null = 合格、string[] = エラーメッセージ配列
```

- AJV 2020-12 ドラフト使用
- コンパイル済みバリデータをスキーマパスでキャッシュ（再利用）
- スキーマファイルは `schemas/<schemaName>.schema.json` で解決

---

## Layer 1 スキーマ詳細

### blueprint.schema.json

`blueprint/project_blueprint.json` に格納される。プロジェクト全体の設計図。

```json
{
  "meta": {
    "project_id": "introducing-rescript",
    "title": "ReScript入門",
    "episode_count": 5,
    "total_duration_min": 60
  },
  "project_intent": "文字列...",
  "theme_catalog": [...],
  "episode_plan": [
    {
      "episode_id": "E01",
      "title": "ReScriptとは何か",
      "duration_min": 12,
      "themes": [...]
    }
  ],
  "coverage_matrix": {...},
  "continuity_plan": {...},
  "quality_checks": {...}
}
```

> [CONSTRAINT] `episode_plan[].episode_id` の値が Run の `plannedEpisodeIds` になる。

### episode-material.schema.json

`material/E##_material.json` に格納される。エピソードの素材層（コンテンツ要素の集合）。

```json
{
  "schema_version": "1.0",
  "meta": {
    "episode_id": "E01",
    "title": "ReScriptとは何か"
  },
  "sections": [
    {
      "id": 1,
      "title": "イントロダクション",
      "elements": [
        {
          "type": "theme_introduction",
          "content": "..."
        }
      ]
    }
  ]
}
```

**要素タイプ一覧**（`elements[].type`）:

| タイプ | 説明 |
|---|---|
| `theme_introduction` | テーマ導入 |
| `prerequisite` | 前提知識 |
| `core_thesis` | 核心命題 |
| `concept` | 概念説明 |
| `capability` | 機能説明 |
| `scope_boundary` | スコープ境界 |
| `structural_model` | 構造モデル |
| `decision_scenario` | 意思決定シナリオ |
| `practical_benefit` | 実用的なメリット |
| `process_impact` | プロセスへの影響 |
| `risk_assessment` | リスク評価 |
| `guideline` | ガイドライン |
| `code_example` | コード例 |
| `analogy` | 類推 |
| `takeaway` | まとめ・要点 |

### episode-digest.schema.json

`context/E##_episode_digest.json` に格納される。エピソード間の一貫性維持に使用。

```json
{
  "schema_version": "1.0",
  "episode_id": "E01",
  "content_summary": {
    "core_topics_covered": ["ReScriptの基本概念"],
    "key_conclusions": ["型安全なJavaScript代替"],
    "terms_introduced": ["ReScript", "Belt"]
  },
  "character_behavior": {
    "utterance_count": 48,
    "emotion_moments": [...]
  },
  "continuity": {
    "narrative_position": "opening",
    "open_threads": [...],
    "resolved_threads": []
  }
}
```

---

## Layer 2 スキーマ詳細

### voicevox-text.schema.json

`voicevox_text/E##_voicevox_text.json` に格納される。build-text の出力。

#### 最小実例
```json
{
  "utterances": [
    {
      "utterance_id": "U001",
      "section_id": 1,
      "section_title": "イントロダクション",
      "speaker_key": "metan",
      "text": "今日はReScriptについて説明します。",
      "pause_length_ms": 360
    }
  ]
}
```

#### 完全実例（quality_checks 付き）
```json
{
  "utterances": [...],
  "quality_checks": {
    "utterance_count": 48,
    "max_chars_per_utterance": 98,
    "has_ruby_notation": false,
    "speakability": {
      "score": 82,
      "average_chars_per_utterance": 31.5,
      "long_utterance_ratio": 0.08,
      "terminal_punctuation_ratio": 0.94
    },
    "warnings": []
  }
}
```

#### utterance フィールド定義

| フィールド | 型 | 制約 | 説明 |
|---|---|---|---|
| `utterance_id` | `string` | パターン `^U\d{3}$` | 発話 ID（U001 〜 U999） |
| `section_id` | `number` | 1以上の整数 | セクション番号 |
| `section_title` | `string` | — | セクションタイトル |
| `speaker_key` | `string` | 任意 | キャラクターキー |
| `text` | `string` | 1〜200文字 | 発話テキスト |
| `pause_length_ms` | `number` | 0〜2000 | 後続ポーズ長（ミリ秒） |
| `dictionary_candidates` | `array` | 任意 | 辞書候補リスト |

> [CONSTRAINT] `text` は最大200文字。超過するとスコアが下がる。

### voicevox-import.schema.json

build-project が生成する `.vvproj` ファイル（VOICEVOX プロジェクト形式）。

```json
{
  "appVersion": "0.25.0",
  "talk": {
    "audioKeys": ["U001", "U002"],
    "audioItems": {
      "U001": {
        "text": "今日はReScriptについて説明します。",
        "voice": {
          "engineId": "074fc39e-678b-4c13-8916-ffca8d505d1d",
          "speakerId": "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
          "styleId": 2
        },
        "query": {
          "speedScale": 1.0,
          "pitchScale": 0.0,
          "intonationScale": 1.0,
          "volumeScale": 1.0
        },
        "pauseMoras": null,
        "prePhonemeLength": 0.1,
        "postPhonemeLength": 0.1
      }
    }
  }
}
```

### voicevox-project-meta.schema.json

`voicevox_project/E##_meta.json` に格納される（`.vvproj` と同ディレクトリ）。

```json
{
  "generated_at": "2026-03-01T14:30:00Z",
  "adjustments": {
    "speed_preset": "normal",
    "emotion": "calm",
    "intonation_scale": 1.0
  }
}
```

---

## 設定スキーマ詳細

### character.schema.json

`configs/content/characters/<key>.yaml` に格納される。

**最小実例**
```json
{
  "key": "metan",
  "voice": {
    "engineId": "074fc39e-678b-4c13-8916-ffca8d505d1d",
    "speakerId": "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
    "styleId": 2
  }
}
```

**完全実例**（`configs/content/characters/metan.yaml` 相当）
```json
{
  "key": "metan",
  "name": "四国めたん",
  "voice": {
    "engineId": "074fc39e-678b-4c13-8916-ffca8d505d1d",
    "speakerId": "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
    "styleId": 2
  },
  "emotionStyles": {
    "normal": 2,
    "amaama": 0,
    "tsuntsun": 6,
    "hisohiso": 4
  },
  "profile": {
    "gender": "female",
    "age_range": "young_adult",
    "knowledge_level": "expert",
    "personality_traits": ["logical", "tsundere", "polite", "knowledgeable"],
    "speech_register": "polite_desu_masu",
    "sentence_endings": ["です", "ます", "でしょう", "なの", "わよ"],
    "filler_words": ["まあ", "ちょっと"],
    "catchphrases": ["簡単に説明すると", "わかった？", "ポイントはね"]
  }
}
```

### character-map.schema.json

話者キーから VOICEVOX パラメータへのマッピング。build-project が使用。

```json
{
  "defaultCharacterKey": "metan",
  "characters": {
    "metan": {
      "engineId": "074fc39e-678b-4c13-8916-ffca8d505d1d",
      "speakerId": "7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff",
      "styleId": 2
    },
    "zundamon": {
      "engineId": "074fc39e-678b-4c13-8916-ffca8d505d1d",
      "speakerId": "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
      "styleId": 3
    }
  },
  "emotionStyles": {
    "metan": { "normal": 2, "amaama": 0, "tsuntsun": 6 },
    "zundamon": { "normal": 3, "amaama": 1, "tsuntsun": 7 }
  }
}
```

### project-config.schema.json

`configs/pipeline/projects/<project-id>.yaml` に格納される。

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

### build-text-config.schema.json

文章分割・ポーズ計算・Speakabilityスコアの動作設定。

```json
{
  "speakability": {
    "scoreThreshold": 70,
    "minTerminalPunctuationRatio": 0.8,
    "maxLongUtteranceRatio": 0.25,
    "targetAverageChars": 32,
    "averagePenaltyFactor": 1.2,
    "averagePenaltyMax": 35,
    "longRatioWeight": 45,
    "punctuationWeight": 20
  },
  "pause": {
    "minMs": 120,
    "maxMs": 520,
    "bases": {
      "default": 190,
      "strongEnding": 360,
      "fullStop": 320,
      "clauseEnd": 240
    },
    "lengthBonus": {
      "step": 10,
      "increment": 20,
      "max": 120
    },
    "penalties": {
      "conjunction": 40,
      "continuation": 50
    }
  }
}
```

### synthesis-defaults.schema.json

VOICEVOX 合成パラメータのデフォルト値。

```json
{
  "appVersion": "0.25.0",
  "tpqn": 480,
  "tempoBpm": 120,
  "timeSignature": { "beats": 4, "beatType": 4 },
  "queryDefaults": {
    "speedScale": 1.0,
    "pitchScale": 0.0,
    "intonationScale": 1.0,
    "volumeScale": 1.0,
    "pauseLengthScale": 1.0,
    "prePhonemeLength": 0.1,
    "postPhonemeLength": 0.1,
    "outputSamplingRate": "engineDefault",
    "outputStereo": false
  }
}
```

### speed-profiles.schema.json

速度プリセット定義。build-project の `--speed-preset` フラグで選択。

```json
{
  "version": 1,
  "presets": {
    "slow":   { "speedScale": 0.9,  "pauseLengthScale": 1.2, "postPhonemeLength": 0.14 },
    "normal": { "speedScale": 1.0,  "pauseLengthScale": 1.0, "postPhonemeLength": 0.10 },
    "fast":   { "speedScale": 1.15, "pauseLengthScale": 0.9, "postPhonemeLength": 0.08 }
  }
}
```

> [EXTENSIBLE] プリセット名と値は追加可能。`--speed-preset` フラグは API で `["slow","normal","fast"]` のいずれかに制限。

### user-dict.schema.json

VOICEVOX ユーザー辞書のアプリ管理形式。`dict-sync` コマンドで VOICEVOX Engine に同期。

```json
{
  "version": 1,
  "words": [
    {
      "surface": "ReScript",
      "pronunciation": "リスクリプト",
      "accent_type": 0,
      "word_type": "PROPER_NOUN",
      "priority": 5
    }
  ]
}
```

**`word_type` の選択肢**: `PROPER_NOUN` / `COMMON_NOUN` / `VERB` / `ADJECTIVE` / `SUFFIX`

---

## 関連仕様

- [spec-05: キャラクター/話者解決](./05-character-voice.md) — character / character-map の使用方法
- [spec-06: Runディレクトリ](./06-run-directory.md) — 各スキーマの格納場所
- [spec-01: Layer 1 パイプライン](./01-pipeline-layer1.md) — blueprint / material / digest の生成
- [spec-02: Layer 2 パイプライン](./02-pipeline-layer2.md) — voicevox-text / import の生成
