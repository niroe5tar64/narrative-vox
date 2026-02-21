# Pipeline Architecture

最終更新: 2026-02-20

このリポジトリの音声データ生成は、次の2レイヤーで進みます。

- Blueprint / Material / Script / Digest: Skills (`/gen-*`) で LLM を使って生成する「プロンプト入力前提」工程
- Build Text / Build Project / Build Audio: `bun run ...` で実行する「CLI操作前提」工程

## End-to-End Flow (Mermaid)

```mermaid
flowchart TB
  subgraph PromptFlow["Layer 1: LLM駆動 (Blueprint / Material / Script / Digest)"]
    S["入力ソース<br/>inputs/books/\*/source/\*.md"]
    PCFG["project config<br/>configs/projects/${project-id}.json"]
    STY["content style<br/>configs/styles/${STYLE_ID}.json"]
    CHR["characters<br/>configs/characters/*.json"]
    P1["gen-blueprint"]
    O1["blueprint/project_blueprint.json"]
    P2["gen-material"]
    O2["material/E##_material.json"]
    P3["gen-script"]
    O3["script/E##_script.md"]
    P4["gen-digest"]
    O4D["context/E##_episode_digest.json"]
    S --> P1
    PCFG --> P1
    P1 --> O1
    O1 --> P2
    PCFG --> P2
    P2 --> O2
    O2 --> P3
    STY --> P3
    CHR --> P3
    O4D --> P3
    P3 --> O3
    O3 --> P4
    O2 --> P4
    P4 --> O4D
  end

  subgraph CliFlow["Layer 2: CLI操作前提 (Build Text / Build Project / Build Audio)"]
    C0["(任意) prepare-run<br/>bun run prepare-run"]
    C1["build-text<br/>bun run build-text"]
    C2["build-project<br/>bun run build-project"]
    C3["build-audio<br/>bun run build-audio"]
    O4["voicevox_text/E##_voicevox_text.json<br/>voicevox_text/E##_voicevox.txt<br/>dict_candidates/E##_dict_candidates.csv"]
    O5["voicevox_project/E##_voicevox_import.json<br/>voicevox_project/E##.vvproj<br/>voicevox_project/E##_project_meta.json"]
    O6["audio/E##.wav<br/>audio/E##.mp3 (default)<br/>audio/manifest.json"]
    C0 --> C1
    C1 --> O4
    O4 --> C2
    C2 --> O5
    O5 --> C3
    C3 --> O6
  end

  CFG4["build-text config<br/>configs/voicevox/build_text_config.json"]
  CFG5P["synthesis defaults<br/>configs/voicevox/synthesis_defaults.json"]
  CFG5S["character map (optional)<br/>configs/voicevox/default_character_map.json"]
  VXURL["VOICEVOX URL<br/>--voicevox-url / VOICEVOX_URL"]
  VXAPI["VOICEVOX Engine API<br/>/audio_query, /synthesis"]
  VXSCRIPT["運用スクリプト<br/>tools/scripts/voicevox-\*.sh<br/>docker-compose.voicevox.yml"]

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
  class S,PCFG,STY,CHR,P1,P2,P3,P4 prompt;
  class C0,C1,C2,C3 cli;
  class CFG4,CFG5P,CFG5S,VXURL,VXAPI,VXSCRIPT cfg;
  class O1,O2,O3,O4D,O4,O5,O6 out;
```

## 設定ファイル/入力方式の対応

| 項目 | 主に使う工程 | 前提 | 役割 |
| --- | --- | --- | --- |
| `prompts/tech_explainer/blueprint.md` | Blueprint | プロンプト入力前提 | 書籍全体Blueprintを生成 |
| `prompts/tech_explainer/episode_material.md` | Episode Material | プロンプト入力前提 | エピソード素材JSONを生成 |
| `prompts/tech_explainer/script_common_frame.md` | Script | プロンプト入力前提 | 台本を生成（セクション数は演出層が決定） |
| `configs/projects/<project-id>.json` | Blueprint / Material | プロンプト入力前提 | Promptのプレースホルダ値を供給（STYLE_ID, CAST 含む） |
| `configs/styles/<style-id>.json` | Script | プロンプト入力前提 | 「どう語るか」のパラメータ（format, pacing, language 等） |
| `configs/characters/*.json` | Script / Digest | プロンプト入力前提 | キャラクター定義（voice + profile） |
| `configs/voicevox/build_text_config.json` | `build-text` | CLI操作前提 | 読み上げやすさ評価とpause計算のしきい値 |
| `configs/voicevox/synthesis_defaults.json` | `build-project` | CLI操作前提 | `--synthesis-defaults` 未指定時に読み込む query/テンポ既定値 |
| `configs/voicevox/synthesis_defaults.example.json` | `build-project` | CLI操作前提 | テンプレート。利用時は `--synthesis-defaults` で明示指定 |
| `configs/voicevox/default_character_map.json` | `build-project` | CLI操作前提 | `character_key` ごとの声設定（`speaker_key` / `--character-key` 利用時は必須） |
| `--voicevox-url` / `VOICEVOX_URL` | `build-project`/`build-audio` | CLI操作前提 | VOICEVOX Engine接続先を指定 |
| `ffmpeg` (`--ffmpeg-path`) | `build-audio` | CLI操作前提 | WAV を mp3/m4a/ogg へ圧縮変換 |
| `tools/scripts/voicevox-up.sh` など | Engine起動/疎通確認 | CLI操作前提 | Docker上のVOICEVOX Engine運用補助 |

## CLIでの実データ生成ポイント

| コマンド | 必須入力 | 主な自動推論 | 出力 |
| --- | --- | --- | --- |
| `render-prompt` | `--genre`, `--step`, `--project-config` | なし（`material` のみ `--episode-id` 上書き可） | 解決済みプロンプトを stdout 出力 |
| `build-text` | `--script script/E##_script.md` | `--run-dir` は `.../run-.../script/...` なら推論。`--episode-id` 未指定時はファイル名 `E##_script.md` から推論。 | `voicevox_text/*.json`, `voicevox_text/*.txt`, `dict_candidates/*.csv` |
| `build-project` | `--voicevox-text-json voicevox_text/E##_voicevox_text.json` | `--run-dir` を `.../voicevox_text/...` から推論。`--synthesis-defaults` 未指定時は `synthesis_defaults.json` を使用（未作成ならエラー）。 | `voicevox_project/*_voicevox_import.json`, `voicevox_project/*.vvproj`, `voicevox_project/*_project_meta.json` |
| `build-audio` | `--vvproj voicevox_project/E##.vvproj` | `--run-dir` を `.../voicevox_project/...` から推論。圧縮は `--compressed-format` / `--compressed-bitrate-kbps` で変更可。 | `audio/E##.wav`, `audio/E##.(mp3|m4a|ogg)`, `audio/manifest.json` |

補足:

- `build-project` の話者解決は synthesis defaults から voice を解決しません。`speaker_key`/`--character-key` + character map、または `--engine-id`/`--speaker-id`/`--style-id` の3指定が必要です。

## 現状ステータス

- Blueprint / Material / Script / Digest は Skills (`/gen-blueprint`, `/gen-material`, `/gen-script`, `/gen-digest`) で LLM 生成。
- Build Text / Build Project / Build Audio は `src/cli/main.ts` から実行可能。
- `check-run` は Blueprint/Material スキーマ、Digest スキーマ、Script 最低限構造、Style/Cast クロスバリデーションを検証する補助コマンド。
