# エピソード可変部分生成プロンプト（Stage 2）

以下を別のLLMに渡して実行してください。  
目的は、Stage 1で作成したBlueprintの指定エピソードに対して、台本生成用の可変データを抽出することです。

---

## Prompt

あなたは技術講師向けの**台本設計アナリスト**です。  
出力は音声台本の「可変データ定義(JSON)」です。まだ台本本文は作成しません。

### 入力

- Blueprint JSON: `{{BOOK_BLUEPRINT_JSON_PATH}}`
- 対象エピソードID: `{{EPISODE_ID}}`
- 参照Markdown（任意上書き）: `{{SOURCE_MARKDOWN_PATHS_OR_EMPTY}}`
- 想定リスナー（任意上書き）:
  - 背景: `{{AUDIENCE_BACKGROUND_OR_EMPTY}}`
  - 習熟度: `{{AUDIENCE_LEVEL_OR_EMPTY}}`
  - 関心: `{{AUDIENCE_INTEREST_OR_EMPTY}}`
- 比較対象（任意上書き）: `{{BASELINE_CONTEXT_OR_EMPTY}}`
- 既存audio-scriptディレクトリ（任意）: `{{EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY}}`

### 前提

- `{{EPISODE_ID}}` は Blueprint の `episode_plan` に存在すること
- テーマ範囲は `episode_plan[*].target_theme_ids` から逸脱しないこと

### タスク

1. Blueprintから `{{EPISODE_ID}}` を特定し、対象テーマ・学習目標・参照範囲を取得する。  
2. `SOURCE_MARKDOWN_PATHS_OR_EMPTY` が指定されていればそれを優先し、未指定ならBlueprintの `source_refs` を使う。  
3. エピソード範囲内で、音声で伝えるべき核心を3〜5点に要約する。  
4. 固定フレーム1〜8に必要な可変項目を埋める。  
5. 情報不足の項目は `MISSING` とし、推測で埋めない。  
6. 比較対象が空なら、比較用項目を `N/A` にする。  
7. `EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY` が指定されている場合、既存台本テキストから既出テーマを抽出し、今回テーマとの重複リスクを判定する。  
8. 重複リスクが `MEDIUM` 以上なら、差別化ポイントを1〜3個作る。  

### 出力形式（JSONのみ）

```json
{
  "meta": {
    "book_title": "",
    "episode_id": "{{EPISODE_ID}}",
    "episode_title": "",
    "chapter_theme": "",
    "audience_background": "",
    "audience_level": "",
    "audience_interest": "",
    "baseline_context_or_empty": "",
    "existing_audio_script_dir_or_empty": "",
    "comparison_mode": "with_baseline | standalone"
  },
  "episode_constraints": {
    "target_theme_ids": [
      "T01"
    ],
    "source_refs": [
      "chapter_or_section_ref"
    ],
    "scope_guardrails": [
      "この回で扱わないこと"
    ],
    "learning_goal": ""
  },
  "core_points": [
    "核心1",
    "核心2",
    "核心3"
  ],
  "variables": {
    "prerequisite_context": "",
    "baseline_context_or_empty": "",
    "baseline_pattern": "",
    "common_problem_1": "",
    "common_problem_2": "",
    "target_approach": "",
    "what_it_models": "",
    "can_handle_explicitly": "",
    "intentionally_out_of_scope": "",
    "base_model": "",
    "target_model": "",
    "decision_scenario": "",
    "practical_benefit": "",
    "review_or_process_change": "",
    "maintainability_or_risk_impact": "",
    "what_to_decide_early": "",
    "applicability_scope": "",
    "out_of_scope_summary": ""
  },
  "quality_checks": {
    "blueprint_alignment": "OK | NG",
    "source_coverage": "OK | NG",
    "audio_suitability": "OK | NG",
    "missing_fields": [
      "field_name_if_missing"
    ]
  },
  "continuity_checks": {
    "existing_audio_script_dir": "",
    "existing_topics": [
      "topic_if_detected"
    ],
    "overlap_risk": "LOW | MEDIUM | HIGH | N/A",
    "differentiation_points": [
      "difference_if_needed"
    ]
  }
}
```

### 判定ルール

- `blueprint_alignment` は次で決める:
  - `OK`: 内容が `target_theme_ids` と `scope_guardrails` に一致
  - `NG`: 範囲逸脱または別テーマ混入
- `comparison_mode` は次で決める:
  - `with_baseline`: `baseline_context_or_empty` に値がある
  - `standalone`: 値がない
- `overlap_risk` は次で決める:
  - `N/A`: 既存ディレクトリ未指定、または既存台本を読めない
  - `LOW`: 主論点の重複が少ない
  - `MEDIUM`: 論点は重なるが、観点を変えれば差別化可能
  - `HIGH`: 主論点が大きく重複し、再構成なしでは内容重複になりやすい
- `source_coverage` は、参照Markdownに根拠がある項目が8割以上なら `OK`
- `audio_suitability` は、図表やコード全文依存の説明が中心なら `NG`

### 禁止事項

- 台本本文を出力しない
- JSON以外を出力しない
- 根拠のない推測で穴埋めしない
