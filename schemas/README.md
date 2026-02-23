# Schemas

パイプライン各ステージの成果物・設定ファイルのスキーマを配置する。

## Layer 1（LLM駆動）

- `schemas/blueprint.schema.json` — プロジェクト全体設計
- `schemas/episode-material.schema.json` — 素材層の構造化データ
- `schemas/episode-digest.schema.json` — エピソード間一貫性の中間表現

## Layer 2（決定的CLI）

- `schemas/voicevox-text.schema.json` — 発話データ
- `schemas/voicevox-import.schema.json` — VOICEVOX プロジェクトインポートメタデータ
- `schemas/voicevox-project-meta.schema.json` — VOICEVOX プロジェクトメタデータ

## 設定ファイル

- `schemas/content-style.schema.json` — コンテンツスタイル定義
- `schemas/character.schema.json` — キャラクター定義（profile 含む）
- `schemas/project-config.schema.json` — プロジェクト設定
- `schemas/voicevox-text-patch-config.schema.json` — patch-voicevox-text パッチ設定
- `schemas/speed-profiles.schema.json` — 速度プロファイル
