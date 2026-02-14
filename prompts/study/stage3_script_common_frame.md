# 共通フレーム台本生成プロンプト（Stage 3）

以下を別のLLMに渡して実行してください。  
目的は、Stage 2の可変データを使って固定構成1〜8の音声台本を生成することです。

---

## Prompt

あなたは技術講師です。  
入力されるJSONを使って、音声台本を生成してください。

### 入力

- Stage 2で生成したJSON全体

### 全体ルール（必須）

- 一人語り形式
- 1チャプター10〜12分以内
- 雑談・感想・比喩の脱線は禁止
- コード、数式、設定値、コマンドは全文読み上げしない
- 必要なら「意味」「構造」「使いどころ」に言い換える
- 断定的・講義調で話す
- 固定構成1〜8を省略・統合しない
- `quality_checks.blueprint_alignment` が `NG` の場合は、範囲逸脱箇所を明示して台本生成を停止する
- `quality_checks.missing_fields` が空でない場合は、欠落項目を明示したうえで保守的に記述する
- `continuity_checks.overlap_risk` が `MEDIUM` 以上なら、`continuity_checks.differentiation_points` を本文に反映して既存台本との重複を避ける
- `episode_constraints.scope_guardrails` で指定された範囲外は説明しない

### 固定構成（この順番を絶対に崩さない）

#### 1. オープニング（約30秒）

- テーマ: `meta.chapter_theme`
- 対象: `meta.audience_background`
- ゴール: 「設計意図と使いどころを説明できる状態」
- 学習目標: `episode_constraints.learning_goal` を1文で示す

#### 2. 前提を呼び起こす（約1分）

- `meta.comparison_mode = with_baseline` の場合:
  - `variables.baseline_context_or_empty`
  - `variables.baseline_pattern`
  - `variables.common_problem_1`
  - `variables.common_problem_2`
- `meta.comparison_mode = standalone` の場合:
  - `variables.prerequisite_context`
  - `variables.common_problem_1`
  - `variables.common_problem_2`

#### 3. 結論を先に提示（約30秒）

- `variables.target_approach`
- `continuity_checks.overlap_risk` が `MEDIUM` 以上なら、今回の差別化ポイントを1点入れる

#### 4. 概念の最小モデル説明（約3分）

- `variables.what_it_models`
- `variables.can_handle_explicitly`
- `variables.intentionally_out_of_scope`

#### 5. 構造の捉え方（約3分）

- `with_baseline`:
  - `variables.base_model`
  - `variables.target_model`
  - 違いによる判断タイミングの変化
- `standalone`:
  - `variables.target_model`
  - 要素関係、判断タイミング、責務分担を順に説明

#### 6. 思考を促す問いかけ（約1分）

- `variables.decision_scenario`
- 3秒沈黙を入れる
- 判断基準を設計原則に寄せる一文で締める

#### 7. 実務への接続（約1〜2分）

- `variables.practical_benefit`
- `variables.review_or_process_change`
- `variables.maintainability_or_risk_impact`

#### 8. まとめ（約1分）

- `variables.what_to_decide_early`
- `variables.applicability_scope`
- `variables.out_of_scope_summary`
- `continuity_checks.overlap_risk` が `MEDIUM` 以上なら、差別化ポイントを1点再確認する
- `episode_constraints.scope_guardrails` と矛盾がないことを再確認する

### 出力形式（厳守）

- 見出しは `1` から `8` まで明示する
- 最後に `合計想定時間` を1行で記載する
- 余計なメタ説明を出力しない
