# Pipeline Architecture

最終更新: 2026-02-15

このリポジトリの音声データ生成は、次の2レイヤーで進みます。

- Stage 1-3: `prompts/study/*.md` を別LLMへ渡して生成する「プロンプト入力前提」工程
- Stage 4-6: `bun run ...` で実行する「CLI操作前提」工程

## End-to-End Flow (Mermaid)

```mermaid
flowchart TB
  subgraph PromptFlow["Prompt入力前提 (Stage 1-3)"]
    S["入力ソース<br/>inputs/books/\*/source/\*.md"]
    BCFG["book config<br/>configs/books/${book-id}.json"]
    P1["Stage1 Prompt<br/>prompts/study/stage1_blueprint.md"]
    O1["stage1/book_blueprint.json"]
    P2["Stage2 Prompt<br/>prompts/study/stage2_episode_variables.md"]
    O2["stage2/E##_variables.json"]
    P3["Stage3 Prompt<br/>prompts/study/stage3_script_common_frame.md"]
    O3["stage3/E##_script.md"]
    S --> P1
    BCFG --> P1
    P1 --> O1
    O1 --> P2
    BCFG --> P2
    P2 --> O2
    O2 --> P3
    P3 --> O3
  end

  subgraph CliFlow["CLI操作前提 (Stage 4-6)"]
    C0["(任意) prepare-run<br/>bun run prepare-run"]
    C1["Stage4 build-text<br/>bun run build-text"]
    C2["Stage5 build-project<br/>bun run build-project"]
    C3["Stage6 build-audio<br/>bun run build-audio"]
    O4["voicevox_text/E##_voicevox_text.json<br/>voicevox_text/E##_voicevox.txt<br/>dict_candidates/E##_dict_candidates.csv"]
    O5["voicevox_project/E##_voicevox_import.json<br/>voicevox_project/E##.vvproj"]
    O6["audio/E##.wav<br/>audio/manifest.json"]
    C0 --> C1
    C1 --> O4
    O4 --> C2
    C2 --> O5
    O5 --> C3
    C3 --> O6
  end

  CFG4["stage4 config<br/>configs/voicevox/stage4_text_config.json"]
  CFG5P["voice profile<br/>configs/voicevox/default_profile.json<br/>(or .example.json)"]
  CFG5S["speaker map<br/>configs/voicevox/default_speaker_map.json<br/>(or .example.json)"]
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
| `prompts/study/stage1_blueprint.md` | Stage 1 | プロンプト入力前提 | 書籍全体Blueprintを生成 |
| `prompts/study/stage2_episode_variables.md` | Stage 2 | プロンプト入力前提 | エピソード変数JSONを生成 |
| `prompts/study/stage3_script_common_frame.md` | Stage 3 | プロンプト入力前提 | 固定構成1-8の台本を生成 |
| `configs/books/<book-id>.json` | Stage 1-2 | プロンプト入力前提 | Promptのプレースホルダ値を供給 |
| `configs/voicevox/stage4_text_config.json` | `build-text` | CLI操作前提 | 読み上げやすさ評価とpause計算のしきい値 |
| `configs/voicevox/default_profile.json` | `build-project` | CLI操作前提 | 話者デフォルト値とqueryDefaults |
| `configs/voicevox/default_profile.example.json` | `build-project` | CLI操作前提 | `default_profile.json` 未作成時のフォールバック |
| `configs/voicevox/default_speaker_map.json` | `build-project` | CLI操作前提 | `speaker_key` ごとの声設定 |
| `configs/voicevox/default_speaker_map.example.json` | `build-project` | CLI操作前提 | speaker map の共有テンプレート |
| `--voicevox-url` / `VOICEVOX_URL` | `build-project`/`build-audio` | CLI操作前提 | VOICEVOX Engine接続先を指定 |
| `scripts/voicevox-up.sh` など | Engine起動/疎通確認 | CLI操作前提 | Docker上のVOICEVOX Engine運用補助 |

補足:

- `configs/voicevox/default_speaker_map.yaml` は deprecated プレースホルダです（JSON版を使用）。
- `configs/voicevox/dictionary_rules.yaml` と `configs/voicevox/punctuation_rules.yaml` は planned コメントのみで、現行実装では未参照です。

## CLIでの実データ生成ポイント

| コマンド | 必須入力 | 主な自動推論 | 出力 |
| --- | --- | --- | --- |
| `build-text` | `--script stage3/E##_script.md` | `--run-dir` は `.../run-.../stage3/...` なら推論。`--episode-id` 未指定時はファイル名 `E##_script.md` から推論。 | `voicevox_text/*.json`, `voicevox_text/*.txt`, `dict_candidates/*.csv` |
| `build-project` | `--stage4-json voicevox_text/E##_voicevox_text.json` | `--run-dir` を `.../voicevox_text/...` から推論。profileは `default_profile.json` を優先し、なければ `.example.json`。 | `voicevox_project/*_voicevox_import.json`, `voicevox_project/*.vvproj` |
| `build-audio` | `--stage5-vvproj voicevox_project/E##.vvproj` | `--run-dir` を `.../voicevox_project/...` から推論。 | `audio/E##.wav`, `audio/manifest.json` |

## 現状ステータス

- Stage 1-3 は prompt資産中心（実行は別LLM運用）。
- Stage 4-6 は `src/cli/main.ts` から実行可能。
- `check-run` は Stage 1/2 schema と Stage 3 台本構造（1-8章 + 合計想定時間）を検証する補助コマンド。
