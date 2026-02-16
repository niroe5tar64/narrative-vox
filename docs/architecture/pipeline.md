# Pipeline Architecture

最終更新: 2026-02-16

このリポジトリの音声データ生成は、次の2レイヤーで進みます。

- Blueprint / Variables / Script: `prompts/study/*.md` を別LLMへ渡して生成する「プロンプト入力前提」工程
- Build Text / Build Project / Build Audio: `bun run ...` で実行する「CLI操作前提」工程

## End-to-End Flow (Mermaid)

```mermaid
flowchart TB
  subgraph PromptFlow["Prompt入力前提 (Blueprint / Variables / Script)"]
    S["入力ソース<br/>inputs/books/\*/source/\*.md"]
    BCFG["book config<br/>configs/books/${book-id}.json"]
    P1["Blueprint Prompt<br/>prompts/study/blueprint.md"]
    O1["blueprint/book_blueprint.json"]
    P2["Variables Prompt<br/>prompts/study/episode_variables.md"]
    O2["variables/E##_variables.json"]
    P3["Script Prompt<br/>prompts/study/script_common_frame.md"]
    O3["script/E##_script.md"]
    S --> P1
    BCFG --> P1
    P1 --> O1
    O1 --> P2
    BCFG --> P2
    P2 --> O2
    O2 --> P3
    P3 --> O3
  end

  subgraph CliFlow["CLI操作前提 (Build Text / Build Project / Build Audio)"]
    C0["(任意) prepare-run<br/>bun run prepare-run"]
    C1["build-text<br/>bun run build-text"]
    C2["build-project<br/>bun run build-project"]
    C3["build-audio<br/>bun run build-audio"]
    O4["voicevox_text/E##_voicevox_text.json<br/>voicevox_text/E##_voicevox.txt<br/>dict_candidates/E##_dict_candidates.csv"]
    O5["voicevox_project/E##_voicevox_import.json<br/>voicevox_project/E##.vvproj"]
    O6["audio/E##.wav<br/>audio/E##.mp3 (default)<br/>audio/manifest.json"]
    C0 --> C1
    C1 --> O4
    O4 --> C2
    C2 --> O5
    O5 --> C3
    C3 --> O6
  end

  CFG4["build-text config<br/>configs/voicevox/build_text_config.json"]
  CFG5P["voice profile<br/>configs/voicevox/default_profile.json<br/>(or .example.json)"]
  CFG5S["character map (optional)<br/>configs/voicevox/default_character_map.json"]
  VXURL["VOICEVOX URL<br/>--voicevox-url / VOICEVOX_URL"]
  VXAPI["VOICEVOX Engine API<br/>/audio_query, /synthesis"]
  VXSCRIPT["運用スクリプト<br/>scripts/voicevox-\*.sh<br/>docker-compose.voicevox.yml"]

  O3 --> C0
  O3 --> C1
  CFG4 --> C1
  CFG5P --> C2
  CFG5S --> C2
  VXURL --> C2
  VXURL --> C3
  VXSCRIPT --> VXAPI
  C2 --> VXAPI
  C3 --> VXAPI

  classDef prompt fill:#fff2cc,stroke:#8a6d3b,color:#3a2a14;
  classDef cli fill:#d9edf7,stroke:#31708f,color:#1b4f72;
  classDef cfg fill:#f7f7f9,stroke:#777,color:#222;
  classDef out fill:#e8f5e9,stroke:#2e7d32,color:#1b5e20;
  class S,BCFG,P1,P2,P3 prompt;
  class C0,C1,C2,C3 cli;
  class CFG4,CFG5P,CFG5S,VXURL,VXAPI,VXSCRIPT cfg;
  class O1,O2,O3,O4,O5,O6 out;
```

## 設定ファイル/入力方式の対応

| 項目 | 主に使う工程 | 前提 | 役割 |
| --- | --- | --- | --- |
| `prompts/study/blueprint.md` | Blueprint | プロンプト入力前提 | 書籍全体Blueprintを生成 |
| `prompts/study/episode_variables.md` | Episode Variables | プロンプト入力前提 | エピソード変数JSONを生成 |
| `prompts/study/script_common_frame.md` | Script | プロンプト入力前提 | 固定構成1-8の台本を生成 |
| `configs/books/<book-id>.json` | Blueprint / Variables | プロンプト入力前提 | Promptのプレースホルダ値を供給 |
| `configs/voicevox/build_text_config.json` | `build-text` | CLI操作前提 | 読み上げやすさ評価とpause計算のしきい値 |
| `configs/voicevox/default_profile.json` | `build-project` | CLI操作前提 | 話者デフォルト値とqueryDefaults |
| `configs/voicevox/default_profile.example.json` | `build-project` | CLI操作前提 | `default_profile.json` 未作成時のフォールバック |
| `configs/voicevox/default_character_map.json` | `build-project` | CLI操作前提 | `character_key` ごとの声設定（`speaker_key` / `--character-key` 利用時は必須） |
| `--voicevox-url` / `VOICEVOX_URL` | `build-project`/`build-audio` | CLI操作前提 | VOICEVOX Engine接続先を指定 |
| `ffmpeg` (`--ffmpeg-path`) | `build-audio` | CLI操作前提 | WAV を mp3/m4a/ogg へ圧縮変換 |
| `scripts/voicevox-up.sh` など | Engine起動/疎通確認 | CLI操作前提 | Docker上のVOICEVOX Engine運用補助 |

補足:

- `configs/voicevox/dictionary_rules.yaml` と `configs/voicevox/punctuation_rules.yaml` は planned コメントのみで、現行実装では未参照です。

## CLIでの実データ生成ポイント

| コマンド | 必須入力 | 主な自動推論 | 出力 |
| --- | --- | --- | --- |
| `render-prompt` | `--genre`, `--step`, `--book-config` | なし（`variables` のみ `--episode-id` 上書き可） | 解決済みプロンプトを stdout 出力 |
| `build-text` | `--script script/E##_script.md` | `--run-dir` は `.../run-.../script/...` なら推論。`--episode-id` 未指定時はファイル名 `E##_script.md` から推論。 | `voicevox_text/*.json`, `voicevox_text/*.txt`, `dict_candidates/*.csv` |
| `build-project` | `--voicevox-text-json voicevox_text/E##_voicevox_text.json` | `--run-dir` を `.../voicevox_text/...` から推論。profileは `default_profile.json` を優先し、なければ `.example.json`。 | `voicevox_project/*_voicevox_import.json`, `voicevox_project/*.vvproj` |
| `build-audio` | `--vvproj voicevox_project/E##.vvproj` | `--run-dir` を `.../voicevox_project/...` から推論。圧縮は `--compressed-format` / `--compressed-bitrate-kbps` で変更可。 | `audio/E##.wav`, `audio/E##.(mp3|m4a|ogg)`, `audio/manifest.json` |

## 現状ステータス

- Blueprint / Variables / Script は prompt資産中心（`skills/gen-*` または別LLM運用）。
- Build Text / Build Project / Build Audio は `src/cli/main.ts` から実行可能。
- `check-run` は Blueprint/Variables schema と Script 台本構造（1-8章）を検証する補助コマンド。
