---
name: gen-material
description: "Blueprint と project config を使って Episode Material（素材層JSON）を生成する。引数: [project-id] [episode-id]（例: /gen-material introducing-rescript E01）"
---

# gen-material

## 目的

Blueprint JSON と project config を入力として、指定エピソードの素材層データ（Episode Material JSON）を LLM で生成し、バリデーション済みファイルとして保存する。

素材層は「何を伝えるか」のみを扱い、「どう語るか」（演出・スタイル）は含めない。

## 引数

- `$0`: project-id（例: `introducing-rescript`）
- `$1`: episode-id（例: `E01`）

## 実行手順

### Step 1: project config 読み込み

1. `configs/pipeline/projects/$0.json` を読み込む。
2. `GENRE_ID` フィールドを確認する（例: `tech-explainer`）。
3. `EPISODE_ID` を `$1` で上書きする。
4. `STYLE_ID` と `CAST` フィールドは素材層では使用しない（演出層の責務）。

### Step 2: Blueprint 読み込み

1. project config の `PROJECT_BLUEPRINT_JSON_PATH` から Blueprint JSON を読み込む。
2. Blueprint の `episode_plan` に `$1` が存在することを確認する。存在しなければエラー報告して終了する。
3. 以下の情報を抽出する:
   - `episode_plan[$1].target_theme_ids`
   - `episode_plan[$1].learning_goal`
   - `episode_plan[$1].source_refs`
   - `episode_plan[$1].scope_guardrails`
   - `episode_plan[$1].episode_title`
   - `theme_catalog` から対象テーマの `theme_summary`
   - `project_intent.primary_message`

### Step 3: プロンプト解決

1. `prompts/{GENRE_ID}/episode-material.md` を読み込む。
2. `## Prompt` セクション以降のプレースホルダ `{{KEY}}` を project config の値（EPISODE_ID は上書き済み）で置換する。
3. ````json` コードブロック内のプレースホルダは置換しない。
4. 未解決プレースホルダが残っていればエラー報告して終了する。

### Step 4: LLM 実行

1. Step 3 で解決済みの `## Prompt` 以降をシステムプロンプトとして使用する。
2. Blueprint JSON 全体を添付コンテキストとして提供する。
3. ソースファイルの添付（GENRE_ID による分岐）:
   - `tech-explainer`: `SOURCE_MARKDOWN_PATHS` のグロブパターンでファイルを取得して添付する。
   - `oss-dive`: Blueprint の `episode_plan[$1].source_refs` に列挙されたパスを `REPO_ROOT_PATH` 配下で解決して添付する。
4. 出力は JSON のみ。
5. 素材層の要素は18種の type enum:
   `theme_introduction`, `prerequisite`, `baseline_pattern`, `problem_statement`, `core_thesis`, `concept`, `capability`, `scope_boundary`, `structural_model`, `structural_comparison`, `decision_scenario`, `practical_benefit`, `process_impact`, `risk_assessment`, `guideline`, `code_example`, `analogy`, `takeaway`
6. セクションはトピック単位（3〜6個）で構成する。台本のセクション構成とは独立。
7. 各要素に `importance` ("must" / "should" / "optional") を付与する。
8. `depends_on` で要素間の理解順序制約を記述する。
9. `technical_terms` でVOICEVOX読み辞書候補となる技術用語を抽出する。

### Step 5: 出力保存

1. 出力先: `data/projects/{PROJECT_ID}/{run-dir}/material/{EPISODE_ID}_material.json`
   - Blueprint と同じ run ディレクトリを使用する（`PROJECT_BLUEPRINT_JSON_PATH` からパスを推定）。
   - material ディレクトリが存在しない場合は作成する。
2. JSON をフォーマットして保存する。

### Step 6: バリデーション

1. `schemas/episode-material.schema.json` で JSON Schema バリデーションを実行する。
2. バリデーションエラーがあれば報告する（ファイルは保存済み）。

### Step 7: 報告

1. 保存先パスを表示する。
2. バリデーション結果（OK / NG + 詳細）を表示する。
3. `quality_checks` の内容を要約する:
   - `source_coverage`: ソースの網羅度
   - `element_dependency_valid`: 要素間依存の整合性
   - `importance_distribution`: must/should/optional の分布
4. セクション構成（セクション数、各セクションの要素数）を表示する。

## 注意事項

- JSON 以外の出力（説明文やマークダウン）を生成しない。
- `EPISODE_ID` は必ず引数 `$1` の値を使用する。project config の値は無視する。
- Blueprint に存在しないエピソード ID を指定された場合はエラーで終了する。
- 素材層はスタイル非依存。`STYLE_ID` や `CAST` の情報は使用しない。
- `scope_guardrails` で指定された範囲外の内容を要素に含めない。
- `quality_checks.blueprint_alignment` は廃止。代わりに `source_coverage` で網羅度を検証する。
- `continuity_checks` は廃止。エピソード間一貫性はダイジェスト方式（gen-digest）に移行。
