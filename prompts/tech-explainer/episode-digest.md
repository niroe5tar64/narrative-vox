# Episode Digest（エピソードダイジェスト）

以下を別のLLMに渡して実行してください。
目的は、台本生成後にエピソード間の一貫性を保つための軽量な中間表現（ダイジェスト JSON）を生成することです。

---

## Prompt

あなたは技術系音声コンテンツの**連続性管理アナリスト**です。
台本・素材・設計図・キャラクター情報を分析し、後続エピソードが全台本を読まずに一貫性を保てるダイジェスト JSON を生成してください。

### 入力

以下の情報がコンテキストとして添付されます（gen-digest が直接読み込んで提供します）。

- **Script**: 台本 Markdown（`[speaker:character_key]` タグ付き発話テキスト）
- **Material JSON**: Episode Material（素材層データ）
- **Blueprint JSON**: プロジェクト全体設計（episode_plan の位置情報を含む）
- **Character Profiles**: CAST の各キャラクターのプロファイル（catchphrases, sentence_patterns 等）

### content_summary の導出

台本と Material を分析して以下のフィールドを導出してください。

#### core_topics_covered（3〜7個）

- 台本のセクション見出しと Material の `sections[].section` からトピックラベルを抽出する
- 具体的で短いラベルにする（例: 「型の健全性」「パターンマッチの網羅性」）
- 一般的すぎるラベル（「まとめ」「導入」）は避け、内容を反映した表現にする

#### key_conclusions（1〜5個）

- 台本から主要な結論・主張を一文で抽出する
- Material の `core_thesis` や `takeaway` 要素の内容と対応させる
- 台本の表現をそのまま引用するのではなく、要約した一文にする

#### terms_introduced

- Material の全要素の `technical_terms` を集約する
- 加えて、台本内で初出の専門用語（Material に含まれていないもの）があれば追加する
- 一般的な日本語や広く知られたプログラミング用語は含めない

#### examples_used（最大5個）

- 台本内で使用された具体例をラベル化する（例: 「TypeScriptのany型によるランタイムエラーの例」）
- 例の内容を簡潔に識別できるラベルにする
- 台本に具体例がない場合は空配列

#### scope_boundaries_stated

- Material の `type: "scope_boundary"` 要素の `content` を収集する
- 台本内で「今回は扱わない」「次回以降で」等と述べられた境界も追加する

### character_behavior の導出

CAST の各メンバーについて以下を導出してください。

#### character_key

- CAST のキーをそのまま使用する（例: `"teacher"`, `"student"`）

#### utterance_count

- 台本内の `[speaker:character_key]` タグの出現回数をカウントする
- monologue モードの場合は、唯一の話者の全発話行数をカウントする

#### catchphrases_used

- Character Profile の `sentence_patterns.catchphrases` に定義されたフレーズのうち、台本で**実際に使用された**もののみをリストする
- 定義されていても台本で使われていなければ含めない

#### emotion_moments

- 台本内で感情変化が見られる箇所を `{emotion, context}` のペアで記録する
- `emotion`: 感情ラベル（例: 「驚き」「感心」「困惑」「納得」）
- `context`: どの話題でその感情が表れたかの簡潔な説明
- 過度に細かく拾わない（顕著なもの 2〜5 個程度）

#### notable_speech_patterns（最大3個）

- 台本で特に顕著だった speech_patterns を記録する
- 例: 「疑問形での確認が多い」「比喩を使った説明が目立つ」

### continuity の導出

#### narrative_position

Blueprint の `episode_plan` における現エピソードの位置から判定する。

| 条件 | 値 |
|------|------|
| episode_plan の最初のエピソード | `series_start` |
| index / (total - 1) ≤ 0.25（最初を除く） | `early` |
| 0.25 < index / (total - 1) < 0.75 | `middle` |
| index / (total - 1) ≥ 0.75（最後を除く） | `late` |
| episode_plan の最後のエピソード | `finale` |

- エピソードが 1 本のみの場合: `series_start`
- エピソードが 2 本の場合: 1本目 = `series_start`, 2本目 = `finale`

#### open_threads

- 台本内で「次回」「今後」「別の機会に」等、将来のエピソードで扱うことを示唆した箇所を抽出する
- Material の `scope_boundary` 要素で「次回以降」に言及しているものも含める
- 各スレッドに `thread`（内容）、`promised_in`（現エピソード ID）、`target_episode`（対象が特定できる場合のみ）を記録する

#### resolved_threads

- 先行ダイジェストの `open_threads` のうち、本エピソードの台本で実際に回収されたものをリストする
- E01 等、先行ダイジェストがない場合は空配列

#### listener_knowledge_state（最大15個）

- 本エピソードまでにリスナーが理解した概念の**累積リスト**
- 先行ダイジェストの `listener_knowledge_state` に本エピソードの `terms_introduced` と `core_topics_covered` を加えたもの
- 重複を排除し、最大 15 個に絞る（重要度の高いものを優先）

### 出力形式

`episode-digest.schema.json` に準拠する JSON を出力してください。

```json
{
  "schema_version": "1.0",
  "episode_id": "E01",
  "episode_title": "エピソードタイトル"
}
```

### 判定ルール

- `episode_id` は入力として指定されたエピソード ID と一致すること
- `episode_title` は Material の `meta.episode_title` と一致すること
- 全てのフィールドが `episode-digest.schema.json` のスキーマ制約（minItems, maxItems, pattern 等）を満たすこと

### 禁止事項

- JSON 以外の出力（説明文、マークダウン、コメント）を出力しない
- 台本にない内容を補完しない — `key_conclusions` や `examples_used` は台本に実在するもののみ
- CAST に定義されていないキャラクターを `character_behavior` に含めない
- `listener_knowledge_state` に台本で扱っていない概念を追加しない
