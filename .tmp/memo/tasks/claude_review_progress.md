# Claudeレビュー修正 進捗トラッカー

最終更新: 2026-02-12
対象計画: `/Users/eitarofutakuchi/source_code/narrative-vox/.tmp/memo/06_claude_review_fix_plan.md`

## ステータス凡例
- `TODO`: 未着手
- `DOING`: 着手中
- `DONE`: 完了
- `BLOCKED`: ブロッカーあり

## 全体ステータス
- 現在フェーズ: Phase 3（Stage4ファイル分割）
- 全体進捗: 35%（Phase 0-2完了）
- ブロッカー: なし

## フェーズ進捗
| Phase | 内容 | 状態 | 完了日 | メモ |
|---|---|---|---|---|
| Plan | 修正計画の作成 | DONE | 2026-02-12 | `06_claude_review_fix_plan.md` 作成済み |
| Phase 0 | 安全網確認（test/typecheck基準化） | DONE | 2026-02-11 | bun test / bun run typecheck / CLI --help を記録 |
| Phase 1 | 型安全性改善 | DONE | 2026-02-11 | `src/shared/json.ts` と `src/shared/voice_profile.ts` を導入し、Stage5 で Stage4 スキーマ検証を追加 |
| Phase 2 | 重複コード統合 | DONE | 2026-02-11 | CLI引数/Run ID/スクリプト正規表現/Stage4・Stage5型を共有モジュール化し、重複実装を解消 |
| Phase 3 | Stage4ファイル分割 | DOING | - | Stage4 の責務を段階的に新モジュールへ切り出し中（テキスト処理＋辞書候補評価を分離） |
| Phase 4 | マジックナンバー/命名整理 | TODO | - | 未着手 |
| Phase 5 | 軽微修正 | TODO | - | 未着手 |

## チェックリスト（上から実行）
- [x] 修正計画を作成し保存する
- [x] Phase 0: `bun test` の結果を記録する
- [x] Phase 0: `bun run typecheck` の結果を記録する
- [x] Phase 1: JSON読み込みとスキーマ検証の共通化
- [x] Phase 1: `VoiceProfile` 正規化レイヤー導入
- [x] Phase 2: CLI引数パーサー共通化
- [x] Phase 2: Run IDユーティリティ共通化
- [x] Phase 2: script正規表現共通化
- [x] Phase 2: Stage4/Stage5型共通化
- [ ] Phase 3: Stage4責務分割
- [ ] Phase 4: 定数抽出と命名整理
- [ ] Phase 5: 軽微指摘の解消
- [x] 最終: `bun test` / `bun run typecheck` 再実行

## セッションログ
### 2026-02-12 (Phase 3分割推進)
- 完了:
  - `src/pipeline/stage4_voicevox_text.ts` から文分割・読みやすさ評価・スクリプト正規化ロジックを `src/pipeline/stage4/text_processing.ts` に切り出し、Stage4 モジュールは新しいヘルパーをインポート／再エクスポートする形で責務を縮小。
  - 辞書候補・Morph Tokenizer・CSV 変換ロジックを `src/pipeline/stage4/dictionary.ts` に移して `stage4_voicevox_text.ts` は必要な機能をインポートし直しつつ `toDictionaryCandidates` や `priorityForCandidate` 等を再エクスポート。
  - `bun run typecheck` と `bun test` を再実行して変更を検証。
- 未完了:
  - Run ID／プロジェクト／エピソードの推論や出力パス構築など Stage4 の残り責務の切り出し。
- 次セッション開始タスク:
  - Stage4 の Run ID 予測と出力ファイル構築ロジックを別モジュールへ移設し、`stage4_voicevox_text.ts` はオーケストレーターに集中させる。
### 2026-02-12 (Phase 3 run metadata)
- 完了:
  - Stage4の Run ID/プロジェクト/エピソード推論や stage4/stage4_dict ディレクトリ・出力パス生成を `src/pipeline/stage4/run_metadata.ts` にまとめて `runStage4` はメタデータを消費するだけにした。
  - JSON/TXT/CSV のファイル出力を `src/pipeline/stage4/io.ts` に切り出し、Stage4 のオーケストレーションはパス＋データを渡すだけになった。
  - `bun run typecheck` と `bun test` を再実行して変更後もすべてのテストが通ることを確認。
- 未完了:
-  - 後続の Stage4責務（辞書候補出力/Runディレクトリ構築以外）をさらに分割。
- 次セッション開始タスク:
-  - Stage4 の出力書き込みと CLI 連携を最小化したオーケストレーター構成を固めつつ、Phase 4 に進む準備をする。
### 2026-02-12 (Phase 3 magic numbers)
- 完了:
  - `src/pipeline/stage4/text_processing.ts` に `SPLIT_POINT_TOLERANCE`、`PAUSE_BASES`、停止ペナルティ定数、`SPEAKABILITY_*` 定数といったマジックナンバーを整理して `chooseSplitPoint`/`decidePauseLengthMs`/`evaluateSpeakability` で使い、調整ポイントを一か所に集中させた。
  - `bun run typecheck` と `bun test` を改めて通して新しい定数群とスコア計算が壊れていないことを確認。
- 未完了:
  - Stage4 の仕上げ（CLI 連携・出力ディレクトリ周り）を Phase 3 でまとめ、Phase 4 への橋渡しを完了する。
- 次セッション開始タスク:
  - Stage4 の残る責務を完全に切り出し終えたと判断したら、Phase 4（マジックナンバー/命名整理）に移行。
- 未完了:
  - 後続の Stage4責務（辞書候補出力/Run ディレクトリ構築以外のパイプライン固有処理）をさらに分割。
- 次セッション開始タスク:
  - Stage4 の出力書き込みと CLI 連携を最小化したオーケストレーター構成を固めつつ、Phase 4 へ向けて残り責務をさらに分離。
### 2026-02-11 (Phase 2リファクタリング)
- 完了:
  - CLI引数パーサー・Run ID・スクリプト正規表現・Stage4/Stage5型を `src/shared/` 下のモジュールに集約し、CLI/パイプライン/検証の呼び出し先を共有化。
  - `bun run typecheck`, `bun test`, `bun src/cli/main.ts build-text --help`, `bun src/cli/new_run.ts --help` を再実行して安全網を確認。
- 未完了:
  - Stage4ファイル分割（Phase 3）以降の責務分離。
- 次セッション開始タスク:
  - Stage4ファイル分割（責務別モジュール化）に着手。
### 2026-02-11 (再開)
- 完了:
  - Phase2 に着手するための現状整理と本トラッカー更新を行った。
- 未完了:
  - Phase2 の重複コード統合がまだ実装フェーズに入っていない。
- 次セッション開始タスク:
  - CLI 引数パーサー、Run ID ユーティリティ、スクリプト正規表現、Stage4/Stage5 型共有の具体化を開始。
### 2026-02-11
- 完了:
  - Phase 0 の安全網確認として `bun test` / `bun run typecheck` を通し、CLI `build-text`/`new_run` の `--help` 動作も確認。
  - Phase 1 として `src/shared/json.ts` に読み込み/スキーマ処理を集中化し、`src/shared/voice_profile.ts` で `VoiceProfile` を正規化した。
  - Stage5 側で Stage4 JSON のスキーマ検証と正規化済みプロファイルを活用するようリファクタリング。
- 未完了:
  - Phase 2 重複コード統合の作業。
- 次セッション開始タスク:
  - Phase 2 で CLI 引数/Run ID/スクリプト正規表現と Stage4/Stage5 型の共有化に着手。
### 2026-02-12
- 完了:
  - Claudeレビュー指摘5件を確認し、統合修正計画を作成。
  - 進捗管理の仕組みとして、本トラッカーと `ACTIVE_CONTEXT.md` を追加。
- 未完了:
  - 実装フェーズ（Phase 0以降）未着手。
- 次セッション開始タスク:
  - Phase 0 を実行し、テスト/型チェックの基準ログをここに追記。

## 更新ルール（毎セッション）
1. 開始時:
   - `全体ステータス` の「現在フェーズ」を更新。
   - 対象フェーズを `DOING` に変更。
2. 作業中:
   - 完了したチェックボックスを都度更新。
   - ブロッカーが出たら `BLOCKED` と原因を記録。
3. 終了時:
   - `セッションログ` に「完了/未完了/次タスク」を追記。
   - `最終更新` 日付を更新。
