# Episode Material（エピソード素材）— OSS Deep Dive

以下を別のLLMに渡して実行してください。
目的は、Blueprintで作成した設計図の指定エピソードに対して、素材層の構造化データを抽出することです。

---

## Prompt

あなたはOSSコード解析の**素材抽出アナリスト**です。
出力は音声台本の「素材データ定義(JSON)」です。まだ台本本文は作成しません。

### 入力

- Blueprint JSON: `{{PROJECT_BLUEPRINT_JSON_PATH}}`
- 対象エピソードID: `{{EPISODE_ID}}`
- リポジトリルート: `{{REPO_ROOT_PATH}}`
- 深掘りの焦点: `{{DEEP_DIVE_FOCUS}}`
- 想定リスナー:
  - 背景: `{{AUDIENCE_BACKGROUND}}`
  - 習熟度: `{{AUDIENCE_LEVEL}}`
  - 関心: `{{AUDIENCE_INTEREST}}`

### タスク

以下の順序で分析してください。

1. **スコープ確認**: Blueprint の対象エピソードの `learning_goal`、`source_refs`、`scope_guardrails` を確認し、作業範囲を把握する。`DEEP_DIVE_FOCUS` がエピソードの `learning_goal` にどう関連するかを整理する。
2. **ソースコード読み込み**: Blueprint の `source_refs` に列挙されたファイルを `{{REPO_ROOT_PATH}}` 配下から読む。クラス定義・関数シグネチャ・主要なアルゴリズム・データ構造・設計意図を把握する。
3. **セクション分割**: 3〜6 個のセクションに分割する。分割軸は Blueprint の `target_theme_ids` に対応するトピック単位。
4. **要素抽出**: 各セクションの要素に以下の 18 タイプのうち最も適切なものを付与する。
5. **importance 判定**: `must` / `should` / `optional` を判定する。
6. **depends_on 記述**: 要素間の依存関係を DAG として記述する。
7. **technical_terms 抽出**: 読み辞書候補となる技術用語を抽出する。
8. **quality_checks 自己検証**: 品質チェック項目を記入する。

### 要素タイプ（18種）

1. `theme_introduction` — エピソード冒頭でテーマの全体像を示す導入
2. `prerequisite` — 前提となる既知概念
3. `baseline_pattern` — 比較対象の既存パターン
4. `problem_statement` — 既存手法の課題・限界
5. `core_thesis` — エピソード全体の主張・結論の核
6. `concept` — 抽象的な概念の定義
7. `capability` — 概念が持つ具体的な能力・機能
8. `scope_boundary` — この概念が扱わない範囲
9. `structural_model` — 内部構造や構成要素の図解的説明（モジュール・クラス・関数の関係）
10. `structural_comparison` — 2つ以上の構造を並べた比較
11. `decision_scenario` — 設計判断を迫る具体的な状況設定
12. `practical_benefit` — 採用・利用による実務上の利点
13. `process_impact` — 開発プロセスへの影響
14. `risk_assessment` — 利用・採用時のリスクや注意点
15. `guideline` — ベストプラクティス・推奨ルール
16. `code_example` — コードの構造や設計意図の要約（コード原文でなく、意図・仕組みを言語化した内容）
17. `analogy` — 比喩・たとえ話による説明
18. `takeaway` — セクション/エピソード全体の要点まとめ

OSSコード解析では `structural_model`、`code_example`、`capability` を積極的に使用してください。
コード原文はここには含めず、構造・意図・設計判断を自然言語で記述してください。

### 紛らわしいペアの判別基準

- **concept vs capability**: 「〜とは何か」vs 「〜で何ができるか」
- **structural_model vs structural_comparison**: 単一モジュール/クラスの構造説明 vs 複数構造の並置比較
- **code_example vs structural_model**: 「この実装がどう書かれているか（具体の処理・コード片の意図）」vs 「モジュール間の関係・全体像」
- **practical_benefit vs process_impact**: 直接的メリット vs 開発フローへの影響
- **guideline vs risk_assessment**: 推奨行動 vs リスク・トレードオフ

### セクション分割ガイドライン

- セクション数: 3〜6 個
- 分割軸: Blueprint の `target_theme_ids` に対応するトピック単位
- 1 セクションあたりの要素数: 3〜7 個目安
- `scope_guardrails` で除外対象はセクションに含めない
- コード解析では「全体像 → 主要モジュール/構造 → アルゴリズム詳細 → 実務的意味」の流れを意識する

### importance 判定基準

| レベル | 基準 | 目安比率 |
|--------|------|---------|
| `must` | `learning_goal` に直結する要素 | 40〜60% |
| `should` | 理解を深める補足要素 | 25〜40% |
| `optional` | 補助的・発展的要素 | 10〜20% |

### depends_on ルール

- 同一セクション内の要素を優先して参照する
- クロスセクション参照も可（DAG 構造を維持）
- 循環参照禁止
- 基本的な流れ: `concept` → `capability` → `structural_model` → `code_example` → `practical_benefit`
- element_id で参照（例: "EL001"）

### technical_terms 抽出基準

`technical_terms` は 2 段構造で管理します。

**要素レベル（element 内 `technical_terms: string[]`）**
各 element の `technical_terms` に、その要素で登場する技術用語名だけを列挙する（追跡用）。

**トップレベル（`technical_terms: [{term, reading, note}]`）**
エピソード全体で登場する技術用語を集約し、VOICEVOX 読み辞書候補として `reading`（カタカナ）と `note` を付与する。

- **含める**: OSS 固有のクラス名・関数名・アルゴリズム名、技術用語（英語・カタカナ）、略語
  - 例: `ViterbiBuilder`、`DoubleArray`、`MeCab辞書フォーマット`、`トライ木`
- **含めない**: 一般的なプログラミング用語（関数、変数、クラス、`if`、`for`）

### 品質チェック

| チェック項目 | 基準 |
|------------|------|
| `source_coverage` | Blueprint の `source_refs` に列挙されたファイルを網羅的にカバーしていれば `"OK"` |
| `element_dependency_valid` | 循環なく、全参照先が存在すれば `"OK"` |
| `importance_distribution` | `must`、`should`、`optional` それぞれの要素数を記録 |

### 出力形式（JSONのみ）

`episode-material.schema.json` に準拠する JSON を出力してください。

```json
{
  "schema_version": "1.0",
  "meta": {
    "project_id": "{{PROJECT_ID}}",
    "episode_id": "{{EPISODE_ID}}",
    "episode_title": "",
    "genre": "oss-dive",
    "audience": {
      "background": "{{AUDIENCE_BACKGROUND}}",
      "level": "{{AUDIENCE_LEVEL}}",
      "interest": "{{AUDIENCE_INTEREST}}"
    },
    "source_refs": [],
    "comparison_mode": "standalone"
  },
  "sections": [
    {
      "section_id": "S01",
      "section": "",
      "goal": "",
      "elements": [
        {
          "element_id": "EL001",
          "type": "theme_introduction",
          "content": "",
          "importance": "must",
          "depends_on": []
        }
      ]
    }
  ],
  "technical_terms": [
    {
      "term": "",
      "reading": "",
      "note": ""
    }
  ],
  "quality_checks": {
    "source_coverage": "OK | NG",
    "element_dependency_valid": "OK | NG",
    "importance_distribution": {
      "must": 0,
      "should": 0,
      "optional": 0
    }
  }
}
```

### 禁止事項

- 台本本文（話し言葉）や演出指示を含めない
- JSON 以外の出力
- `scope_guardrails` 外の内容を含めない
- STYLE_ID や CAST の参照（演出層の責務）
- ソースコードに記載のない内容の創作
- コード原文をそのまま `content` フィールドに貼り付けない（構造・意図・設計判断を自然言語で記述する）
