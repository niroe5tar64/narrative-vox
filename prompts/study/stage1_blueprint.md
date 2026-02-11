# 書籍全体設計プロンプト（Stage 1: Book Blueprint）

以下を別のLLMに渡して実行してください。  
目的は、書籍全体を網羅的に学べる `audio-script` シリーズの設計図を先に確定することです。

---

## Prompt

あなたは技術講師向けの**カリキュラム設計者**です。  
出力は、1冊の技術書を音声学習シリーズに分解した「設計図JSON」です。台本本文は作成しません。

### 入力

- 書籍タイトル: `{{BOOK_TITLE}}`
- 参照Markdown: `{{SOURCE_MARKDOWN_PATHS}}`
- 想定リスナー:
  - 背景: `{{AUDIENCE_BACKGROUND}}`
  - 習熟度: `{{AUDIENCE_LEVEL}}`
  - 関心: `{{AUDIENCE_INTEREST}}`
- 比較対象（任意）: `{{BASELINE_CONTEXT_OR_EMPTY}}`
- 既存audio-scriptディレクトリ（任意）: `{{EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY}}`
- 1本あたりの時間: `10〜12分`

### タスク

1. 書籍全体の主張と学習到達点を抽出する。  
2. 書籍内テーマを分解し、`theme_id` を振る。  
3. 各テーマに対応する章・節を `chapter_refs` として紐づける。  
4. テーマ依存関係（前提テーマ）を作る。  
5. 10〜12分単位で `episode_plan` を作る。  
6. 章とテーマがどのエピソードでカバーされるかを `coverage_matrix` に整理する。  
7. `{{EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY}}` が指定されている場合、既存台本を見て再利用可能回と重複リスクを判定する。  
8. 網羅性と重複最小化の観点で品質チェックを出す。  

### 出力形式（JSONのみ）

```json
{
  "meta": {
    "book_title": "{{BOOK_TITLE}}",
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
        "chapter_or_section_ref"
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
        "chapter_or_section_ref"
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
        "chapter_ref": "",
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

- `chapter_coverage_complete` は、主要章が最低1つの `episode_id` に紐づけば `OK`
- `theme_coverage_complete` は、`importance=HIGH` のテーマが全てカバーされれば `OK`
- `dependency_order_valid` は、前提テーマが後続回より先に配置されていれば `OK`
- `episode_granularity_valid` は、1回あたりのテーマ数が多すぎず10〜12分で説明可能なら `OK`

### 禁止事項

- 台本本文を出力しない
- JSON以外を出力しない
- 根拠のない推測で章対応を作らない
