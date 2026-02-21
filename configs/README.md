# Configs

- `projects/`: プロジェクト実行設定
  - `<project-id>.example.json`: 共有用テンプレート
  - `<project-id>.json`: ローカル実運用値（必要に応じて作成）
- `novels/`: 小説向け実行設定
- `characters/`: キャラクター定義（キー、表示名、VOICEVOX voice、任意で emotionStyles）
- `voicevox/`: Build Text / Build Project 用の変換設定
  - `synthesis-defaults.example.json`: 共有用テンプレート（`--synthesis-defaults` で明示指定して利用）
  - `synthesis-defaults.json`: 既定の synthesis defaults（`--synthesis-defaults` 未指定時に使用、gitignore）
  - `default_character_map.json`: character_key -> VOICEVOX voice 設定（任意・ローカル、未作成時は `characters/*.json` から自動構築）
  - `build-text-config.example.json`: Build Text 設定テンプレート
  - `build-text-config.json`: Build Text の既定設定（コミット対象）
  - `reading-dictionary.json`: Build Text の読み辞書
  - `speed-profiles.json`: Build Project の速度プリセット定義
