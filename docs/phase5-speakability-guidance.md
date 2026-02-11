# Phase5 Speakability guidance

Phase5 では Stage4 の Speakability 警告を軽微指摘として整備し、警告発生時の再現手順・期待動作・対策・関連ドキュメントを明文化します。このガイドは `docs/architecture/stage4-speakability-checklist.md` の再現ステップを起点に、QA やドキュメント更新の todo を洗い出すためのリファレンスです。

## 警告ごとの期待値・対策・再現

| 警告 | 期待値（JSON） | 対策・記録項目 | 再現スクリプト／テスト | 参照ドキュメント／リンク |
| --- | --- | --- | --- | --- |
| Speakability score is low | `quality_checks.speakability.score < 70` で警告。70 以上で「読みやすさ」保持。 | `SpeakabilityWarningConfig.scoreThreshold` を README/チェックリストに明記し、長すぎる utterance を分割／`PauseConfig` の `bases` や `lengthBonus` を微調整した変更ログを記録。 | `/tmp/nv-stage4-script/E04_script.md`（`run-20260211-1111`）で score=60 を確認。 | `docs/architecture/stage4-speakability-checklist.md`（警告条件表）・`README.md` Stage4 セクション（期待値表）。 |
| Terminal punctuation is infrequent | `quality_checks.speakability.terminal_punctuation_ratio < 0.65` で警告。0.65 以上で句点/感嘆符が足りている状態。 | `SpeakabilityWarningConfig.minTerminalPunctuationRatio` を警告文言に追記し、終端句読点を追加する手順（例: 文末に「。」/「！」）を書き出す。 | `/tmp/nv-stage4-script/E01_script.md`（`run-20260211-8888`）と `/tmp/nv-stage4-script/E02_script.md`（`run-20260211-9999`）で 0.5/0.467 を再現。 | 同上チェックリスト + Stage4 README で「Terminal punctuation 警告の対処例」セクションを追記。 |
| Long utterance ratio is high | `quality_checks.speakability.long_utterance_ratio > 0.25` で警告。25% 以下が許容範囲。 | `SpeakabilityWarningConfig.maxLongUtteranceRatio` を文言に含め、`splitIntoSentences` の `collectPreferredSplitPoints` や `maxCharsPerSentence` を見直して長文率 25% 以内に抑える調整箇所を記録。 | `/tmp/nv-stage4-script/E04_script.md`（`run-20260211-1111`）で 0.444 を確認し、必要なら `tests/pipeline/` に fixture を追加。 | チェックリスト + README に「長文率テスト」項目を追加し、テスト結果へのリンクを貼る。 |

## QA ワークフロー（Phase5）

1. `docs/architecture/stage4-speakability-checklist.md` に記載された E01/E02/E04 などのスクリプトで `bun run build-text` を実行し、目的の警告が `quality_checks.warnings` に含まれることを確認。
2. 生成された JSON から `quality_checks.speakability` の値を抜き出し、上記テーブルの「期待値」と照らし合わせる。警告が出る場合は `quality_checks.warnings` に `SpeakabilityWarningConfig` のしきい値の名前（例: `Speakability score is low (threshold: 70)`）を含めるようログを残す。
3. 各警告に対する対策（分割/句読点/クラスター）と、変更のために編集した `script.md` の箇所を `docs/phase5-speakability-guidance.md` もしくはレビュー用メモに記録し、QA が再現手順を再チェックできるようにする。
4. ドキュメント（README Stage4 セクション、チェックリスト）に再現スクリプト、設定項目、期待アクションを追記し、Phase5 のチェックリストとして `docs/phase5-speakability-guidance.md` へのリンクも並べる。
5. 確認結果が固まったら `tests/pipeline/` に警告を再現する fixture や snapshot を追加し、`bun test` で警告が出るケースを維持する（必要に応じて `tests/pipeline/` の doc comment で `Speakability score is low` などを参照）。

## ドキュメント／リンク整理

- `README.md` Stage4 セクションには、本ドキュメントと `docs/architecture/stage4-speakability-checklist.md` へのリンクを並べて、Stage4 の警告処理フローを伝える。
- `docs/architecture/stage4-speakability-checklist.md` では、警告条件・`SpeakabilityWarningConfig` 設定名・再現スクリプト・CSV ヘッダー確認の手順を維持しつつ、`docs/phase5-speakability-guidance.md` で挙げた期待値・対策・テストへのリンクを追記する。
- Phase5 の軽微指摘一覧（`.tmp/memo/tasks/claude_review_progress.md`）と今回の `docs/phase5-speakability-guidance.md` を合わせて、QA/レビュー担当が次の作業順序（期待値整理 → 再現テスト → 文言・リンク仕上げ → 追加テスト）を理解できるようにする。

## テストとのリンク

- `tests/pipeline/stage4_stage5.test.ts` は `/tmp/nv-stage4-script/E04_script.md` を使用して Speakability 警告（score/long ratio/terminal punctuation）を再現しているため、Phase5 の再現ログと一致する振る舞いを継続するのに役立ちます。
- `tests/pipeline/stage4_unit.test.ts` は `evaluateSpeakability`/`splitIntoSentences`/`decidePauseLengthMs` の個別関数が想定どおりの値を返すことを確認しているので、`SpeakabilityWarningConfig.*` のしきい値をいじる際にはこのテスト群の fixture も見直し、説明を README/チェックリストに追記してください。
