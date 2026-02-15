# Source Code

パイプライン実装（blueprint/variables/script / build-text/build-project/build-audio / quality）を配置する。

現状のエントリポイント:

- `src/cli/main.ts`
  - `build-text`: script -> voicevox text
  - `build-project`: voicevox_text json -> vvproj
  - `build-audio`: vvproj -> wav/audio manifest
  - `build-all`: build-text + build-project
  - `check-run`: blueprint/variables/script validation
