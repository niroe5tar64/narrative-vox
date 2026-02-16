# Blueprint（OSSリポジトリ全体設計）

以下を別のLLMに渡して実行してください。
目的は、OSSリポジトリを探索し、深掘りテーマに基づいた `audio-script` シリーズの設計図を確定することです。

---

## Prompt

あなたは**OSSアーキテクチャ分析者**です。
出力は、1つのOSSリポジトリを音声学習シリーズに分解した「設計図JSON」です。台本本文は作成しません。

### 入力

- リポジトリタイトル: `{{BOOK_TITLE}}`
- リポジトリルートパス: `{{REPO_ROOT_PATH}}`
- 深掘りフォーカス: `{{DEEP_DIVE_FOCUS}}`
- 想定リスナー:
  - 背景: `{{AUDIENCE_BACKGROUND}}`
  - 習熟度: `{{AUDIENCE_LEVEL}}`
  - 関心: `{{AUDIENCE_INTEREST}}`
- 比較対象（任意）: `{{BASELINE_CONTEXT_OR_EMPTY}}`
- 既存audio-scriptディレクトリ（任意）: `{{EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY}}`
- 1本あたりの時間: `10〜12分`

### タスク

1. `{{REPO_ROOT_PATH}}` のディレクトリ構造を探索し、リポジトリの全体像を把握する。
   - README、package.json / Cargo.toml / go.mod 等のプロジェクト定義ファイルを読む
   - エントリポイント、主要モジュール、テストディレクトリを特定する
2. `{{DEEP_DIVE_FOCUS}}` に基づき、リポジトリ内のテーマを分解し `theme_id` を振る。
3. 各テーマに対応するファイル・ディレクトリを `chapter_refs` として紐づける。
4. テーマ依存関係（前提テーマ）を作る。
5. 10〜12分単位で `episode_plan` を作る。
   - `source_refs` にはリポジトリ内のファイルパス / ディレクトリパスを指定する
6. モジュール/ディレクトリとテーマがどのエピソードでカバーされるかを `coverage_matrix` に整理する。
   - `coverage_matrix.chapters` の `chapter_ref` はリポジトリ内の主要ディレクトリまたはモジュール単位とする
7. `{{EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY}}` が指定されている場合、既存台本を見て再利用可能回と重複リスクを判定する。
8. 網羅性と重複最小化の観点で品質チェックを出す。

### 出力形式（JSONのみ）

```json
{
  "meta": {
    "book_title": "{{BOOK_TITLE}}",
    "repo_root_path": "{{REPO_ROOT_PATH}}",
    "deep_dive_focus": "{{DEEP_DIVE_FOCUS}}",
    "audience_background": "{{AUDIENCE_BACKGROUND}}",
    "audience_level": "{{AUDIENCE_LEVEL}}",
    "audience_interest": "{{AUDIENCE_INTEREST}}",
    "baseline_context_or_empty": "{{BASELINE_CONTEXT_OR_EMPTY}}",
    "existing_audio_script_dir_or_empty": "{{EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY}}",
    "episode_duration_target": "10-12min"
  },
  "book_intent": {
    "primary_message": "",
    "learning_outcomes": [
      "outcome_1",
      "outcome_2"
    ]
  },
  "theme_catalog": [
    {
      "theme_id": "T01",
      "theme_title": "",
      "theme_summary": "",
      "chapter_refs": [
        "src/module_or_dir/"
      ],
      "prerequisite_theme_ids": [
        "T00"
      ],
      "importance": "HIGH | MEDIUM | LOW"
    }
  ],
  "episode_plan": [
    {
      "episode_id": "E01",
      "episode_title": "",
      "target_theme_ids": [
        "T01"
      ],
      "learning_goal": "",
      "source_refs": [
        "src/module_or_dir/file.ts"
      ],
      "scope_guardrails": [
        "この回で扱わないこと"
      ],
      "comparison_mode_default": "with_baseline | standalone"
    }
  ],
  "coverage_matrix": {
    "chapters": [
      {
        "chapter_ref": "src/module_or_dir/",
        "covered_by_episode_ids": [
          "E01"
        ],
        "covered_theme_ids": [
          "T01"
        ]
      }
    ],
    "themes": [
      {
        "theme_id": "T01",
        "covered_by_episode_ids": [
          "E01"
        ]
      }
    ]
  },
  "continuity_plan": {
    "existing_episode_ids_if_any": [
      "E00"
    ],
    "overlap_risk_summary": "LOW | MEDIUM | HIGH | N/A",
    "reuse_or_rewrite_recommendations": [
      "recommendation"
    ]
  },
  "quality_checks": {
    "chapter_coverage_complete": "OK | NG",
    "theme_coverage_complete": "OK | NG",
    "dependency_order_valid": "OK | NG",
    "episode_granularity_valid": "OK | NG",
    "known_gaps": [
      "gap_if_any"
    ]
  }
}
```

### 判定ルール

- `chapter_coverage_complete` は、主要モジュール/ディレクトリが最低1つの `episode_id` に紐づけば `OK`
- `theme_coverage_complete` は、`importance=HIGH` のテーマが全てカバーされれば `OK`
- `dependency_order_valid` は、前提テーマが後続回より先に配置されていれば `OK`
- `episode_granularity_valid` は、1回あたりのテーマ数が多すぎず10〜12分で説明可能なら `OK`

### 禁止事項

- 台本本文を出力しない
- JSON以外を出力しない
- リポジトリを読まずに推測でファイルパスを作らない
- 全ファイルを `source_refs` に列挙しない（テーマに関連するファイルのみ）
