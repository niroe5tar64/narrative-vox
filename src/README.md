# Source Code

パイプライン実装（blueprint/material/script / build-text/build-project/build-audio / quality）を配置する。

現状のエントリポイント:

- `src/cli/main.ts`
  - `prepare-run`: run ディレクトリ複製（blueprint/material/script）
  - `render-prompt`: prompt テンプレートのプレースホルダ解決
  - `build-text`: script -> voicevox text
  - `build-project`: voicevox_text json -> vvproj
  - `build-audio`: vvproj -> wav + compressed audio/audio manifest
  - `build-all`: build-text + build-project
  - `check-run`: blueprint/material/script validation + build prerequisites preflight
