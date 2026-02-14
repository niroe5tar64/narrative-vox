# Source Code

パイプライン実装（Stage 1-6 / quality / voicevox 変換）を配置する。

現状のエントリポイント:

- `src/cli/main.ts`
  - `build-text`: script -> voicevox text
  - `build-project`: voicevox_text json -> vvproj
  - `build-audio`: vvproj -> wav/audio manifest
  - `build-all`: build-text + build-project
  - `check-run`: stage1-3 validation
