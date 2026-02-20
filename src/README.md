# Source Code

層化構成で実装を配置する。

- `src/cli/`: CLIエントリポイントと引数処理
- `src/app/`: ユースケース（build/check/prepare/render）
- `src/domain/`: ドメイン型・ルール・文字列処理
- `src/infra/`: filesystem / schema / VOICEVOX 連携
- `src/quality/`: run検証と前提条件チェック

主要エントリポイント:

- `src/cli/main.ts`
  - `prepare-run`: run ディレクトリ複製（blueprint/material/script）
  - `render-prompt`: prompt テンプレートのプレースホルダ解決
  - `build-text`: script -> voicevox text
  - `build-project`: voicevox_text json -> vvproj
  - `build-audio`: vvproj -> wav + compressed audio/audio manifest
  - `build-all`: build-text + build-project
  - `check-run`: blueprint/material/script validation + build prerequisites preflight
