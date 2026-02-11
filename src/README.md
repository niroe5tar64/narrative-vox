# Source Code

パイプライン実装（Stage 1-5 / quality / voicevox 変換）を配置する。

現状のエントリポイント:

- `src/cli/main.ts`
  - `build-text`: script -> voicevox text
  - `build-project`: stage4 json -> vvproj
  - `build-all`: build-text + build-project
  - `check-run`: stage1-3 validation
