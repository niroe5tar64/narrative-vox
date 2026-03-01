---
spec-id: spec-05
title: キャラクター/話者解決システム
updated: 2026-03-01
depends-on: [spec-03]
referenced-by: [spec-01, spec-02, spec-04, spec-07]
---

# キャラクター/話者解決システム

## 概要

台本の `[speaker:key]` タグ → キャラクター定義（`configs/content/characters/`）→ VOICEVOX パラメータ（engineId/speakerId/styleId）という3段階の解決フローで、テキストから音声合成パラメータを決定する。感情スタイルは発話ごとのオプション指定で切り替え可能。

---

## 解決フロー全体図

```mermaid
flowchart LR
    A["台本\n[speaker:metan]"] --> B{解決方式}
    B -->|"--character-map 指定"| C[character-map.json\nのみ参照]
    B -->|"--character-key 指定\n(単一話者モード)"| D[固定キャラクターを使用]
    B -->|"既定（マップなし）"| E["characters/*.json\nから buildRunCharacters()"]
    C --> F[CharacterVoice\nengineId/speakerId/styleId]
    D --> F
    E --> F
    F --> G{感情スタイル\n指定あり?}
    G -->|"--emotion calm"| H[emotionStyles[calm]\nの styleId へ上書き]
    G -->|指定なし| I[デフォルト styleId を使用]
    H --> J[VOICEVOX\naudio_query & synthesis]
    I --> J
```

---

## 型定義

```typescript
// packages/domain/src/characters.ts

/** VOICEVOX 音声パラメータ */
interface CharacterVoice {
  engineId: string;   // VOICEVOX Engine の UUID
  speakerId: string;  // 話者 UUID
  styleId: number;    // スタイル（感情）ID
}

/** キャラクター完全定義 */
interface CharacterDefinition {
  key: string;                              // 一意キー（例: "metan"）
  name?: string;                           // 表示名（例: "四国めたん"）
  description?: string;
  voice: CharacterVoice;                   // デフォルト音声パラメータ
  emotionStyles?: Record<string, number>;  // 感情名 → styleId のマップ
}

/** ランタイム用キャラクターマップ */
interface CharacterMap {
  defaultCharacterKey?: string;
  characters: Record<string, CharacterVoice>;            // key → 音声パラメータ
  emotionStyles?: Record<string, Record<string, number>>; // key → 感情マップ
}
```

---

## 感情スタイル解決ロジック

```
resolveStyleId(characterKey, emotion, characterMap):
  1. characterMap.emotionStyles[characterKey] が存在する場合:
     → emotionStyles[characterKey][emotion] を返す
  2. emotion が undefined の場合:
     → characterMap.characters[characterKey].styleId を返す（デフォルト）
  3. 感情名が見つからない場合:
     → デフォルト styleId にフォールバック
```

> [CONSTRAINT] `styleId` は正の整数でなければならない。`normalizeEmotionStylesForCharacter()` がバリデーション。

---

## 実在キャラクター一覧

### ずんだもん（zundamon）

| 項目 | 値 |
|---|---|
| キー | `zundamon` |
| speakerId | `388f246b-8c41-4ac1-8e2d-5d79f3ff56d9` |
| 性別/年齢 | 中性/子ども |
| 知識レベル | 初級者 |
| 語調 | カジュアル（〜なのだ、〜ぞ） |
| 一人称 | ぼく |
| キャッチフレーズ | ぼくはずんだもんなのだ |

**感情スタイル**

| 感情名 | styleId |
|---|---|
| `normal` | 3 |
| `amaama` | 1 |
| `tsuntsun` | 7 |
| `hisohiso` | 22 |

---

### 四国めたん（metan）

| 項目 | 値 |
|---|---|
| キー | `metan` |
| speakerId | `7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff` |
| 性別/年齢 | 女性/若者 |
| 知識レベル | 専門家 |
| 語調 | 丁寧（です・ます）＋ツンデレ |
| キャッチフレーズ | 簡単に説明すると、わかった？ |

**感情スタイル**

| 感情名 | styleId |
|---|---|
| `normal` | 2 |
| `amaama` | 0 |
| `tsuntsun` | 6 |
| `hisohiso` | 4 |

---

### teacher（先生）

| 項目 | 値 |
|---|---|
| キー | `teacher` |
| speakerId | `dda44ade-5f9c-4a3a-9d2c-2a976c7476d9` |
| デフォルト styleId | 68 |
| 性別/年齢 | 男性/成人 |
| 知識レベル | 専門家 |
| 語調 | 丁寧・論理的・断定的 |
| キャッチフレーズ | ポイントはここです、整理すると |

**感情スタイル**

| 感情名 | styleId |
|---|---|
| `calm` | 68 |
| `energetic` | 68 |
| `serious` | 68 |

---

### student（学生）

| 項目 | 値 |
|---|---|
| キー | `student` |
| speakerId | `287aa49f-e56b-4530-a469-855776c84a8d` |
| デフォルト styleId | 69 |
| 性別/年齢 | 女性/若者 |
| 知識レベル | 中級手前 |
| 語調 | 丁寧・疑問多め（〜ですか、〜ですよね） |

**感情スタイル**

| 感情名 | styleId |
|---|---|
| `calm` | 69 |
| `confused` | 71 |

---

### narrator（ナレーター）

| 項目 | 値 |
|---|---|
| キー | `narrator` |
| speakerId | `04dbd989-32d0-40b4-9e71-17c920f2a8a9` |
| デフォルト styleId | 67 |
| 性別/年齢 | 中性/成人 |
| 知識レベル | 専門家 |
| 語調 | 丁寧・中立・論理的 |

感情スタイルなし（単一スタイルのみ）。

---

## 全キャラクター共通 engineId

全キャラクターは同一の VOICEVOX Engine を使用:

```
engineId: 074fc39e-678b-4c13-8916-ffca8d505d1d
```

> [CONSTRAINT] engineId は現時点で全キャラクター共通。マルチエンジン対応は未実装。

---

## buildRunCharacters() の動作

```typescript
// CharacterDefinition[] から CharacterMap を構築
buildRunCharacters(definitions: CharacterDefinition[]): CharacterMap
```

1. `definitions` を `key → CharacterVoice` マップに変換
2. `emotionStyles` があれば `emotionStyles` マップに追加
3. `defaultCharacterKey` は `definitions[0].key` に設定

---

## 話者タグフォーマット

台本 Markdown 内で使用する話者タグ。

| 項目 | 値 |
|---|---|
| パターン | `^\s*\[speaker:([a-z][a-z0-9_-]*)\]\s*` |
| 例 | `[speaker:metan] 今日はReScriptについて説明します。` |

```typescript
parseSpeakerTag(line: string): { speakerKey: string; tagLength: number } | null
hasSpeakerTagPrefix(line: string): boolean
```

---

## キャラクターキーバリデーション

| 項目 | 値 |
|---|---|
| パターン | `^[a-z][a-z0-9_-]*$` |
| 有効例 | `metan`, `zundamon`, `teacher`, `narrator` |
| 無効例 | `Metan`（大文字）, `123abc`（数字始まり） |

---

## CLI フラグによる上書き

build-project / check-run で音声パラメータをCLIから直接指定可能（キャラクターマップ不使用の単一話者モード）。

| フラグ | 型 | 説明 |
|---|---|---|
| `--character-key` | `string` | キャラクターキーで一括指定 |
| `--engine-id` | `string` | engineId を直接指定 |
| `--speaker-id` | `string` | speakerId を直接指定 |
| `--style-id` | `integer` | styleId を直接指定 |
| `--emotion` | `string` | 感情スタイル名で styleId を解決 |
| `--character-map` | `path` | カスタムマップファイルのパス |

---

## 関連仕様

- [spec-03: データスキーマ](./03-data-schemas.md) — character / character-map スキーマ定義
- [spec-02: Layer 2 パイプライン](./02-pipeline-layer2.md) — build-project での使用方法
- [spec-04: 設定システム](./04-config-system.md) — configs/content/characters/ の管理
