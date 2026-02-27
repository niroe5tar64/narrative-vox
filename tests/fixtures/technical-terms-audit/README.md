# technical_terms coverage evaluation fixtures

`coverage-eval-cases.json` は `checkRun` の technical_terms coverage 判定と notation 判定を定量評価するための fixture です。

## フィールド

- `expected_in_script`: 現行実装での coverage 期待判定（回帰固定用）
- `gold_in_script`: 人手ラベル（precision/recall 集計用）
- `expected_skip`: `morph_mode=unavailable` の non-ASCII skip 期待
- `expected_notation_inconsistencies`: notation 回帰の期待値
- `morph_tokens`: `Record<string, string[]>`
  - key: `tokenize()` の入力文字列そのもの（script 全文または term）
  - value: その入力で返す `surface_form[]`
  - 複数表記が script にある場合は、全出現を順序どおりにカバーする

## メトリクス

- skip ケースは coverage / notation どちらの分母からも除外する。
- coverage:
  - `tp/fp/fn/tn` は `gold_in_script` と実判定の比較で算出する。
  - `precision = tp / (tp + fp)`
  - `recall = tp / (tp + fn)`
- notation:
  - `notation_exact_match_ratio = notation_exact_matches / notation_targets`

## 更新ルール

- 仕様変更で挙動が変わる場合は、`expected_in_script`・`expected_notation_inconsistencies`・集計期待値を同時更新する。
- 既知 limitation を保持する場合は `gold_in_script` と `expected_in_script` の差分を明示する。
- 既存の個別ケースがこの fixture で十分に表現できる場合は、段階的に fixture ベースへ統合する。
