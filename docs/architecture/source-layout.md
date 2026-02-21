# Source Layout

`apps/ + packages/ + data/` への再編後、実装本体は以下へ移動済み。

- `apps/cli/`: CLIエントリポイントと引数処理
- `apps/api/`: API サーバー
- `packages/application/`: ユースケース（build/check/prepare/render）
- `packages/domain/`: ドメイン型・ルール・文字列処理
- `packages/infrastructure/`: filesystem / schema / VOICEVOX 連携
- `packages/quality/`: run検証と前提条件チェック

主要エントリポイント:

- `apps/cli/src/main.ts`
  - `prepare-run`: run ディレクトリ複製（blueprint/material/script）
  - `render-prompt`: prompt テンプレートのプレースホルダ解決
  - `build-text`: script -> voicevox text
  - `build-project`: voicevox_text json -> vvproj
  - `build-audio`: vvproj -> wav + compressed audio/audio manifest
  - `build-all`: build-text + build-project
  - `check-run`: blueprint/material/script validation + build prerequisites preflight
