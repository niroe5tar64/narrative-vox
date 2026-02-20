# Episode Material（エピソード素材）

以下を別のLLMに渡して実行してください。
目的は、Blueprintで作成した設計図の指定エピソードに対して、素材層の構造化データを抽出することです。

---

## Prompt

あなたは技術講師向けの**素材抽出アナリスト**です。
出力は音声台本の「素材データ定義(JSON)」です。まだ台本本文は作成しません。

### 入力

- Blueprint JSON: `{{PROJECT_BLUEPRINT_JSON_PATH}}`
- 対象エピソードID: `{{EPISODE_ID}}`
- 参照Markdown（任意上書き・空文字なら未指定扱い）: `{{SOURCE_MARKDOWN_PATHS}}`
- 想定リスナー:
  - 背景: `{{AUDIENCE_BACKGROUND}}`
  - 習熟度: `{{AUDIENCE_LEVEL}}`
  - 関心: `{{AUDIENCE_INTEREST}}`
- 比較対象（任意上書き）: `{{BASELINE_CONTEXT_OR_EMPTY}}`

### タスク（7ステップ）

以下の手順を順に実行してください。

1. **スコープ確認**: Blueprint の `episode_plan` から対象エピソード（`{{EPISODE_ID}}`）の `target_theme_ids`, `learning_goal`, `source_refs`, `scope_guardrails` を確認する。`scope_guardrails` に列挙された範囲外の内容は一切扱わない。
2. **セクション分割**: 対象エピソードの内容をトピック単位で 3〜6 個のセクションに分割する（後述のセクション分割ガイドライン参照）。
3. **要素抽出**: 各セクションからソース Markdown を根拠として要素を抽出し、18 種の `type` を付与する（後述の要素タイプ一覧と紛らわしいペアの判別基準を参照）。
4. **importance 判定**: 各要素に `must` / `should` / `optional` を付与する（後述の importance 判定基準参照）。
5. **depends_on 記述**: 要素間の理解順序制約を `element_id` の配列で記述する（後述の depends_on ルール参照）。
6. **technical_terms 抽出**: 各要素から VOICEVOX 読み辞書候補となる用語を抽出する（後述の抽出基準参照）。
7. **quality_checks 自己検証**: 出力 JSON の `quality_checks` を自己判定する（後述の品質チェック判定ルール参照）。

### 要素タイプ一覧（18種）

| type | 説明 | 用途ヒント |
|------|------|-----------|
| `theme_introduction` | エピソード冒頭でテーマの全体像を示す導入 | 1セクション目の最初に1つ |
| `prerequisite` | このエピソードの前提となる既知概念 | リスナーが知っている前提を明示 |
| `baseline_pattern` | 比較対象（TypeScript等）の既存パターン | `comparison_mode = with_baseline` 時 |
| `problem_statement` | 既存手法の課題・限界の提示 | 新概念導入の動機付け |
| `core_thesis` | エピソード全体の主張・結論の核 | learning_goal に直結、must が多い |
| `concept` | 抽象的な概念の定義（「Xとは何か」） | 定義を明確に述べるもの |
| `capability` | 概念が持つ具体的な能力・機能（「Xで何ができるか」） | 実際に何が可能になるかを示す |
| `scope_boundary` | この概念が扱わない範囲の明示 | 過度な期待を防ぐ |
| `structural_model` | 概念の内部構造や構成要素の図解的説明 | 要素間の関係を示す |
| `structural_comparison` | 2つ以上の構造を並べた比較 | baseline vs target の対比 |
| `decision_scenario` | 設計判断を迫る具体的な状況設定 | リスナーに考えさせる問い |
| `practical_benefit` | 導入による実務上の利点 | 「何が嬉しいか」の説明 |
| `process_impact` | 開発プロセスへの影響（レビュー、テスト等） | 実務フロー変化の説明 |
| `risk_assessment` | 導入時のリスクや注意点 | トレードオフの提示 |
| `guideline` | 実践時のベストプラクティス・推奨ルール | 「こうすべき」の指針 |
| `code_example` | コードの構造や意図の要約（原文コピーではない） | 意味を言語化したもの |
| `analogy` | 比喩・たとえ話による説明 | 抽象概念の直感的理解 |
| `takeaway` | セクションまたはエピソード全体の要点まとめ | セクション末尾に配置 |

### 紛らわしいペアの判別基準

以下のペアは混同しやすいため、この判定式に従ってください。

- **concept vs capability**
  - `concept` = 「Xとは〜である」という定義・性質の説明
  - `capability` = 「Xを使うと〜ができる」という具体的な能力・機能の説明
  - 判定: 「〜とは何か」を説明していれば `concept`、「〜で何ができるか」を説明していれば `capability`

- **structural_model vs structural_comparison**
  - `structural_model` = 単一の概念の内部構造（要素・関係）を示す
  - `structural_comparison` = 2つ以上の概念の構造を並べて違いを示す
  - 判定: 対象が1つなら `structural_model`、2つ以上の比較なら `structural_comparison`

- **practical_benefit vs process_impact**
  - `practical_benefit` = 技術導入による直接的なメリット（コードの安全性向上、バグ減少等）
  - `process_impact` = 開発プロセスの変化（レビュー手順、テスト戦略、チーム運用等）
  - 判定: コードやプロダクトの品質改善なら `practical_benefit`、開発フローの変化なら `process_impact`

- **guideline vs risk_assessment**
  - `guideline` = 「こうすべき」という推奨行動
  - `risk_assessment` = 「こうしないとこうなる」というリスク・トレードオフの提示
  - 判定: 推奨アクションが主体なら `guideline`、リスクの指摘が主体なら `risk_assessment`

### セクション分割ガイドライン

- セクション数: **3〜6個**（スキーマ制約）
- 分割の軸: Blueprint の `target_theme_ids` に対応するトピック単位で分割する
- 1セクションあたりの要素数: **3〜7個**を目安とする
- `scope_guardrails` で除外対象とされた内容はセクションに含めない
- 台本のセクション構成とは独立: 素材のセクションは「何を伝えるか」のトピック分類であり、台本の「語りの区切り」とは一致しなくてよい

### importance 判定基準

| レベル | 基準 | 目安比率 |
|--------|------|---------|
| `must` | `learning_goal` に直結する要素。これがないとエピソードの目的を達成できない | 40〜60% |
| `should` | 理解を深める補足要素。省略してもエピソードは成立するが、理解の質が下がる | 25〜40% |
| `optional` | 補助的・発展的要素。時間や演出の都合で省略しても影響が小さい | 10〜20% |

- `core_thesis` は原則 `must`
- `theme_introduction` と `takeaway` は原則 `must` または `should`
- `analogy` は原則 `should` または `optional`
- 判定に迷ったら `should` を選ぶ

### depends_on ルール

- **同一セクション内優先**: 依存先は同一セクション内の要素を優先する
- **クロスセクション許可**: セクションをまたぐ依存も記述してよい（例: S01 の concept を S02 の capability が参照）
- **循環禁止**: A → B → A のような循環参照は禁止。DAG（有向非巡回グラフ）であること
- **定義→応用の流れ**: `concept` → `capability` → `practical_benefit` のように、定義から応用へ向かう自然な流れを反映する
- **空配列許容**: 依存先がない要素は `depends_on` を省略するか空配列 `[]` にする
- **element_id で参照**: `depends_on` には同一 Material 内の `element_id`（例: `"EL001"`）を使用する

### technical_terms 抽出基準

`technical_terms` は 2 段構造で管理します。

**要素レベル（element 内 `technical_terms: string[]`）**
各 element の `technical_terms` に、その要素で登場する技術用語名だけを列挙する（追跡用）。

**トップレベル（`technical_terms: [{term, reading, note}]`）**
エピソード全体で登場する技術用語を集約し、VOICEVOX 読み辞書候補として `reading`（カタカナ）と `note` を付与する。

以下に該当する用語をトップレベルに含める:

- **英語の技術用語**: VOICEVOX が日本語読みを誤る可能性がある（例: `ReScript`, `variant`, `pattern matching`）
- **略語**: 読み方が自明でない（例: `AST`, `FFI`, `GADT`）
- **専門用語**: 一般的でない技術概念（例: `代数的データ型`, `直和型`, `タグ付きユニオン`）

以下は含めない:

- 一般的な日本語（例: `関数`, `変数`, `型`）
- プログラミング一般で広く知られた英語（例: `if`, `for`, `function`）

### Few-shot 例

以下は 1 セクション分の出力例です。実際の出力にはこの例を含めないでください。

```json
{
  "section_id": "S01",
  "section": "ReScriptの型システム入門",
  "goal": "ReScriptの型システムが何を保証し、TypeScriptとどう違うかを理解する",
  "elements": [
    {
      "element_id": "EL001",
      "type": "theme_introduction",
      "content": "ReScriptの型システムは健全性（soundness）を重視した設計であり、TypeScriptのような漸進的型付けとは根本的に異なるアプローチを取る。",
      "importance": "must",
      "depends_on": [],
      "source_ref": "chapter-03.md#type-system-overview",
      "technical_terms": ["ReScript", "soundness"]
    },
    {
      "element_id": "EL002",
      "type": "baseline_pattern",
      "content": "TypeScriptはanyやas、型アサーションによって型安全性のエスケープハッチを多数提供しており、実行時型エラーが起きうる。",
      "importance": "should",
      "depends_on": ["EL001"],
      "source_ref": "chapter-03.md#typescript-comparison",
      "technical_terms": ["TypeScript"]
    },
    {
      "element_id": "EL003",
      "type": "concept",
      "content": "健全な型システム（sound type system）とは、型チェックを通過したプログラムが実行時に型エラーを起こさないことを保証する性質。",
      "importance": "must",
      "depends_on": ["EL001"],
      "source_ref": "chapter-03.md#soundness",
      "technical_terms": ["sound type system"]
    },
    {
      "element_id": "EL004",
      "type": "capability",
      "content": "ReScriptの型推論はHindley-Milnerベースで、明示的な型注釈なしでもほぼ全ての式の型を推論でき、型安全なコードを簡潔に書ける。",
      "importance": "must",
      "depends_on": ["EL003"],
      "source_ref": "chapter-03.md#type-inference",
      "technical_terms": ["Hindley-Milner"]
    },
    {
      "element_id": "EL005",
      "type": "takeaway",
      "content": "ReScriptの型システムは「エスケープハッチを排除して健全性を保つ」設計であり、これがコードの信頼性に直結する。",
      "importance": "should",
      "depends_on": ["EL003", "EL004"],
      "source_ref": "chapter-03.md#summary"
    }
  ]
}
```

### 品質チェック判定ルール

出力 JSON の `quality_checks` には以下のフィールドを自己判定して設定してください。

- **source_coverage**: ソース Markdown 上で `source_refs` が指す章・節の内容の 80% 以上を要素でカバーしていれば `"OK"`、そうでなければ `"NG"`
- **element_dependency_valid**: `depends_on` に循環がなく、全ての参照先 `element_id` が同一 Material 内に存在すれば `"OK"`、そうでなければ `"NG"`
- **importance_distribution**: `must`, `should`, `optional` それぞれの要素数をカウントして記録する

### 出力形式

`episode-material.schema.json` に準拠する JSON を出力してください。

```json
{
  "schema_version": "1.0",
  "meta": {
    "project_id": "{{PROJECT_ID}}",
    "episode_id": "{{EPISODE_ID}}",
    "episode_title": "",
    "genre": "study",
    "audience": {
      "background": "{{AUDIENCE_BACKGROUND}}",
      "level": "{{AUDIENCE_LEVEL}}",
      "interest": "{{AUDIENCE_INTEREST}}"
    },
    "source_refs": [],
    "comparison_mode": "with_baseline | standalone",
    "baseline_context": "{{BASELINE_CONTEXT_OR_EMPTY}}"
  },
  "sections": [
    {
      "section_id": "S01",
      "section": "",
      "goal": "",
      "elements": []
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

- 台本本文（話し言葉の文章）や演出指示（間の取り方、声のトーン等）を含めない
- JSON 以外の出力（説明文、マークダウン、コメント）を出力しない
- `scope_guardrails` で指定された範囲外の内容を要素に含めない
- `STYLE_ID` や `CAST`（話者設定）を参照しない — 演出層の責務であり素材層では扱わない
- ソース Markdown に記載のない内容を創作しない — 全ての要素は `source_ref` で根拠を示すこと
