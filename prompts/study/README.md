# Study Prompt Guide

技術書・記事・技術資料を音声学習向け台本に変換するための運用ガイドです。

## ファイル

- `prompts/study/blueprint.md`
- `prompts/study/episode_variables.md`
- `prompts/study/script_common_frame.md`
- `prompts/study/build_text.md`
- `prompts/study/build_project.md`
- `configs/projects/<project-id>.json`
- `configs/projects/<project-id>.example.json`

## 実行順

1. Blueprint
- 入力: `blueprint.md` + `configs/projects/<project-id>.json`
- 出力: `projects/<project-id>/run-YYYYMMDD-HHMM/blueprint/project_blueprint.json`

2. Episode Variables
- 入力: `episode_variables.md` + Blueprint 出力 + `EPISODE_ID`
- 出力: `projects/<project-id>/run-YYYYMMDD-HHMM/variables/E##_variables.json`

3. Script
- 入力: `script_common_frame.md` + Episode Variables 出力
- 出力: `projects/<project-id>/run-YYYYMMDD-HHMM/script/E##_script.md`

4. Build Text (script -> voicevox text)
- 入力: `script/E##_script.md`
- 出力: `voicevox_text/E##_voicevox_text.json`
- 出力: `voicevox_text/E##_voicevox.txt`
- 出力: `dict_candidates/E##_dict_candidates.csv`

5. Build Project (voicevox text -> import)
- 入力: `voicevox_text/E##_voicevox_text.json` + `configs/voicevox/default_profile.json`（`--profile` 未指定時）
- 代替入力: `--profile configs/voicevox/default_profile.example.json` を明示指定して実行
- 出力: `voicevox_project/E##_voicevox_import.json`
- 出力: `voicevox_project/E##.vvproj`
- 出力: `voicevox_project/E##_project_meta.json`

6. Validation（任意）
- `bun run check-run -- --run-dir projects/<project-id>/run-YYYYMMDD-HHMM`
- Blueprint/Variables/Script を検証（レポートファイルは出力しない）

## 補助指示

各Phaseの末尾に以下を付けると安定します。

`上記Prompt内の {{PLACEHOLDER}} は、添付したproject-config JSONの同名キーで解決してから実行してください。`

Episode Variablesで回を切り替える場合は以下を追加します。

`今回は EPISODE_ID=E02 として実行してください。`

## 必須キー（project config）

- `PROJECT_ID`
- `GENRE`
- `PROJECT_TITLE`
- `SOURCE_MARKDOWN_PATHS`
- `AUDIENCE_BACKGROUND`
- `AUDIENCE_LEVEL`
- `AUDIENCE_INTEREST`
- `BASELINE_CONTEXT_OR_EMPTY`
- `EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY`
- `PROJECT_BLUEPRINT_JSON_PATH`
- `EPISODE_ID`

推奨: 初期作成は `configs/projects/<project-id>.example.json` をコピーして `configs/projects/<project-id>.json` を作る。

## CLI 実行例（Build Text/Project）

```bash
# Prompt解決（Blueprint）
bun src/cli/main.ts render-prompt -- \
  --genre study \
  --step blueprint \
  --project-config configs/projects/introducing-rescript.example.json

# Build Text + Build Project
bun run build-all -- \
  --script projects/introducing-rescript/run-20260211-0000/script/E01_script.md \
  --engine-id 074fc39e-678b-4c13-8916-ffca8d505d1d \
  --speaker-id 7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff \
  --style-id 67 \
  --run-dir projects/introducing-rescript/run-20260211-0000
```

## Skills 実行例（Blueprint / Variables / Script）

Prompt工程は Skills で連続実行できます。

```text
/gen-blueprint introducing-rescript
/gen-variables introducing-rescript E01
/gen-script introducing-rescript E01
```

- Skill定義:
  - `skills/gen-blueprint/SKILL.md`
  - `skills/gen-variables/SKILL.md`
  - `skills/gen-script/SKILL.md`
- Skills を使わない場合は、`render-prompt` で解決した Prompt を任意のLLMへ渡して実行してください。
