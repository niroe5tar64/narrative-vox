---
spec-id: spec-07
title: REST API + WebSocket コントラクト
updated: 2026-03-01
depends-on: [spec-01, spec-02, spec-03, spec-04, spec-05, spec-06]
referenced-by: [spec-00, spec-08]
---

# REST API + WebSocket コントラクト

## 概要

`apps/api/` は Bun + Hono で実装された API サーバー。パイプライン実行・設定管理・ファイル操作・VOICEVOX プロキシのエンドポイントを提供する。認証なし・ローカル前提。WebSocket でパイプラインのリアルタイムログを配信する。

---

## サーバー設定

| 項目 | デフォルト | 環境変数 |
|---|---|---|
| ポート | `3000` | `PORT` |
| ホスト | `0.0.0.0` | `HOST` |
| 許可オリジン（CORS） | `http://localhost:5173` | `ALLOWED_ORIGIN` |
| VOICEVOX URL | `http://localhost:50021` | `VOICEVOX_URL` |
| リポジトリルート | `process.cwd()` | `REPO_ROOT` |

---

## エラーレスポンス形式（RFC 7807 Problem Details）

全エラーレスポンスは以下のフォーマットに準拠する。

```json
{
  "type": "about:blank",
  "title": "Job already running",
  "status": 400,
  "detail": "Job abc123 is currently running",
  "errorCode": "JOB_ALREADY_RUNNING"
}
```

| フィールド | 必須 | 説明 |
|---|---|---|
| `type` | ○ | 常に `"about:blank"` |
| `title` | ○ | エラーの概要 |
| `status` | ○ | HTTP ステータスコード |
| `detail` | 任意 | 詳細メッセージ |
| `errorCode` | 任意 | 機械可読なエラーコード |
| `details` | 任意 | 複数エラーの配列（バリデーションエラー） |

---

## エンドポイント一覧

### /api/configs — 設定管理

#### キャラクター

| メソッド | パス | 説明 | ステータス |
|---|---|---|---|
| GET | `/api/configs/characters` | キャラクター一覧 | 200 |
| GET | `/api/configs/characters/:key` | キャラクター取得 | 200 / 404 |
| POST | `/api/configs/characters` | キャラクター作成 | 201 / 409 / 422 |
| PUT | `/api/configs/characters/:key` | キャラクター更新 | 200 / 404 / 422 |
| DELETE | `/api/configs/characters/:key` | キャラクター削除 | 204 / 404 |

#### プロジェクト

| メソッド | パス | 説明 | ステータス |
|---|---|---|---|
| GET | `/api/configs/projects` | プロジェクト一覧（*.example.json 除外） | 200 |
| GET | `/api/configs/projects/:id` | プロジェクト取得 | 200 / 404 |
| POST | `/api/configs/projects` | プロジェクト作成 | 201 / 409 / 422 |
| PUT | `/api/configs/projects/:id` | プロジェクト更新 | 200 / 404 / 422 |
| DELETE | `/api/configs/projects/:id` | プロジェクト削除 | 204 / 404 |

#### スタイル（読み取り専用）

| メソッド | パス | 説明 | ステータス |
|---|---|---|---|
| GET | `/api/configs/styles` | スタイル一覧 | 200 |
| GET | `/api/configs/styles/:id` | スタイル取得 | 200 / 404 |

#### ジャンル（読み取り専用）

| メソッド | パス | 説明 | ステータス |
|---|---|---|---|
| GET | `/api/configs/genres` | ジャンル一覧 | 200 |

#### VOICEVOX 音声設定

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/configs/voice/voicevox/synthesis-defaults` | 合成デフォルト取得 |
| PUT | `/api/configs/voice/voicevox/synthesis-defaults` | 合成デフォルト更新 |
| GET | `/api/configs/voice/voicevox/build-text-config` | build-text 設定取得 |
| PUT | `/api/configs/voice/voicevox/build-text-config` | build-text 設定更新 |
| GET | `/api/configs/voice/voicevox/speed-profiles` | 速度プロファイル取得 |
| PUT | `/api/configs/voice/voicevox/speed-profiles` | 速度プロファイル更新 |
| GET | `/api/configs/voice/voicevox/user-dict` | ユーザー辞書取得 |
| PUT | `/api/configs/voice/voicevox/user-dict` | ユーザー辞書更新 |

---

### /api/pipeline — パイプライン実行

#### POST /api/pipeline/run — ジョブ開始

**リクエスト**
```json
{
  "command": "gen-blueprint",
  "args": ["--project-id", "introducing-rescript"]
}
```

**レスポンス** (202 Accepted)
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "command": "gen-blueprint",
  "args": ["--project-id", "introducing-rescript"],
  "startedAt": "2026-03-01T14:30:00.000Z"
}
```

**エラーコード**

| コード | 説明 |
|---|---|
| `JOB_ALREADY_RUNNING` | 別のジョブが実行中（同時実行は1つのみ） |
| `RATE_LIMITED` | レート制限超過（10リクエスト/60秒） |
| `INVALID_COMMAND` | 許可されていないコマンド |
| `INVALID_ARGS` | フラグバリデーション失敗 |

#### POST /api/pipeline/:jobId/cancel — ジョブキャンセル

**レスポンス** (200 OK)
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "cancelled",
  "cancelled": true
}
```

キャンセル時は `SIGTERM` → 3秒後 `SIGKILL` のシーケンスで子プロセスを終了させる。

---

### /api/runs — Run 管理

#### GET /api/runs — Run 一覧

**クエリパラメータ**

| パラメータ | 説明 | デフォルト |
|---|---|---|
| `projectId` | プロジェクト ID でフィルタ | — |
| `page` | ページ番号（1始まり） | 1 |
| `pageSize` | 1ページあたりの件数（最大100） | 20 |

**レスポンス** (200 OK)
```json
{
  "items": [
    {
      "projectId": "introducing-rescript",
      "runId": "run-20260301-1430",
      "createdAt": "2026-03-01T14:30:00Z"
    }
  ],
  "total": 5,
  "page": 1,
  "pageSize": 20
}
```

#### GET /api/runs/:projectId/:runId/status — Run ステータス取得

**レスポンス** (200 OK)
```json
{
  "projectId": "introducing-rescript",
  "runId": "run-20260301-1430",
  "plannedEpisodeIds": ["E01", "E02"],
  "stages": {
    "blueprint": { "status": "completed" },
    "material":  { "status": "partial", "episodeIds": ["E01"] },
    "script":    { "status": "idle", "episodeIds": [] },
    "context":   { "status": "idle" },
    "voicevox_text":    { "status": "idle" },
    "voicevox_project": { "status": "idle" },
    "audio":     { "status": "idle" }
  }
}
```

#### GET /api/runs/:projectId/:runId/tree — ファイルツリー取得

**レスポンス** (200 OK)
```json
{
  "tree": {
    "name": "run-20260301-1430",
    "type": "dir",
    "children": [
      {
        "name": "blueprint",
        "type": "dir",
        "children": [
          { "name": "project_blueprint.json", "type": "file",
            "path": "blueprint/project_blueprint.json" }
        ]
      }
    ]
  }
}
```

最大深さ: 10 レベル。

#### GET /api/runs/:projectId/:runId/file?path=... — ファイル取得

テキストファイルのみ取得可能。`voicevox_text.json` の場合は `ETag` ヘッダーを返す。

**レスポンス** (200 OK)
- `Content-Type: application/json` または `text/plain; charset=utf-8`
- `ETag: "<sha256>"` （`voicevox_text.json` のみ）

#### PUT /api/runs/:projectId/:runId/file?path=... — ファイル更新

`voicevox_text.json` のみ更新可能。楽観的ロック（ETag 検証）を使用。

**必須ヘッダー**: `If-Match: "<etag>"`

**リクエストボディ**
```json
{
  "utterances": [
    {
      "utterance_id": "U001",
      "text": "修正後のテキスト",
      "pause_length_ms": 400
    }
  ]
}
```

- `text`: 1〜200文字
- `pause_length_ms`: 0〜2000の整数

**エラーコード**

| コード | HTTP | 説明 |
|---|---|---|
| `EDIT_NOT_ALLOWED` | 403 | voicevox_text.json 以外は書き込み不可 |
| `IF_MATCH_REQUIRED` | 400 | If-Match ヘッダーなし |
| `ETAG_MISMATCH` | 409 | ファイルが変更済み（再取得が必要） |

---

### /api/voicevox — VOICEVOX プロキシ

API サーバーから VOICEVOX Engine への透過プロキシ。タイムアウト付き。

| メソッド | パス | タイムアウト | 説明 |
|---|---|---|---|
| GET | `/api/voicevox/status` | 5秒 | エンジン状態確認（version を返す） |
| GET | `/api/voicevox/speakers` | 5秒 | 話者一覧取得 |
| GET | `/api/voicevox/speaker_info?speaker_uuid=...` | 5秒 | 話者詳細取得 |
| POST | `/api/voicevox/audio_query?text=...&speaker=...` | 15秒 | 音声クエリ生成 |
| POST | `/api/voicevox/synthesis?speaker=...` | 30秒 | 音声合成（WAV を返す） |
| POST | `/api/voicevox/mora_pitch?speaker=...` | 15秒 | モーラピッチ取得 |

**status レスポンス**
```json
{ "status": "running", "version": "0.25.0" }
```

エンジン未起動時は HTTP 503 + `VOICEVOX_ENGINE_UNAVAILABLE` エラーコード。

---

## WebSocket プロトコル

### 接続

```
WS /ws/pipeline/:jobId
```

### メッセージ形式（LogEntry）

```typescript
type LogEntry = {
  seq: number;                           // 通し番号（1始まり）
  type: "stdout" | "stderr" | "system";
  data: string;
  ts: string;                            // ISO 8601
  code?: number;                         // system イベントの終了コード
  cancelled?: boolean;                   // キャンセル時のみ
};
```

**例（stdout）**
```json
{ "seq": 1, "type": "stdout", "data": "Blueprint generation started", "ts": "2026-03-01T14:30:00Z" }
```

**例（system / 正常終了）**
```json
{ "seq": 42, "type": "system", "data": "Process exited", "ts": "2026-03-01T14:35:00Z", "code": 0 }
```

**例（system / キャンセル）**
```json
{ "seq": 20, "type": "system", "data": "Process exited", "ts": "...", "code": 1, "cancelled": true }
```

### ログの再生

接続時に直近 500 行（リングバッファ）を再送する。既にジョブが終了している場合は全ログを送信後、購読登録はしない。

### ジョブが見つからない場合

```json
{ "type": "system", "data": "Job not found: <jobId>", "ts": "...", "seq": 0 }
```

接続は即時クローズ（WebSocket 1008）。

---

## AllowedCommands 列挙

API で実行可能なコマンドを列挙型で制限する（ホワイトリスト方式）。

```typescript
const ALLOWED_COMMANDS = [
  // Layer 1
  "gen-blueprint", "gen-material", "gen-script", "gen-digest",
  // Layer 2
  "build-text", "patch-voicevox-text", "build-project",
  "build-audio", "build-all",
  // ユーティリティ
  "check-run", "prepare-run", "dict-sync",
] as const;
```

### 引数バリデーション規則

各コマンドに対して許可フラグと値の検証パターンを定義（`COMMAND_ARG_SPECS`）。

| パターン名 | 正規表現 |
|---|---|
| PROJECT_ID | `^[a-z0-9][a-z0-9_-]*$` |
| EPISODE_ID | `^E\d{2}$` |
| RUN_ID | `^run-\d{8}-\d{4}$` |
| RUN_DIR | `^data/projects/[a-z0-9][a-z0-9_-]*/run-\d{8}-\d{4}$` |
| SCRIPT_PATH | `^data/projects/.../script/E\d{2}_script\.md$` |
| VOICEVOX_TEXT | `^data/projects/.../voicevox_text/E\d{2}_voicevox_text(?:\.patched)?\.json$` |
| VVPROJ | `^data/projects/.../voicevox_project/E\d{2}\.vvproj$` |
| CONFIG_PATH | `configs/` から始まり `.json` で終わる相対パス |
| VOICEVOX_URL | `isAllowedVoicevoxUrl()`（ローカルアドレスのみ） |

未知のフラグは即座に拒否（HTTP 400 + `INVALID_ARGS`）。

---

## セキュリティ境界

- **パストラバーサル防止**: `safeResolve()` が全パスを検証。`..` / 絶対パス / `REPO_ROOT` 外への参照を拒否（403）
- **コマンドインジェクション防止**: `ALLOWED_COMMANDS` のホワイトリスト + 全引数の正規表現バリデーション
- **楽観的ロック**: `voicevox_text.json` 更新時の ETag 競合制御
- **レート制限**: パイプライン実行 10回/60秒
- **ジョブ同時実行**: 同時に1ジョブのみ（先行ジョブが running の間は 400）
- **ジョブタイムアウト**: 30分で自動キャンセル
- **ジョブ TTL**: 終了後 30分でメモリから削除

---

## 関連仕様

- [spec-02: Layer 2 パイプライン](./02-pipeline-layer2.md) — コマンドの詳細仕様
- [spec-04: 設定システム](./04-config-system.md) — /api/configs で操作する設定
- [spec-06: Runディレクトリ](./06-run-directory.md) — /api/runs の返すデータ構造
- [spec-08: Web UI](./08-web-ui.md) — このAPIを利用するフロントエンド
