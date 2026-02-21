# ADR-0003: フロントエンドGUIと実行API契約を導入する

## Status
Accepted (2026-02-21)

## Context

Narrative Vox は設定編集・パイプライン実行・生成物確認を主にCLIとJSON直接編集で運用している。
この運用は柔軟だが、以下の問題がある。

- 設定変更の体験が統一されず、入力ミスや運用コストが増える
- build/check/prepare 実行時のログ監視と再実行導線が弱い
- run配下の確認・部分修正（`voicevox_text.json`）の安全な導線がない
- APIエラー形式やジョブ制御、保存競合制御の契約が未定義で、実装ごとの差異が生まれやすい

`.tmp/memo/fe-tasks/frontend-spec.md` でGUI実装方針とMVP要件を整理し、
追加仕様（MVPで確定）として運用・安全性・テスト方針まで合意したため、ADRとして固定する。

## Decision

以下を採用する。

1. フロントエンド/サーバー構成
   - APIサーバー: Bun + Hono（`src/server/`）
   - GUI: Vite + React + TypeScript（`web/`）
   - UI: shadcn/ui + Tailwind CSS
   - データ取得: TanStack Query
   - フォーム: React Hook Form + AJVスキーマ再利用
   - リアルタイムログ: WebSocket

2. GUIスコープ（MVP）
   - `configs/` 配下JSONのCRUD
   - パイプライン実行（`build-text`, `build-project`, `build-audio`, `build-all`）
   - run一覧/詳細の閲覧
   - `voicevox_text.json` の `utterance.text` と `pause_length_ms` のみ編集許可
   - `.md` は閲覧のみ（「VS Codeで開く」導線あり）

3. APIエラー契約をRFC7807で統一
   - `application/problem+json`
   - 拡張フィールド: `errorCode`, `details`, `requestId`
   - ステータス利用規約:
     - `400` 入力不正
     - `403` 許可外操作/パス
     - `404` 未存在
     - `409` 競合（If-Match不一致）
     - `422` スキーマ不正（AJV）
     - `500` 内部エラー

4. ジョブ実行契約を固定
   - `POST /api/pipeline/run` の `command` は enum 制限:
     - `build-text | build-project | build-audio | build-all | check-run | prepare-run`
   - 同時実行は1ジョブ（直列）
   - `POST /api/pipeline/:jobId/cancel` を提供
   - cancelは `SIGTERM -> 3秒待機 -> SIGKILL`
   - タイムアウト30分、終了ジョブ保持TTL 30分（メモリ）

5. WebSocketログ契約を固定
   - `WS /ws/pipeline/:jobId`
   - メッセージ: `{ type, data, ts, seq, code?, cancelled? }`
   - 再接続時はリングバッファから直近500行を再送

6. runファイル編集の整合性・安全性を固定
   - `voicevox_text.json` のGETで strong ETag（SHA-256）を返す
   - PUTは `If-Match` 必須、不一致は `409`
   - 保存は原子的更新（tmp書き込み後 rename）
   - `realpath` でrepo内パスのみ許可。repo外・危険経路は `403`
   - `/api/editor/open` は Run詳細で選択中ファイルのみ許可
   - `/api/runs/:projectId/:runId/file` はテキスト系のみ返却（非対応は `415`）

7. Run一覧取得契約
   - `GET /api/runs` は新しいrun順（`run-YYYYMMDD-HHMM` 解析降順）
   - 解析失敗時は `mtime` 降順
   - `projectId` フィルタ、`page`/`pageSize` をサポート
   - 既定 `pageSize=20`

8. UXと運用境界
   - 保存は明示保存（Saveボタン）で統一
   - 未保存変更の離脱時に警告
   - MVPでは認証を導入しない（localhost運用前提）
   - 既定bindは `127.0.0.1`、CORSは同一originのみ

9. テスト基準（MVP必須）
   - APIエラー契約（problem+json、422）
   - 保存競合（If-Match不一致で409、原子的保存）
   - ジョブ実行（enum外拒否、同時実行拒否、cancel、timeout）
   - WebSocket再接続（500行再送、`seq` 順序保証）

## Consequences

- GUI導入で設定編集・実行・検証の導線が一元化され、運用負荷が下がる
- API契約（エラー・ジョブ・保存整合性）が先に固定されるため、フロント/バックの並行実装が容易になる
- 一方で、ジョブ管理・再接続ログ・競合制御の実装コストは増える
- 認証なし運用は localhost 前提に依存するため、公開運用時には別ADRで認証/公開境界を再決定する必要がある

## Scope Notes

- 本ADRはMVP対象を規定する。バイナリファイル対応、設定画面からのサーバー設定変更、ジョブ履歴永続化は対象外
- 後方互換は要求しない（プロジェクト方針に従う）
