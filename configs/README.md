# Configs

- `books/`: 書籍向け実行設定
  - `<book-id>.example.json`: 共有用テンプレート
  - `<book-id>.json`: ローカル実運用値（必要に応じて作成）
- `novels/`: 小説向け実行設定
- `characters/`: キャラクター定義（キー、表示名、VOICEVOX voice）
- `voicevox/`: Build Text / Build Project 用の変換設定
  - `default_profile.example.json`: 共有用テンプレート
  - `default_profile.json`: ローカル実運用値（gitignore）
  - `default_character_map.json`: character_key -> VOICEVOX voice 設定（任意・ローカル）
  - `build_text_config.example.json`: Build Text 設定テンプレート
  - `build_text_config.json`: ローカル実運用値
