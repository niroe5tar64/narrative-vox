# Stage4 Speakability warning checklist

このドキュメントは Phase5（軽微指摘対応）に向けて Stage4 の `quality_checks.warnings` を扱う際の再現手順とチェックポイントをまとめたチェックリストです。`SpeakabilityWarningConfig` の閾値は `src/pipeline/stage4_voicevox_text.ts` に定義されており、目的に応じて `quality_checks.speakability` の結果を確認します。

## 警告条件と計測ポイント

| 警告名 | 条件 | 期待する JSON フィールド | 例（桁） |
| --- | --- | --- | --- |
| Speakability score is low | `speakability.score < 70` | `score`（評価値） | E04 run: 60 |
| Terminal punctuation is infrequent | `speakability.terminal_punctuation_ratio < 0.65` | `terminal_punctuation_ratio` | E01 run: 0.50、E02 run: 0.467、E04 run: 0 |
| Long utterance ratio is high | `speakability.long_utterance_ratio > 0.25` | `long_utterance_ratio` | E04 run: 0.444 |

## 再現用スクリプト

| スクリプト | Run ID | 警告 | メモ |
| --- | --- | --- | --- |
| `/tmp/nv-stage4-script/E01_script.md` | `run-20260211-8888` | Terminal punctuation warning | `terminal_punctuation_ratio=0.5`。set `long_utterance_ratio=0` |
| `/tmp/nv-stage4-script/E02_script.md` | `run-20260211-9999` | Terminal punctuation warning | `terminal_punctuation_ratio=0.467`、`long_utterance_ratio=0.067` |
| `/tmp/nv-stage4-script/E04_script.md` | `run-20260211-1111` | Low score / long utterance / terminal punctuation | `score=60` / `long_utterance_ratio=0.444` / `terminal_punctuation_ratio=0` |

## チェック手順

1. `bun run build-text -- --script <script> --run-dir <run-dir> --project-id introducing-rescript --run-id <run> --episode-id <expected>` を実行する（必要なスクリプトは `/tmp/nv-stage4-script/` に存在）。  
2. 出力 JSON の `quality_checks.speakability` を確認し、上記の `score`/`ratio` が期待どおりであるか検証する。  
3. `quality_checks.warnings` に該当の警告メッセージが含まれていることを確認する。  
4. `stage4_dict/<episode>_dict_candidates.csv` を開いて `DictionaryCsvField` のヘッダー順（`surface,reading,priority,occurrences,source,note`）と quote ルールが守れているか確認。

### 実行例（CLI）

| 警告 | コマンド | 期待される出力 |
| --- | --- | --- |
| Speakability score is low / long utterance ratio is high | `bun run build-text -- --script /tmp/nv-stage4-script/E04_script.md --run-dir /tmp/nv-test-run/run-20260211-1111 --project-id introducing-rescript --run-id run-20260211-1111 --episode-id E04` | `quality_checks.speakability.score=60` / `long_utterance_ratio=0.444` / `terminal_punctuation_ratio=0` / 警告3件 |
| Terminal punctuation is infrequent | `bun run build-text -- --script /tmp/nv-stage4-script/E01_script.md --run-dir /tmp/nv-test-run/run-20260211-8888 --project-id introducing-rescript --run-id run-20260211-8888 --episode-id E01` | `terminal_punctuation_ratio=0.5` / Terminal punctuation 警告 |
| Terminal punctuation is infrequent（比率低） | `bun run build-text -- --script /tmp/nv-stage4-script/E02_script.md --run-dir /tmp/nv-test-run/run-20260211-9999 --project-id introducing-rescript --run-id run-20260211-9999 --episode-id E02` | `terminal_punctuation_ratio=0.467` / `long_utterance_ratio=0.067` / Terminal punctuation 警告 |

## 警告別ドキュメント更新のたたき台

| 警告 | `SpeakabilityWarningConfig` 設定 | README/チェックリストで追記すべきポイント | Phase5 ガイド |
| --- | --- | --- | --- |
| Speakability score is low | `SpeakabilityWarningConfig.scoreThreshold` | スコア 70 以上の状態を「読みやすい」と定義し、分割/`PauseConfig` 係数調整の手順を記録 | `docs/phase5-speakability-guidance.md` の該当行 |
| Terminal punctuation is infrequent | `SpeakabilityWarningConfig.minTerminalPunctuationRatio` | 終端句読点が 0.65 以上になるまでのアクション（句点追加例など）を案内 | 同上 |
| Long utterance ratio is high | `SpeakabilityWarningConfig.maxLongUtteranceRatio` | 25% 以下に抑えるための `splitIntoSentences` 識別ルールやテストケースを追加 | 同上 |

## Phase5 に向けた追加作業

- 上記チェックを README や `docs/quality` に記載することで他のチームメンバーでも再現できるようにする。  
- 警告が出たときの対応方針（例：分割ポイントを増やす、話者の pause を強めるなど）を簡潔にまとめ、 `docs/phase5-speakability-guidance.md` へ各警告の期待値・再現・対策・ドキュメントリンクを集約。  
- Phase5 で残る軽微指摘（README で言及した警告条件のアップデートや追加テストの記録）を洗い出すため、このチェックリストと `docs/phase5-speakability-guidance.md` に従って各ケースを再確認する。  
