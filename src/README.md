# Source Code

パイプライン実装（Stage 1-5 / quality / voicevox 変換）を配置する。

現状のエントリポイント:

- `src/cli/main.js`
  - `stage4`: script -> voicevox text
  - `stage5`: stage4 json -> vvproj
  - `pipeline`: stage4 + stage5
