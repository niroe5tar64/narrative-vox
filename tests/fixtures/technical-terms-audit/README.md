# technical_terms coverage evaluation fixtures

`coverage-eval-cases.json` は `checkRun` の technical_terms coverage 判定を定量評価するための fixture です。

## フィールド

- `expected_in_script`: 現行実装での期待判定（回帰固定用）
- `gold_in_script`: 人手ラベル（precision/recall 集計用）
- `expected_skip`: `morph_mode=unavailable` の non-ASCII skip 期待
- `morph_tokens`: `Record<string, string[]>`
  - key: `tokenize()` の入力文字列そのもの（script 全文または term）
  - value: その入力で返す `surface_form[]`

## メトリクス

- skip ケースは precision/recall の分母から除外する。
- `tp/fp/fn/tn` は `gold_in_script` と実判定の比較で算出する。
- `precision = tp / (tp + fp)`
- `recall = tp / (tp + fn)`

## 更新ルール

- 仕様変更で挙動が変わる場合は、`expected_in_script` と集計期待値を同時更新する。
- 既知 limitation を保持する場合は `gold_in_script` と `expected_in_script` の差分を明示する。
- 既存の個別ケースがこの fixture で十分に表現できる場合は、段階的に fixture ベースへ統合する。
