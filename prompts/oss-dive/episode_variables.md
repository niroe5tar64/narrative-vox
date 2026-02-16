# Episode Variables（エピソード変数）

以下を別のLLMに渡して実行してください。
目的は、Blueprintで作成した設計図の指定エピソードに対して、台本生成用の可変データをリポジトリのコードから抽出することです。

---

## Prompt

あなたは**OSSコードリーディング分析者**です。
出力は音声台本の「可変データ定義(JSON)」です。まだ台本本文は作成しません。

### 入力

- Blueprint JSON: `{{PROJECT_BLUEPRINT_JSON_PATH}}`
- 対象エピソードID: `{{EPISODE_ID}}`
- リポジトリルートパス: `{{REPO_ROOT_PATH}}`
- 深掘りフォーカス: `{{DEEP_DIVE_FOCUS}}`
- 想定リスナー（任意上書き・空文字なら未指定扱い）:
  - 背景: `{{AUDIENCE_BACKGROUND}}`
  - 習熟度: `{{AUDIENCE_LEVEL}}`
  - 関心: `{{AUDIENCE_INTEREST}}`
- 比較対象（任意上書き）: `{{BASELINE_CONTEXT_OR_EMPTY}}`
- 既存audio-scriptディレクトリ（任意）: `{{EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY}}`

### 前提

- `{{EPISODE_ID}}` は Blueprint の `episode_plan` に存在すること
- テーマ範囲は `episode_plan[*].target_theme_ids` から逸脱しないこと

### タスク

1. Blueprintから `{{EPISODE_ID}}` を特定し、対象テーマ・学習目標・参照範囲を取得する。
2. Blueprint の `source_refs`（ファイルパス / ディレクトリパス）から `{{REPO_ROOT_PATH}}` 内の実際のコードを読む。
3. エピソード範囲内で、音声で伝えるべき核心を3〜5点に要約する。
4. 固定フレーム1〜8に必要な可変項目を埋める（下記の変数マッピング参照）。
5. 情報不足の項目は `MISSING` とし、推測で埋めない。
6. 比較対象が空なら、比較用項目を `N/A` にする。
7. `EXISTING_AUDIO_SCRIPT_DIR_OR_EMPTY` が指定されている場合、既存台本テキストから既出テーマを抽出し、今回テーマとの重複リスクを判定する。
8. 重複リスクが `MEDIUM` 以上なら、差別化ポイントを1〜3個作る。

### 変数マッピング（OSS向け解釈）

| 変数名 | OSS文脈での意味 |
|---|---|
| `prerequisite_context` | このモジュール/テーマを理解するための前提知識 |
| `baseline_context_or_empty` | 類似OSSや一般的なアプローチ（比較対象がある場合） |
| `baseline_pattern` | 素朴な実装パターン / 従来のアプローチ |
| `common_problem_1` | その素朴な実装が抱える課題1 |
| `common_problem_2` | その素朴な実装が抱える課題2 |
| `target_approach` | このOSSが採用したアプローチの核心 |
| `what_it_models` | 主要な抽象化 / データモデル / 中核概念 |
| `can_handle_explicitly` | この設計で可能になること |
| `intentionally_out_of_scope` | このOSSが意図的に扱わないこと / 割り切っていること |
| `base_model` | 比較元の設計モデル（従来のやり方 / 類似OSS） |
| `target_model` | このOSSの設計モデル |
| `decision_scenario` | このOSSを採用・参考にする際の判断ポイント |
| `practical_benefit` | 実プロジェクトでの具体的メリット |
| `review_or_process_change` | コードレビューや開発プロセスへの影響 |
| `maintainability_or_risk_impact` | 保守性やリスクへの影響 |
| `what_to_decide_early` | 採用前に決めておくべきこと |
| `applicability_scope` | どんなプロジェクトに向いているか |
| `out_of_scope_summary` | 適用範囲外のまとめ |

### 出力形式（JSONのみ）

```json
{
  "meta": {
    "project_title": "",
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
      "src/module_or_dir/file.ts"
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
- `source_coverage` は、`source_refs` のファイルを実際に読んで根拠がある項目が8割以上なら `OK`
- `audio_suitability` は、コード全文の読み上げに依存する説明が中心なら `NG`

### 禁止事項

- 台本本文を出力しない
- JSON以外を出力しない
- コードを読まずに推測で穴埋めしない
